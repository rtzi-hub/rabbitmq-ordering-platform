// lib/rabbit.js
"use strict";

const amqp = require("amqplib");
const crypto = require("crypto");

let connection = null;
let connectionPromise = null;

let consumerChannel = null;
let consumerChannelPromise = null;

let publisherChannel = null; // confirm channel
let publisherChannelPromise = null;

function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

function buildAmqpUrl() {
  const host = process.env.RABBITMQ_HOST || "localhost";
  const port = process.env.RABBITMQ_PORT || "5672";
  const user =
    process.env.RABBITMQ_USERNAME || process.env.RABBITMQ_USER || "guest";
  const pass =
    process.env.RABBITMQ_PASSWORD || process.env.RABBITMQ_PASS || "guest";

  const base =
    process.env.RABBITMQ_URL || `amqp://${user}:${pass}@${host}:${port}`;
  const vhost = process.env.RABBITMQ_VHOST || "/";

  let u;
  try {
    u = new URL(base);
  } catch (_) {
    return base; // fallback
  }

  const vhostPath = vhost === "/" ? "/" : `/${vhost.replace(/^\//, "")}`;
  if (!u.pathname || u.pathname === "/" || u.pathname === "") {
    u.pathname = vhostPath;
  }

  return u.toString();
}

function resetState() {
  connection = null;
  connectionPromise = null;

  consumerChannel = null;
  consumerChannelPromise = null;

  publisherChannel = null;
  publisherChannelPromise = null;
}

async function getConnection() {
  if (connection) return connection;
  if (connectionPromise) return connectionPromise;

  const url = buildAmqpUrl();

  connectionPromise = amqp
    .connect(url, {
      heartbeat: 30,
      clientProperties: {
        connection_name:
          process.env.SERVICE_NAME ||
          process.env.npm_package_name ||
          "node-service",
      },
    })
    .then((conn) => {
      connection = conn;

      conn.on("error", (err) => {
        console.error("[rabbit] connection error:", err?.message || err);
      });

      conn.on("close", () => {
        console.warn("[rabbit] connection closed, will reconnect on next use");
        resetState();
      });

      return conn;
    })
    .catch((err) => {
      resetState();
      throw err;
    });

  return connectionPromise;
}

async function assertExchanges(ch) {
  const eventsExchange = process.env.RABBITMQ_EXCHANGE_EVENTS || "events.topic";
  const dlxExchange = process.env.RABBITMQ_EXCHANGE_DLX || "dlx.direct";

  await ch.assertExchange(eventsExchange, "topic", { durable: true });
  await ch.assertExchange(dlxExchange, "direct", { durable: true });
}

/**
 * Consumer channel (regular channel) - use for consuming / queue ops.
 */
async function getChannel() {
  if (consumerChannel) return consumerChannel;
  if (consumerChannelPromise) return consumerChannelPromise;

  consumerChannelPromise = (async () => {
    const conn = await getConnection();
    const ch = await conn.createChannel();

    ch.on("error", (err) => {
      console.error("[rabbit] consumer channel error:", err?.message || err);
    });

    ch.on("close", () => {
      console.warn("[rabbit] consumer channel closed, will recreate on next use");
      consumerChannel = null;
      consumerChannelPromise = null;
    });

    await assertExchanges(ch);

    consumerChannel = ch;
    return ch;
  })();

  return consumerChannelPromise;
}

/**
 * Publisher channel (confirm channel) - safer publishing with broker confirms.
 */
async function getPublisherChannel() {
  if (publisherChannel) return publisherChannel;
  if (publisherChannelPromise) return publisherChannelPromise;

  publisherChannelPromise = (async () => {
    const conn = await getConnection();
    const ch = await conn.createConfirmChannel();

    // IMPORTANT: if we publish with "mandatory: true" and the message is unroutable,
    // RabbitMQ returns it. We log it here (production-safe visibility).
    ch.on("return", (msg) => {
      const rk = msg?.fields?.routingKey;
      const ex = msg?.fields?.exchange;
      const mid = msg?.properties?.messageId;
      console.error(
        "[rabbit] UNROUTABLE (returned to publisher)",
        "exchange=", ex,
        "rk=", rk,
        "messageId=", mid
      );
    });

    ch.on("error", (err) => {
      console.error("[rabbit] publisher channel error:", err?.message || err);
    });

    ch.on("close", () => {
      console.warn("[rabbit] publisher channel closed, will recreate on next use");
      publisherChannel = null;
      publisherChannelPromise = null;
    });

    await assertExchanges(ch);

    publisherChannel = ch;
    return ch;
  })();

  return publisherChannelPromise;
}

async function publishEvent(routingKey, payload = {}, options = {}) {
  const ch = await getPublisherChannel();
  const exchange = process.env.RABBITMQ_EXCHANGE_EVENTS || "events.topic";

  const messageId = payload.messageId || uuid();

  const message = {
    messageId,
    createdAt: new Date().toISOString(),
    ...payload,
  };

  const buffer = Buffer.from(JSON.stringify(message));

  const mandatoryDefault = process.env.RABBITMQ_PUBLISH_MANDATORY !== "false"; // default TRUE
  const waitConfirmsDefault = process.env.RABBITMQ_WAIT_FOR_CONFIRMS !== "false"; // default TRUE

  const ok = ch.publish(exchange, routingKey, buffer, {
    contentType: "application/json",
    deliveryMode: 2, // persistent
    messageId, // AMQP property
    correlationId: options.correlationId || messageId,
    timestamp: Date.now(),
    mandatory: options.mandatory ?? mandatoryDefault, // ✅ prevents silent drop
    ...options,
  });

  if (!ok) {
    console.warn("[rabbit] publish returned false (backpressure) for", routingKey);
  }

  if (waitConfirmsDefault) {
    await ch.waitForConfirms(); // ✅ confirm publish accepted by broker
  }

  return message;
}

async function closeRabbit() {
  try {
    if (consumerChannel) await consumerChannel.close();
  } catch (_) {}
  try {
    if (publisherChannel) await publisherChannel.close();
  } catch (_) {}
  try {
    if (connection) await connection.close();
  } catch (_) {}

  resetState();
}

module.exports = {
  getChannel,
  publishEvent,
  closeRabbit,
};
