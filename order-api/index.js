require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");

const { publishEvent } = require("./lib/rabbit");
const { query } = require("./lib/postgres");

const SERVICE_NAME = process.env.SERVICE_NAME || "order-api";

const app = express();
app.use(bodyParser.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok", service: SERVICE_NAME });
});

app.post("/orders", async (req, res) => {
  try {
    const { userId, showId, quantity } = req.body;

    if (!userId || !showId || !quantity) {
      return res.status(400).json({
        error: "userId, showId, quantity are required"
      });
    }

    const result = await query(
      `INSERT INTO orders (user_id, show_id, quantity, status)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [userId, showId, quantity, "PENDING"]
    );

    const orderId = result.rows[0].id;

    const payload = {
      type: "order.created",
      orderId,
      userId,
      showId,
      quantity,
      status: "PENDING"
    };

    const event = await publishEvent("order.created", payload);
    console.log("[order-api] Published order.created", event);

    res.status(202).json({ status: "accepted", orderId });
  } catch (err) {
    console.error("[order-api] Error in /orders", err);
    res.status(500).json({ error: "internal_error" });
  }
});

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`[order-api] Listening on port ${port}`);
});
