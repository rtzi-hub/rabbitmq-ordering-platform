require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");

const { publishEvent } = require("./lib/rabbit");
const { query, pool } = require("./lib/postgres");

const SERVICE_NAME = process.env.SERVICE_NAME || "order-api";

const app = express();
app.use(bodyParser.json());

/**
 * Health check
 */
app.get("/health", (req, res) => {
  res.json({ status: "ok", service: SERVICE_NAME });
});

/**
 * Modern Dev Dashboard (HTML)
 */
app.get("/", async (req, res) => {
  try {
    const showsResult = await query(
      `SELECT id, name, venue, starts_at, capacity, created_at
       FROM shows
       ORDER BY id ASC`
    );

    const ordersResult = await query(
      `SELECT
         o.id,
         o.user_id,
         o.show_id,
         o.quantity,
         o.status        AS order_status,
         o.created_at    AS order_created_at,
         p.status        AS payment_status,
         p.amount        AS payment_amount,
         p.created_at    AS payment_created_at
       FROM orders o
       LEFT JOIN payments p
         ON p.order_id = o.id
       ORDER BY o.id DESC
       LIMIT 50`
    );

    const shows = showsResult.rows;
    const orders = ordersResult.rows;

    const totalOrders = orders.length;
    const succeededPayments = orders.filter(
      (o) => o.payment_status === "SUCCEEDED"
    ).length;
    const failedPayments = orders.filter(
      (o) => o.payment_status === "FAILED"
    ).length;
    const pendingPayments =
      totalOrders - succeededPayments - failedPayments;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Ordering Platform · Dev Dashboard</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    :root {
      color-scheme: dark;
      --bg: #020617;
      --bg-soft: #020617;
      --surface: #020617;
      --surface-soft: #020617;
      --border-subtle: #1f2937;
      --accent: #38bdf8;
      --accent-soft: rgba(56,189,248,0.12);
      --accent-strong: rgba(56,189,248,0.22);
      --text-main: #e5e7eb;
      --text-muted: #9ca3af;
      --danger: #f97373;
      --success: #4ade80;
      --warning: #eab308;
    }
    * {
      box-sizing: border-box;
    }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background:
        radial-gradient(circle at top left, rgba(56,189,248,0.14), transparent 55%),
        radial-gradient(circle at top right, rgba(147,51,234,0.18), transparent 55%),
        #020617;
      color: var(--text-main);
      padding: 24px;
      display: flex;
      justify-content: center;
    }
    .shell {
      width: 100%;
      max-width: 1120px;
      margin: 0 auto;
    }
    header {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-bottom: 20px;
    }
    .title-row {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
    }
    h1 {
      margin: 0;
      font-size: 26px;
      letter-spacing: 0.03em;
      background: linear-gradient(to right, #38bdf8, #a855f7);
      -webkit-background-clip: text;
      color: transparent;
    }
    .badge {
      padding: 4px 10px;
      border-radius: 999px;
      border: 1px solid rgba(148,163,184,0.4);
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: var(--text-muted);
      background: rgba(15,23,42,0.8);
      backdrop-filter: blur(14px);
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .badge-dot {
      width: 7px;
      height: 7px;
      border-radius: 999px;
      background: #22c55e;
      box-shadow: 0 0 8px rgba(34,197,94,0.9);
    }
    .subtitle {
      margin: 0;
      font-size: 13px;
      color: var(--text-muted);
    }
    .subtitle code {
      background: rgba(15,23,42,0.8);
      border-radius: 4px;
      padding: 1px 6px;
      font-size: 12px;
      border: 1px solid rgba(31,41,55,0.9);
    }
    .grid {
      display: grid;
      grid-template-columns: minmax(0, 1.05fr) minmax(0, 1.45fr);
      gap: 20px;
      margin-top: 18px;
    }
    .card {
      background: radial-gradient(circle at top, rgba(15,23,42,0.9), #020617);
      border-radius: 14px;
      padding: 14px 14px 10px;
      border: 1px solid rgba(31,41,55,0.9);
      box-shadow:
        0 16px 40px rgba(0,0,0,0.55),
        0 0 0 1px rgba(15,23,42,0.9) inset;
      position: relative;
      overflow: hidden;
    }
    .card::before {
      content: "";
      position: absolute;
      inset: 0;
      background:
        radial-gradient(circle at top right, rgba(56,189,248,0.15), transparent 55%);
      opacity: 0.75;
      pointer-events: none;
    }
    .card > * {
      position: relative;
      z-index: 1;
    }
    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 6px;
      margin-bottom: 6px;
    }
    .card-title {
      margin: 0;
      font-size: 15px;
      letter-spacing: 0.03em;
    }
    .card-subtitle {
      margin: 0;
      font-size: 11px;
      color: var(--text-muted);
    }
    .card-subtitle code {
      background: rgba(15,23,42,0.9);
      padding: 1px 5px;
      border-radius: 4px;
      border: 1px solid rgba(31,41,55,0.8);
      font-size: 11px;
    }
    .pill {
      font-size: 11px;
      color: var(--text-muted);
      background: rgba(15,23,42,0.9);
      padding: 3px 8px;
      border-radius: 999px;
      border: 1px solid rgba(31,41,55,0.9);
    }
    .stats-row {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 10px;
    }
    .stat-chip {
      flex: 0 0 auto;
      min-width: 120px;
      background: linear-gradient(to right, rgba(15,23,42,0.95), rgba(15,23,42,0.9));
      border-radius: 999px;
      border: 1px solid rgba(31,41,55,0.9);
      padding: 6px 10px;
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      font-size: 12px;
    }
    .stat-label {
      color: var(--text-muted);
    }
    .stat-value {
      font-weight: 600;
    }
    .stat-value.success {
      color: var(--success);
    }
    .stat-value.danger {
      color: var(--danger);
    }
    .stat-value.warning {
      color: var(--warning);
    }
    .table-wrap {
      margin-top: 10px;
      border-radius: 10px;
      overflow: hidden;
      border: 1px solid rgba(31,41,55,0.95);
      background: rgba(15,23,42,0.98);
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    th, td {
      padding: 7px 8px;
      border-bottom: 1px solid rgba(31,41,55,0.9);
      vertical-align: middle;
    }
    th {
      text-align: left;
      background: radial-gradient(circle at top, #020617, #020617);
      font-size: 11px;
      color: var(--text-muted);
    }
    tr:nth-child(even) td {
      background: rgba(15,23,42,0.96);
    }
    tr:nth-child(odd) td {
      background: rgba(15,23,42,0.98);
    }
    .muted {
      color: var(--text-muted);
      font-size: 11px;
    }
    .tag {
      display: inline-flex;
      align-items: center;
      padding: 2px 7px;
      border-radius: 999px;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .tag-ok {
      background: rgba(34,197,94,0.12);
      color: #bbf7d0;
      border: 1px solid rgba(34,197,94,0.55);
    }
    .tag-failed {
      background: rgba(248,113,113,0.14);
      color: #fecaca;
      border: 1px solid rgba(248,113,113,0.6);
    }
    .tag-pending {
      background: rgba(147,51,234,0.18);
      color: #e9d5ff;
      border: 1px solid rgba(147,51,234,0.7);
    }
    code {
      background: rgba(15,23,42,0.9);
      padding: 1px 4px;
      border-radius: 4px;
      border: 1px solid rgba(31,41,55,0.9);
      font-size: 11px;
    }
    .api-hint {
      margin-top: 10px;
      font-size: 11px;
      color: var(--text-muted);
    }
    .api-hint code {
      font-size: 11px;
    }
    @media (max-width: 840px) {
      body {
        padding: 16px;
      }
      .grid {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  </style>
</head>
<body>
  <div class="shell">
    <header>
      <div class="title-row">
        <h1>RabbitMQ Ordering Platform</h1>
        <div class="badge">
          <span class="badge-dot"></span>
          <span>Dev dashboard · ${SERVICE_NAME}</span>
        </div>
      </div>
      <p class="subtitle">
        Event-driven ticket ordering demo.
        <code>POST /orders</code> writes to <code>orders</code> and publishes <code>order.created</code> to RabbitMQ.
      </p>
    </header>

    <div class="stats-row">
      <div class="stat-chip">
        <span class="stat-label">Total orders</span>
        <span class="stat-value">${totalOrders}</span>
      </div>
      <div class="stat-chip">
        <span class="stat-label">Succeeded</span>
        <span class="stat-value success">${succeededPayments}</span>
      </div>
      <div class="stat-chip">
        <span class="stat-label">Failed</span>
        <span class="stat-value danger">${failedPayments}</span>
      </div>
      <div class="stat-chip">
        <span class="stat-label">No payment row</span>
        <span class="stat-value warning">${pendingPayments}</span>
      </div>
    </div>

    <div class="grid">
      <!-- Shows -->
      <section class="card">
        <div class="card-header">
          <div>
            <h2 class="card-title">Shows (seed data)</h2>
            <p class="card-subtitle">
              Backed by <code>shows</code> · IDs used as <code>showId</code> in <code>POST /orders</code>.
            </p>
          </div>
          <span class="pill">${shows.length} show${shows.length === 1 ? "" : "s"}</span>
        </div>

        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Name / Venue</th>
                <th>Starts</th>
                <th>Capacity</th>
              </tr>
            </thead>
            <tbody>
              ${
                shows.length === 0
                  ? `<tr><td colspan="4" class="muted">No shows found. Check DB init.</td></tr>`
                  : shows
                      .map(
                        (s) => `
                <tr>
                  <td>${s.id}</td>
                  <td>
                    ${s.name}<br/>
                    <span class="muted">${s.venue}</span>
                  </td>
                  <td class="muted">${s.starts_at}</td>
                  <td>${s.capacity}</td>
                </tr>`
                      )
                      .join("")
              }
            </tbody>
          </table>
        </div>
      </section>

      <!-- Orders & Payments -->
      <section class="card">
        <div class="card-header">
          <div>
            <h2 class="card-title">Orders & Payments</h2>
            <p class="card-subtitle">
              <code>orders</code> LEFT JOIN <code>payments</code>.
              New rows appear after calling <code>POST /orders</code>.
            </p>
          </div>
          <span class="pill">Latest ${Math.min(50, totalOrders)} orders</span>
        </div>

        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th>User / Show</th>
                <th>Qty</th>
                <th>Order Status</th>
                <th>Payment</th>
              </tr>
            </thead>
            <tbody>
              ${
                orders.length === 0
                  ? `<tr><td colspan="5" class="muted">No orders yet. Send a POST to <code>/orders</code>.</td></tr>`
                  : orders
                      .map((o) => {
                        const paymentTag =
                          o.payment_status === "SUCCEEDED"
                            ? `<span class="tag tag-ok">SUCCEEDED</span>`
                            : o.payment_status === "FAILED"
                            ? `<span class="tag tag-failed">FAILED</span>`
                            : `<span class="tag tag-pending">NO PAYMENT</span>`;

                        const orderTag =
                          o.order_status === "PENDING"
                            ? `<span class="tag tag-pending">PENDING</span>`
                            : `<span class="tag tag-ok">${o.order_status}</span>`;

                        return `
                <tr>
                  <td>#${o.id}</td>
                  <td>
                    user: <code>${o.user_id}</code><br/>
                    show: <code>${o.show_id}</code>
                  </td>
                  <td>${o.quantity}</td>
                  <td>${orderTag}</td>
                  <td>
                    ${paymentTag}<br/>
                    ${
                      o.payment_amount
                        ? `<span class="muted">amount: ${o.payment_amount}</span>`
                        : `<span class="muted">no payment row</span>`
                    }
                  </td>
                </tr>`;
                      })
                      .join("")
              }
            </tbody>
          </table>
        </div>

        <div class="api-hint">
          JSON endpoints for automation:&nbsp;
          <code>GET /orders</code>,
          <code>GET /payments</code>.
        </div>
      </section>
    </div>
  </div>
</body>
</html>`;

    res.send(html);
  } catch (err) {
    console.error("[order-api] Error in GET /", err);
    res.status(500).send("Internal error rendering dashboard");
  }
});

/**
 * JSON: list orders + payment info
 */
app.get("/orders", async (req, res) => {
  try {
    const result = await query(
      `SELECT
         o.id,
         o.user_id,
         o.show_id,
         o.quantity,
         o.status        AS order_status,
         o.created_at    AS order_created_at,
         p.status        AS payment_status,
         p.amount        AS payment_amount,
         p.created_at    AS payment_created_at
       FROM orders o
       LEFT JOIN payments p
         ON p.order_id = o.id
       ORDER BY o.id DESC
       LIMIT 50`
    );
    res.json(result.rows);
  } catch (err) {
    console.error("[order-api] Error in GET /orders", err);
    res.status(500).json({ error: "internal_error" });
  }
});

/**
 * JSON: list payments (same view as in payment-service, but handy)
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
    console.error("[order-api] Error in GET /payments", err);
    res.status(500).json({ error: "internal_error" });
  }
});

/**
 * Create order:
 *  - check available stock (capacity - reserved/committed)
 *  - insert order
 *  - insert inventory_reservations row (RESERVED, 15m expiry)
 *  - commit
 *  - publish order.created event
 */
app.post("/orders", async (req, res) => {
  const client = await pool.connect();

  try {
    const { userId, showId, quantity } = req.body;

    if (!userId || !showId || !quantity) {
      client.release();
      return res.status(400).json({
        error: "userId, showId, quantity are required",
      });
    }

    await client.query("BEGIN");

    // 1) Check stock for this show (product)
    const stockResult = await client.query(
      `
      SELECT
        s.id,
        s.capacity
          - COALESCE(
              SUM(ir.quantity) FILTER (WHERE ir.status IN ('RESERVED', 'COMMITTED')),
              0
            ) AS available
      FROM shows s
      LEFT JOIN inventory_reservations ir
        ON ir.show_id = s.id
      WHERE s.id = $1
      GROUP BY s.id, s.capacity
      `,
      [showId]
    );

    if (stockResult.rowCount === 0) {
      await client.query("ROLLBACK");
      client.release();
      return res.status(404).json({ error: "show_not_found" });
    }

    const available = stockResult.rows[0].available;

    if (available < quantity) {
      await client.query("ROLLBACK");
      client.release();
      return res.status(409).json({
        error: "not_enough_stock",
        available,
      });
    }

    // 2) Insert the order
    const orderResult = await client.query(
      `INSERT INTO orders (user_id, show_id, quantity, status)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [userId, showId, quantity, "PENDING"]
    );

    const orderId = orderResult.rows[0].id;

    // 3) Create inventory reservation for this order
    await client.query(
      `INSERT INTO inventory_reservations
         (show_id, order_id, quantity, status, expires_at)
       VALUES ($1, $2, $3, $4, NOW() + INTERVAL '15 minutes')`,
      [showId, orderId, quantity, "RESERVED"]
    );

    await client.query("COMMIT");
    client.release();

    // 4) Publish event AFTER DB commit
    const payload = {
      type: "order.created",
      orderId,
      userId,
      showId,
      quantity,
      status: "PENDING",
    };

    const event = await publishEvent("order.created", payload);
    console.log("[order-api] Published order.created", event);

    res.status(202).json({ status: "accepted", orderId });
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (_) {
      // ignore rollback errors
    }
    client.release();
    console.error("[order-api] Error in /orders", err);
    res.status(500).json({ error: "internal_error" });
  }
});

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`[order-api] Listening on port ${port}`);
});
