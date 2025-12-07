-- Ticketing platform schema
-- Compatible with PostgreSQL 13+

-- Optional: use a dedicated schema
CREATE SCHEMA IF NOT EXISTS ticketing;
SET search_path TO ticketing, public;

-- ---------------------------------------
-- 1. Shows (events you can buy tickets for)
-- ---------------------------------------
CREATE TABLE IF NOT EXISTS shows (
    id           SERIAL PRIMARY KEY,
    name         TEXT        NOT NULL,
    venue        TEXT        NOT NULL,
    starts_at    TIMESTAMPTZ NOT NULL,
    capacity     INTEGER     NOT NULL CHECK (capacity > 0),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------
-- 2. Orders (created by order-api)
-- ---------------------------------------
-- order-api/index.js inserts:
--   user_id, show_id, quantity, status
--   and expects: id SERIAL PRIMARY KEY
CREATE TABLE IF NOT EXISTS orders (
    id           SERIAL PRIMARY KEY,
    user_id      TEXT        NOT NULL,
    show_id      INTEGER     NOT NULL REFERENCES shows(id) ON DELETE RESTRICT,
    quantity     INTEGER     NOT NULL CHECK (quantity > 0),
    status       TEXT        NOT NULL,    -- e.g. PENDING / CONFIRMED / CANCELLED
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_show_id ON orders(show_id);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);

-- ---------------------------------------
-- 3. Payments (used by payment-service)
-- ---------------------------------------
-- payment-service/index.js inserts:
--   order_id, user_id, amount, status, message_id
-- and checks idempotency with SELECT 1 FROM payments WHERE message_id = $1
CREATE TABLE IF NOT EXISTS payments (
    id           SERIAL PRIMARY KEY,
    order_id     INTEGER     NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    user_id      TEXT        NOT NULL,
    amount       INTEGER     NOT NULL,    -- smallest currency unit (e.g. cents)
    status       TEXT        NOT NULL,    -- SUCCEEDED / FAILED
    message_id   TEXT        NOT NULL,    -- from RabbitMQ event
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure idempotency: the same message_id cannot be processed twice
CREATE UNIQUE INDEX IF NOT EXISTS ux_payments_message_id ON payments(message_id);

CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);

-- ---------------------------------------
-- 4. Inventory reservations (optional but nice)
-- ---------------------------------------
-- This table gives you something to talk about in interviews:
-- how you'd handle seat reservation windows, overselling, etc.
CREATE TABLE IF NOT EXISTS inventory_reservations (
    id             SERIAL PRIMARY KEY,
    show_id        INTEGER     NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
    order_id       INTEGER     REFERENCES orders(id) ON DELETE SET NULL,
    quantity       INTEGER     NOT NULL CHECK (quantity > 0),
    status         TEXT        NOT NULL,   -- RESERVED / EXPIRED / COMMITTED
    expires_at     TIMESTAMPTZ NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_reservations_show_id
    ON inventory_reservations(show_id);
CREATE INDEX IF NOT EXISTS idx_inventory_reservations_expires_at
    ON inventory_reservations(expires_at);

-- ---------------------------------------
-- 5. Seed data (optional, for demos)
-- ---------------------------------------
INSERT INTO shows (name, venue, starts_at, capacity)
VALUES
  ('Rock Festival 2025', 'Main Arena', NOW() + INTERVAL ''7 days'', 5000),
  ('Tech Conference Keynote', 'Hall A', NOW() + INTERVAL ''14 days'', 800),
  ('Standup Night', 'Small Club', NOW() + INTERVAL ''3 days'', 120)
ON CONFLICT DO NOTHING;
