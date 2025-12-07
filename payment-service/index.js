require("dotenv").config();
const { getChannel, publishEvent } = require("./lib/rabbit");
const { query } = require("./lib/postgres");

const SERVICE_NAME = process.env.SERVICE_NAME || "payment-service";
const PREFETCH = parseInt(process.env.RABBITMQ_PREFETCH || "10", 10);

async function start() {
  const channel = await getChannel();
  await channel.prefetch(PREFETCH);

  const eventsExchange = process.env.RABBITMQ_EXCHANGE_EVENTS || "events.topic";
  const dlxExchange = process.env.RABBITMQ_EXCHANGE_DLX || "dlx.direct";

  const queueName = "payment.order-created.q";

  await channel.assertQueue(queueName, {
    durable: true,
    arguments: {
      "x-dead-letter-exchange": dlxExchange,
      "x-dead-letter-routing-key": "events.dlq"
    }
  });

  await channel.bindQueue(queueName, eventsExchange, "order.created");

  console.log(`[${SERVICE_NAME}] Waiting on ${queueName}`);

  channel.consume(queueName, async (msg) => {
    if (!msg) return;

    try {
      const content = JSON.parse(msg.content.toString());
      console.log(`[${SERVICE_NAME}] order.created`, content);

      const { messageId, orderId, userId, showId, quantity } = content;

      const existing = await query(
        "SELECT 1 FROM payments WHERE message_id = $1",
        [messageId]
      );
      if (existing.rowCount > 0) {
        console.log(
          `[${SERVICE_NAME}] message ${messageId} already processed`
        );
        channel.ack(msg);
        return;
      }

      const success = Math.random() < 0.8;
      const status = success ? "SUCCEEDED" : "FAILED";

      await query(
        `INSERT INTO payments (order_id, user_id, amount, status, message_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [orderId, userId, quantity * 100, status, messageId]
      );

      if (success) {
        await publishEvent("payment.succeeded", {
          type: "payment.succeeded",
          orderId,
          userId,
          showId,
          quantity
        });
      } else {
        await publishEvent("payment.failed", {
          type: "payment.failed",
          orderId,
          userId,
          showId,
          quantity,
          reason: "PAYMENT_GATEWAY_ERROR"
        });
      }

      channel.ack(msg);
    } catch (err) {
      console.error(`[${SERVICE_NAME}] error`, err);
      channel.nack(msg, false, false);
    }
  });
}

start().catch((err) => {
  console.error(`[${SERVICE_NAME}] Fatal`, err);
  process.exit(1);
});
