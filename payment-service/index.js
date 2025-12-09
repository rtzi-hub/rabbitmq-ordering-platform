require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const { getChannel, publishEvent } = require("./lib/rabbit");
const { query, pool } = require("./lib/postgres");

const SERVICE_NAME = process.env.SERVICE_NAME || "payment-service";
const PREFETCH = parseInt(process.env.RABBITMQ_PREFETCH || "10", 10);
const HTTP_PORT = process.env.HTTP_PORT || 8081;

const app = express();
app.use(bodyParser.json());

/**
 * Small helper for DB transactions
 */
async function withTx(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (_) {
      // ignore rollback errors
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * RabbitMQ consumer:
 *  - listens to `order.created`
 *  - creates PENDING payments
 */
async function startConsumer() {
  const channel = await getChannel();
  await channel.prefetch(PREFETCH);

  const eventsExchange = process.env.RABBITMQ_EXCHANGE_EVENTS || "events.topic";
  const dlxExchange = process.env.RABBITMQ_EXCHANGE_DLX || "dlx.direct";
  const queueName = "payment.order-created.q";

  await channel.assertQueue(queueName, {
    durable: true,
    arguments: {
      "x-dead-letter-exchange": dlxExchange,
      "x-dead-letter-routing-key": "events.dlq",
    },
  });

  await channel.bindQueue(queueName, eventsExchange, "order.created");

  console.log(`[${SERVICE_NAME}] Waiting on ${queueName}`);

  channel.consume(queueName, async (msg) => {
    if (!msg) return;

    try {
      const content = JSON.parse(msg.content.toString());
      console.log(`[${SERVICE_NAME}] order.created`, content);

      const { messageId, orderId, userId, showId, quantity } = content;

      // Idempotency: skip if message_id already exists
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

      // Create PENDING payment row
      await query(
        `INSERT INTO payments (order_id, user_id, amount, status, message_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [orderId, userId, quantity * 100, "PENDING", messageId]
      );

      // Optionally you could also create an “authorization” event here.
      console.log(
        `[${SERVICE_NAME}] Created PENDING payment for order ${orderId}`
      );

      channel.ack(msg);
    } catch (err) {
      console.error(`[${SERVICE_NAME}] error in consumer`, err);
      channel.nack(msg, false, false);
    }
  });
}

/**
 * Health check
 */
app.get("/health", (req, res) => {
  res.json({ status: "ok", service: SERVICE_NAME });
});

/**
 * List latest payments (for debugging / UI)
 */
app.get("/payments", async (req, res) => {
  try {
    const result = await query(
      `SELECT id, order_id, user_id, amount, status, message_id, created_at
       FROM payments
       ORDER BY id DESC
       LIMIT 50`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(`[${SERVICE_NAME}] Error in GET /payments`, err);
    res.status(500).json({ error: "internal_error" });
  }
});

/**
 * Approve payment:
 *  - payments.status = SUCCEEDED
 *  - orders.status   = CONFIRMED
 *  - inventory_reservations.status = COMMITTED
 *  - emits payment.succeeded
 */
app.post("/payments/:orderId/approve", async (req, res) => {
  const orderId = parseInt(req.params.orderId, 10);

  try {
    await withTx(async (client) => {
      const pmt = await client.query(
        `SELECT * FROM payments WHERE order_id = $1 FOR UPDATE`,
        [orderId]
      );

      if (pmt.rowCount === 0) {
        const err = new Error("payment_not_found");
        err.statusCode = 404;
        throw err;
      }

      const payment = pmt.rows[0];

      if (payment.status !== "PENDING") {
        const err = new Error("payment_already_processed");
        err.statusCode = 400;
        throw err;
      }

      // Update payment + order + reservation
      await client.query(
        `UPDATE payments SET status = 'SUCCEEDED' WHERE order_id = $1`,
        [orderId]
      );

      const orderResult = await client.query(
        `UPDATE orders
           SET status = 'CONFIRMED'
         WHERE id = $1
         RETURNING user_id, show_id, quantity`,
        [orderId]
      );

      await client.query(
        `UPDATE inventory_reservations
           SET status = 'COMMITTED'
         WHERE order_id = $1`,
        [orderId]
      );

      const order = orderResult.rows[0];

      // After DB commit: publish event
      // (we don't await inside the tx)
      setImmediate(async () => {
        try {
          await publishEvent("payment.succeeded", {
            type: "payment.succeeded",
            orderId,
            userId: order.user_id,
            showId: order.show_id,
            quantity: order.quantity,
          });
        } catch (e) {
          console.error(
            `[${SERVICE_NAME}] Failed to publish payment.succeeded`,
            e
          );
        }
      });
    });

    res.json({ status: "ok", orderId });
  } catch (err) {
    console.error(`[${SERVICE_NAME}] approve error`, err);
    res
      .status(err.statusCode || 500)
      .json({ error: err.message || "internal_error" });
  }
});

/**
 * Reject payment:
 *  - payments.status = FAILED
 *  - orders.status   = CANCELLED
 *  - inventory_reservations.status = EXPIRED
 *  - emits payment.failed
 */
app.post("/payments/:orderId/reject", async (req, res) => {
  const orderId = parseInt(req.params.orderId, 10);

  try {
    await withTx(async (client) => {
      const pmt = await client.query(
        `SELECT * FROM payments WHERE order_id = $1 FOR UPDATE`,
        [orderId]
      );

      if (pmt.rowCount === 0) {
        const err = new Error("payment_not_found");
        err.statusCode = 404;
        throw err;
      }

      const payment = pmt.rows[0];

      if (payment.status !== "PENDING") {
        const err = new Error("payment_already_processed");
        err.statusCode = 400;
        throw err;
      }

      await client.query(
        `UPDATE payments SET status = 'FAILED' WHERE order_id = $1`,
        [orderId]
      );

      const orderResult = await client.query(
        `UPDATE orders
           SET status = 'CANCELLED'
         WHERE id = $1
         RETURNING user_id, show_id, quantity`,
        [orderId]
      );

      await client.query(
        `UPDATE inventory_reservations
           SET status = 'EXPIRED'
         WHERE order_id = $1`,
        [orderId]
      );

      const order = orderResult.rows[0];

      setImmediate(async () => {
        try {
          await publishEvent("payment.failed", {
            type: "payment.failed",
            orderId,
            userId: order.user_id,
            showId: order.show_id,
            quantity: order.quantity,
            reason: "MANUAL_REJECTION",
          });
        } catch (e) {
          console.error(
            `[${SERVICE_NAME}] Failed to publish payment.failed`,
            e
          );
        }
      });
    });

    res.json({ status: "rejected", orderId });
  } catch (err) {
    console.error(`[${SERVICE_NAME}] reject error`, err);
    res
      .status(err.statusCode || 500)
      .json({ error: err.message || "internal_error" });
  }
});

app.listen(HTTP_PORT, () => {
  console.log(`[${SERVICE_NAME}] HTTP API listening on ${HTTP_PORT}`);
});

// Start the consumer in the background
startConsumer().catch((err) => {
  console.error(`[${SERVICE_NAME}] Fatal`, err);
  process.exit(1);
});
