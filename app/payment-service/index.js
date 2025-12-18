// payment-service/index.js
"use strict";

require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");

const { getChannel, getPublisherChannel, publishEvent, closeRabbit } = require("./lib/rabbit");
const {
    ensureBaseTopology,
    ensureOrderCreatedQueue,
    ensurePaymentEventsQueue,
} = require("./lib/rabbit-topology");
const { query, pool } = require("./lib/postgres");

const SERVICE_NAME = process.env.SERVICE_NAME || "payment-service";
const PREFETCH = parseInt(process.env.RABBITMQ_PREFETCH || "10", 10);
const HTTP_PORT = process.env.HTTP_PORT || 8081;

const app = express();
app.use(bodyParser.json());

async function withTx(fn) {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const result = await fn(client);
        await client.query("COMMIT");
        return result;
    } catch (err) {
        try { await client.query("ROLLBACK"); } catch (_) { }
        throw err;
    } finally {
        client.release();
    }
}

/**
 * MAIN CONSUMER: order.created -> create PENDING payment (idempotent by messageId)
 */
async function startOrderCreatedConsumer() {
    const ch = await getChannel();
    await ch.prefetch(PREFETCH);

    const eventsExchange = process.env.RABBITMQ_EXCHANGE_EVENTS || "events.topic";
    const dlxExchange = process.env.RABBITMQ_EXCHANGE_DLX || "dlx.direct";
    const queueName = "payment.order-created.q";

    await ch.assertQueue(queueName, {
        durable: true,
        arguments: {
            "x-dead-letter-exchange": dlxExchange,
            "x-dead-letter-routing-key": "events.dlq",
        },
    });

    await ch.bindQueue(queueName, eventsExchange, "order.created");
    console.log(`[${SERVICE_NAME}] Waiting on ${queueName}`);

    ch.consume(queueName, async (msg) => {
        if (!msg) return;

        try {
            const content = JSON.parse(msg.content.toString());

            const { messageId, orderId, userId, quantity } = content;
            if (!messageId || !orderId || !userId || !quantity) {
                console.warn(`[${SERVICE_NAME}] invalid payload -> DLQ`);
                ch.nack(msg, false, false);
                return;
            }

            // PRODUCTION NOTE:
            // Add UNIQUE(payments.message_id) in DB, then use ON CONFLICT DO NOTHING.
            await query(
                `INSERT INTO payments (order_id, user_id, amount, status, message_id)
         VALUES ($1, $2, $3, 'PENDING', $4)
         ON CONFLICT (message_id) DO NOTHING`,
                [orderId, userId, quantity * 100, messageId]
            );

            ch.ack(msg);
        } catch (err) {
            console.error(`[${SERVICE_NAME}] consumer error`, err);
            ch.nack(msg, false, false); // to DLQ
        }
    });
}

/**
 * OPTIONAL: consume payment.* events (only if you enable the queue)
 * Enable:
 *   ENABLE_PAYMENT_EVENTS_QUEUE=true
 *   ENABLE_PAYMENT_EVENTS_CONSUMER=true
 */
async function startPaymentEventsConsumer() {
    if (process.env.ENABLE_PAYMENT_EVENTS_CONSUMER !== "true") return;

    const ch = await getChannel();
    await ch.prefetch(50);

    const queueName = "payment.events.q";

    console.log(`[${SERVICE_NAME}] Payment events consumer enabled on ${queueName}`);

    ch.consume(queueName, async (msg) => {
        if (!msg) return;
        try {
            const content = JSON.parse(msg.content.toString());
            console.log(`[${SERVICE_NAME}] payment.* event`, content);
            ch.ack(msg);
        } catch (err) {
            console.error(`[${SERVICE_NAME}] payment.* consumer error`, err);
            ch.nack(msg, false, false);
        }
    });
}

app.get("/health", (req, res) => {
    res.json({ status: "ok", service: SERVICE_NAME });
});

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

