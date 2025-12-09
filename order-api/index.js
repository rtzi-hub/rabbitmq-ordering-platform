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
      color-scheme: light;
      --bg: #f1f5f9;
      --bg-soft: #e5edf7;
      --surface: #ffffff;
      --surface-soft: #f9fafb;
      --border-subtle: #e2e8f0;
      --border-strong: #cbd5e1;
      --accent: #2563eb;
      --accent-soft: rgba(37, 99, 235, 0.08);
      --accent-strong: rgba(37, 99, 235, 0.18);
      --text-main: #0f172a;
      --text-muted: #64748b;
      --danger: #dc2626;
      --success: #16a34a;
      --warning: #ea580c;
    }
    * {
      box-sizing: border-box;
    }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background:
        radial-gradient(circle at top left, rgba(59, 130, 246, 0.12), transparent 60%),
        radial-gradient(circle at bottom right, rgba(59, 130, 246, 0.06), transparent 65%),
        var(--bg);
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

    /* Header */
    .page-header {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-bottom: 20px;
    }
    .title-row {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: wrap;
    }
    h1 {
      margin: 0;
      font-size: 28px;
      letter-spacing: 0.02em;
      color: #0f172a;
    }
    .subtitle {
      margin: 0;
      font-size: 14px;
      color: var(--text-muted);
      max-width: 640px;
      line-height: 1.5;
    }
    .subtitle.small {
      font-size: 13px;
    }
    .badge {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      border-radius: 999px;
      background: var(--surface);
      border: 1px solid var(--border-subtle);
      box-shadow: 0 10px 25px rgba(15, 23, 42, 0.04);
      font-size: 12px;
      white-space: nowrap;
    }
    .badge-dot {
      width: 8px;
      height: 8px;
      border-radius: 999px;
      background: #22c55e;
      box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.25);
    }
    .badge-text {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      line-height: 1.2;
    }
    .badge-label {
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-size: 10px;
      color: var(--text-muted);
    }
    .badge-text strong {
      font-weight: 600;
    }

    /* Stats row */
    .stats-row {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-top: 14px;
    }
    .stat-chip {
      flex: 1 1 160px;
      background: var(--surface);
      border-radius: 999px;
      border: 1px solid var(--border-subtle);
      padding: 8px 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 13px;
      box-shadow: 0 10px 25px rgba(15, 23, 42, 0.03);
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

    /* Layout grid */
    .grid {
      display: grid;
      grid-template-columns: minmax(0, 1.05fr) minmax(0, 1.45fr);
      gap: 20px;
      margin-top: 24px;
    }

    /* Cards */
    .card {
      background: linear-gradient(to bottom, var(--surface-soft), var(--surface));
      border-radius: 16px;
      padding: 16px 16px 12px;
      border: 1px solid var(--border-subtle);
      box-shadow: 0 18px 45px rgba(15, 23, 42, 0.06);
      position: relative;
      overflow: hidden;
    }
    .card::before {
      content: "";
      position: absolute;
      inset: 0;
      background: linear-gradient(
        to right,
        rgba(37, 99, 235, 0.04),
        transparent 55%
      );
      pointer-events: none;
    }
    .card > * {
      position: relative;
      z-index: 1;
    }
    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 8px;
      margin-bottom: 10px;
    }
    .card-title {
      margin: 0;
      font-size: 15px;
      font-weight: 600;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: #0f172a;
    }
    .card-subtitle {
      margin: 4px 0 0;
      font-size: 12px;
      color: var(--text-muted);
    }
    .card-subtitle code {
      font-size: 12px;
    }
    .pill {
      font-size: 11px;
      color: #1d4ed8;
      background: var(--accent-soft);
      padding: 4px 9px;
      border-radius: 999px;
      border: 1px solid var(--accent-strong);
      white-space: nowrap;
    }

    /* Tables */
    .table-wrap {
      margin-top: 10px;
      border-radius: 12px;
      overflow: auto;
      border: 1px solid var(--border-subtle);
      background: var(--surface-soft);
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
      min-width: 100%;
    }
    th, td {
      padding: 8px 10px;
      border-bottom: 1px solid #e5e7eb;
      vertical-align: middle;
    }
    th {
      text-align: left;
      background: #f9fafb;
      font-size: 11px;
      color: var(--text-muted);
      white-space: nowrap;
    }
    tbody tr:nth-child(even) td {
      background: #f9fafb;
    }
    tbody tr:nth-child(odd) td {
      background: #ffffff;
    }

    .muted {
      color: var(--text-muted);
      font-size: 12px;
    }

    /* Status tags */
    .tag {
      display: inline-flex;
      align-items: center;
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      border: 1px solid transparent;
    }
    .tag-ok {
      background: rgba(22, 163, 74, 0.06);
      color: #166534;
      border-color: rgba(22, 163, 74, 0.35);
    }
    .tag-failed {
      background: rgba(220, 38, 38, 0.06);
      color: #b91c1c;
      border-color: rgba(220, 38, 38, 0.35);
    }
    .tag-pending {
      background: rgba(234, 179, 8, 0.06);
      color: #92400e;
      border-color: rgba(234, 179, 8, 0.35);
    }

    /* Code + API hint */
    code {
      background: #eff6ff;
      padding: 1px 5px;
      border-radius: 4px;
      border: 1px solid #dbeafe;
      font-size: 12px;
      color: #1e40af;
    }
    .api-hint {
      margin-top: 12px;
      font-size: 12px;
      color: var(--text-muted);
      line-height: 1.5;
    }
    .api-hint code {
      font-size: 12px;
    }

    @media (max-width: 880px) {
      body {
        padding: 16px;
      }
      .grid {
        grid-template-columns: minmax(0, 1fr);
      }
      .badge {
        align-self: flex-start;
      }
    }
  </style>
