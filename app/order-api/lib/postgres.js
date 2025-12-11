const { Pool } = require("pg");

const pool = new Pool({
  host: process.env.PGHOST || process.env.DB_HOST || "localhost",
  port: process.env.PGPORT || process.env.DB_PORT || 5432,
  database: process.env.PGDATABASE || process.env.DB_NAME || "postgresdb",
  user: process.env.PGUSER || process.env.DB_USER || "postgresdb",
  password:
    process.env.PGPASSWORD ||
    process.env.DB_PASSWORD ||
    process.env.POSTGRES_PASSWORD ||
    "postgresqlpassword",
  max: 10
});

async function query(text, params) {
  return pool.query(text, params);
}

module.exports = { query, pool };
