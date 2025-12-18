// lib/rabbit.js
"use strict";

const amqp = require("amqplib");
const crypto = require("crypto");

let connection = null;
let connectionPromise = null;

let consumerChannel = null;
let consumerChannelPromise = null;

let publisherChannel = null;
let publisherChannelPromise = null;

// Track publishes so we can fail fast on "return" (unroutable)
const pendingPublishes = new Map();

function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

function buildAmqpUrl() {
  const host = process.env.RABBITMQ_HOST || "localhost";
  const port = process.env.RABBITMQ_PORT || "5672";
  const user = process.env.RABBITMQ_USERNAME || process.env.RABBITMQ_USER || "guest";
  const pass = process.env.RABBITMQ_PASSWORD || process.env.RABBITMQ_PASS || "guest";

  const base = process.env.RABBITMQ_URL || `amqp://${user}:${pass}@${host}:${port}`;
  const vhost = process.env.RABBITMQ_VHOST || "/";

  let u;
  try {
    u = new URL(base);
  } catch (_) {
    return base;
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

  // fail any inflight publishes
  for (const [, p] of pendingPublishes) {
    try {
      p.reject(new Error("rabbitmq_connection_reset"));
    } catch (_) {}
  }
  pendingPublishes.clear();
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

    consumerChannel = ch;
    return ch;
  })();

  return consumerChannelPromise;
}

async function getPublisherChannel() {
  if (publisherChannel) return publisherChannel;
  if (publisherChannelPromise) return publisherChannelPromise;

  publisherChannelPromise = (async () => {
    const conn = await getConnection();
    const ch = await conn.createConfirmChannel();

    ch.on("error", (err) => {
      console.error("[rabbit] publisher channel error:", err?.message || err);
    });

    ch.on("close", () => {
      console.warn("[rabbit] publisher channel closed, will recreate on next use");
      publisherChannel = null;
      publisherChannelPromise = null;
    });

    // Fired when "mandatory" publish has no route
    ch.on("return", (msg) => {
      const exchange = msg?.fields?.exchange;
      const rk = msg?.fields?.routingKey;
      const messageId = msg?.properties?.messageId;

      console.error(
        "[rabbit] UNROUTABLE (returned to publisher)",
        "exchange=",
        exchange,
        "rk=",
        rk,
        "messageId=",
        messageId
      );

      if (messageId && pendingPublishes.has(messageId)) {
        const p = pendingPublishes.get(messageId);
        pendingPublishes.delete(messageId);
        p.reject(new Error(`unroutable exchange=${exchange} rk=${rk} messageId=${messageId}`));
      }
    });

    publisherChannel = ch;
    return ch;
  })();

  return publisherChannelPromise;
}

async function publishEvent(routingKey, payload = {}, options = {}) {
  const ch = await getPublisherChannel();
  const exchange = process.env.RABBITMQ_EXCHANGE_EVENTS || "events.topic";

  const messageId = payload.messageId || uuid();
  const correlationId = options.correlationId || messageId;

  const message = {
    messageId,
    createdAt: new Date().toISOString(),
    ...payload,
  };

  const buffer = Buffer.from(JSON.stringify(message));

  const mandatory =
    options.mandatory ??
    (process.env.RABBITMQ_PUBLISH_MANDATORY === "true"); // default: false unless enabled

  return await new Promise((resolve, reject) => {
    pendingPublishes.set(messageId, { resolve, reject });

    const ok = ch.publish(
      exchange,
      routingKey,
      buffer,
      {
        contentType: "application/json",
        deliveryMode: 2,
        messageId,
        correlationId,
        timestamp: Date.now(),
        mandatory,
        ...options,
      },
      (err) => {
        // broker confirm callback
        if (pendingPublishes.has(messageId)) pendingPublishes.delete(messageId);

        if (err) return reject(err);
        resolve(message);
      }
    );

    if (!ok) {
      console.warn("[rabbit] publish backpressure (buffer full) for", routingKey);
    }
  });
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