</head>
<body>
  <div class="shell">
    <header class="page-header">
      <div class="title-row">
        <div>
          <h1>RabbitMQ Ordering Platform</h1>
          <p class="subtitle">
            Clear, real-time overview of your event-driven ticket ordering demo:
            database rows, RabbitMQ events, and payment outcomes in one place.
          </p>
        </div>
        <div class="badge">
          <span class="badge-dot"></span>
          <div class="badge-text">
            <span class="badge-label">Service</span>
            <strong>${SERVICE_NAME}</strong>
          </div>
        </div>
      </div>
      <p class="subtitle small">
        <code>POST /orders</code> creates an order, reserves capacity, and publishes
        <code>order.created</code> to RabbitMQ.
      </p>
    </header>

    <section class="stats-row">
      <div class="stat-chip">
        <span class="stat-label">Total orders</span>
        <span class="stat-value">${totalOrders}</span>
      </div>
      <div class="stat-chip">
        <span class="stat-label">Succeeded payments</span>
        <span class="stat-value success">${succeededPayments}</span>
      </div>
      <div class="stat-chip">
        <span class="stat-label">Failed payments</span>
        <span class="stat-value danger">${failedPayments}</span>
      </div>
      <div class="stat-chip">
        <span class="stat-label">No payment row</span>
        <span class="stat-value warning">${pendingPayments}</span>
      </div>
    </section>

    <div class="grid">
      <!-- Shows -->
      <section class="card">
        <div class="card-header">
          <div>
            <h2 class="card-title">Shows (seed data)</h2>
            <p class="card-subtitle">
              Backed by <code>shows</code>. Use the IDs as <code>showId</code> in
              <code>POST /orders</code>.
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
            <h2 class="card-title">Orders &amp; payments</h2>
            <p class="card-subtitle">
              <code>orders</code> LEFT JOIN <code>payments</code>. New rows appear after
              calling <code>POST /orders</code>.
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
                <th>Order status</th>
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
          For automation, use the JSON endpoints:&nbsp;
          <code>GET /orders</code> and <code>GET /payments</code>.
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
