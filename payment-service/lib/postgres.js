// order-api/lib/postgres.js
const { Pool } = require("pg");

const pool = new Pool({
  host: process.env.PGHOST || process.env.DB_HOST,
  port: process.env.PGPORT || process.env.DB_PORT,
  database:
    process.env.PGDATABASE ||
    process.env.DB_NAME,
  user:
    process.env.PGUSER ||
    process.env.DB_USER,
  password:
    process.env.PGPASSWORD ||
    process.env.DB_PASSWORD ||
    process.env.POSTGRES_PASSWORD,
  max: 10,
});

async function query(text, params) {
  return pool.query(text, params);
}

module.exports = { query, pool };
