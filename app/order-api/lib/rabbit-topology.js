// lib/rabbit-topology.js
"use strict";

const { getChannel } = require("./rabbit");

const EVENTS_EXCHANGE = process.env.RABBITMQ_EXCHANGE_EVENTS || "events.topic";
const DLX_EXCHANGE = process.env.RABBITMQ_EXCHANGE_DLX || "dlx.direct";

const ORDER_CREATED_QUEUE =
  process.env.RABBITMQ_ORDER_CREATED_QUEUE || "payment.order-created.q";

const PAYMENT_EVENTS_QUEUE =
  process.env.RABBITMQ_PAYMENT_EVENTS_QUEUE || "payment.events.q";

const DLQ_QUEUE = process.env.RABBITMQ_DLQ_QUEUE || "events.dlq.q";
const DLQ_ROUTING_KEY = process.env.RABBITMQ_DLQ_ROUTING_KEY || "events.dlq";

async function ensureBaseTopology() {
  const ch = await getChannel();

  // Exchanges
  await ch.assertExchange(EVENTS_EXCHANGE, "topic", { durable: true });
  await ch.assertExchange(DLX_EXCHANGE, "direct", { durable: true });

  // DLQ queue
  await ch.assertQueue(DLQ_QUEUE, { durable: true });
  await ch.bindQueue(DLQ_QUEUE, DLX_EXCHANGE, DLQ_ROUTING_KEY);
}

/**
 * Ensure the queue that receives order.created exists BEFORE publishers run.
 * This prevents early "dropped/unroutable" order.created messages.
 */
async function ensureOrderCreatedQueue() {
  const ch = await getChannel();

  await ch.assertQueue(ORDER_CREATED_QUEUE, {
    durable: true,
    arguments: {
      "x-dead-letter-exchange": DLX_EXCHANGE,
      "x-dead-letter-routing-key": DLQ_ROUTING_KEY,
    },
  });

  await ch.bindQueue(ORDER_CREATED_QUEUE, EVENTS_EXCHANGE, "order.created");
}

/**
 * Create a queue bound to payment.* so payment.succeeded/payment.failed are routable.
 * Enable by setting: ENABLE_PAYMENT_EVENTS_QUEUE=true
 *
 * You can consume it or keep it as an "audit" queue (messages will accumulate unless TTL/consumer).
 */
async function ensurePaymentEventsQueue() {
  if (process.env.ENABLE_PAYMENT_EVENTS_QUEUE !== "true") return;

  const ch = await getChannel();

  const ttlMs = parseInt(process.env.PAYMENT_EVENTS_TTL_MS || "0", 10);

  const args = {
    "x-dead-letter-exchange": DLX_EXCHANGE,
    "x-dead-letter-routing-key": DLQ_ROUTING_KEY,
  };

  // Optional safety: auto-expire messages in this queue (audit style)
  if (!Number.isNaN(ttlMs) && ttlMs > 0) {
    args["x-message-ttl"] = ttlMs;
  }

  await ch.assertQueue(PAYMENT_EVENTS_QUEUE, {
    durable: true,
    arguments: args,
  });

  await ch.bindQueue(PAYMENT_EVENTS_QUEUE, EVENTS_EXCHANGE, "payment.*");
}

module.exports = {
  ensureBaseTopology,
  ensureOrderCreatedQueue,
  ensurePaymentEventsQueue,
};