app.post("/payments/:orderId/approve", async (req, res) => {
    const orderId = parseInt(req.params.orderId, 10);
    if (Number.isNaN(orderId)) return res.status(400).json({ error: "invalid_order_id" });

    try {
        let orderForEvent = null;

        await withTx(async (client) => {
            const pmt = await client.query(
                `SELECT * FROM payments WHERE order_id = $1 FOR UPDATE`,
                [orderId]
            );
            if (pmt.rowCount === 0) {
                const e = new Error("payment_not_found");
                e.statusCode = 404;
                throw e;
            }
            if (pmt.rows[0].status !== "PENDING") {
                const e = new Error("payment_already_processed");
                e.statusCode = 400;
                throw e;
            }

            await client.query(
                `UPDATE payments SET status='SUCCEEDED' WHERE order_id=$1`,
                [orderId]
            );

            const orderResult = await client.query(
                `UPDATE orders SET status='CONFIRMED'
         WHERE id=$1
         RETURNING id, user_id, show_id, quantity`,
                [orderId]
            );
            if (orderResult.rowCount === 0) {
                const e = new Error("order_not_found");
                e.statusCode = 404;
                throw e;
            }
            orderForEvent = orderResult.rows[0];

            await client.query(
                `UPDATE inventory_reservations
         SET status='COMMITTED'
         WHERE order_id=$1 AND status='RESERVED'`,
                [orderId]
            );
        });

        // Publish after commit
        await publishEvent("payment.succeeded", {
            type: "payment.succeeded",
            orderId: orderForEvent.id,
            userId: orderForEvent.user_id,
            showId: orderForEvent.show_id,
            quantity: orderForEvent.quantity,
        });

        res.json({ status: "ok", orderId });
    } catch (err) {
        console.error(`[${SERVICE_NAME}] approve error`, err);
        res.status(err.statusCode || 500).json({ error: err.message || "internal_error" });
    }
});

app.post("/payments/:orderId/reject", async (req, res) => {
    const orderId = parseInt(req.params.orderId, 10);
    if (Number.isNaN(orderId)) return res.status(400).json({ error: "invalid_order_id" });

    try {
        let orderForEvent = null;

        await withTx(async (client) => {
            const pmt = await client.query(
                `SELECT * FROM payments WHERE order_id = $1 FOR UPDATE`,
                [orderId]
            );
            if (pmt.rowCount === 0) {
                const e = new Error("payment_not_found");
                e.statusCode = 404;
                throw e;
            }
            if (pmt.rows[0].status !== "PENDING") {
                const e = new Error("payment_already_processed");
                e.statusCode = 400;
                throw e;
            }

            await client.query(
                `UPDATE payments SET status='FAILED' WHERE order_id=$1`,
                [orderId]
            );

            const orderResult = await client.query(
                `UPDATE orders SET status='CANCELLED'
         WHERE id=$1
         RETURNING id, user_id, show_id, quantity`,
                [orderId]
            );
            if (orderResult.rowCount === 0) {
                const e = new Error("order_not_found");
                e.statusCode = 404;
                throw e;
            }
            orderForEvent = orderResult.rows[0];

            await client.query(
                `UPDATE inventory_reservations
         SET status='EXPIRED'
         WHERE order_id=$1 AND status='RESERVED'`,
                [orderId]
            );
        });

        await publishEvent("payment.failed", {
            type: "payment.failed",
            orderId: orderForEvent.id,
            userId: orderForEvent.user_id,
            showId: orderForEvent.show_id,
            quantity: orderForEvent.quantity,
            reason: "MANUAL_REJECTION",
        });

        res.json({ status: "rejected", orderId });
    } catch (err) {
        console.error(`[${SERVICE_NAME}] reject error`, err);
        res.status(err.statusCode || 500).json({ error: err.message || "internal_error" });
    }
});

async function start() {
    // 1) exchanges + DLQ
    await ensureBaseTopology();
    await ensureOrderCreatedQueue();
    await ensurePaymentEventsQueue();

    // 2) Pre-initialize publisher channel to avoid delays on first publish
    try {
        await getPublisherChannel();
        console.log(`[${SERVICE_NAME}] Publisher channel initialized`);
    } catch (err) {
        console.error(`[${SERVICE_NAME}] Failed to initialize publisher channel:`, err);
        // Continue anyway - channel will be created on first use
    }

    // 3) Start consumers
    await startOrderCreatedConsumer();
    await startPaymentEventsConsumer();

    // 4) HTTP
    const server = app.listen(HTTP_PORT, () => {
        console.log(`[${SERVICE_NAME}] HTTP API listening on ${HTTP_PORT}`);
    });

    // Graceful shutdown
    const shutdown = async () => {
        console.log(`[${SERVICE_NAME}] shutting down...`);
        server.close(() => { });
        await closeRabbit();
        process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
}

start().catch((err) => {
    console.error(`[${SERVICE_NAME}] Fatal startup error`, err);
    process.exit(1);
});
