// lib/rabbit-topology.js
"use strict";

const { getChannel } = require("./rabbit");

async function ensureBaseTopology() {
  const ch = await getChannel();

  const dlxExchange = process.env.RABBITMQ_EXCHANGE_DLX || "dlx.direct";

  // Global DLQ queue (dead-letter target)
  await ch.assertQueue("events.dlq", { durable: true });
  await ch.bindQueue("events.dlq", dlxExchange, "events.dlq");
}

/**
 * Optional: create a queue for payment events when you NEED it.
 * This makes payment.succeeded/payment.failed routable.
 *
 * Enable by setting: ENABLE_PAYMENT_EVENTS_QUEUE=true
 */
async function ensurePaymentEventsQueue() {
  if (process.env.ENABLE_PAYMENT_EVENTS_QUEUE !== "true") return;

  const ch = await getChannel();

  const eventsExchange = process.env.RABBITMQ_EXCHANGE_EVENTS || "events.topic";
  const dlxExchange = process.env.RABBITMQ_EXCHANGE_DLX || "dlx.direct";

  const queueName = "payment.events.q";

  await ch.assertQueue(queueName, {
    durable: true,
    arguments: {
      "x-dead-letter-exchange": dlxExchange,
      "x-dead-letter-routing-key": "events.dlq",

      // Production safety so the queue doesn't grow forever if nobody consumes
      "x-message-ttl": 24 * 60 * 60 * 1000, // 24h
      "x-max-length": 100000,
      "x-overflow": "drop-head",
    },
  });

  // Bind payment.* so payment.succeeded + payment.failed are routable
  await ch.bindQueue(queueName, eventsExchange, "payment.*");
}

module.exports = {
  ensureBaseTopology,
  ensurePaymentEventsQueue,
};
