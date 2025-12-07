const amqp = require('amqplib');
const { Pool } = require('pg');

const {
  RABBITMQ_HOST,
  RABBITMQ_PORT,
  RABBITMQ_USER,
  RABBITMQ_PASS,
  QUEUE_NAME,
  DB_HOST,
  DB_PORT,
  DB_NAME,
  DB_USER,
  DB_PASSWORD,
} = process.env;

if (!RABBITMQ_HOST || !QUEUE_NAME || !DB_HOST) {
  console.error('[FATAL] Missing required environment variables');
  process.exit(1);
}

const amqpUrl = `amqp://${RABBITMQ_USER}:${RABBITMQ_PASS}@${RABBITMQ_HOST}:${RABBITMQ_PORT}`;

const pgPool = new Pool({
  host: DB_HOST,
  port: Number(DB_PORT || 5432),
  database: DB_NAME,
  user: DB_USER,
  password: DB_PASSWORD,
});

async function ensureTable() {
  try {
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS processed_messages (
        id SERIAL PRIMARY KEY,
        message_id VARCHAR(64),
        payload TEXT NOT NULL,
        processed_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('[INFO] DB table ready');
  } catch (err) {
    console.error('[ERROR] Failed to ensure DB table:', err.message);
    throw err;
  }
}

async function initDatabase() {
  while (true) {
    try {
      await pgPool.query('SELECT 1');
      await ensureTable();
      console.log('[INFO] DB ready');
      return;
    } catch (err) {
      console.error(`[WARN] DB not ready, retrying in 5s: ${err.message}`);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

async function startConsumer() {
  await initDatabase();

  const conn = await amqp.connect(amqpUrl);
  const channel = await conn.createChannel();

  await channel.assertQueue(QUEUE_NAME, {
    durable: true,
  });

  channel.prefetch(10);
  console.log(`[INFO] Waiting for messages on queue: ${QUEUE_NAME}`);

  channel.consume(
    QUEUE_NAME,
    async (msg) => {
      if (!msg) return;
      try {
        const content = msg.content.toString();
        let data;
        try {
          data = JSON.parse(content);
        } catch {
          data = { messageId: null, text: content };
        }

        await pgPool.query(
          'INSERT INTO processed_messages (message_id, payload) VALUES ($1, $2)',
          [data.messageId || null, content]
        );

        channel.ack(msg);
        console.log('[INFO] Processed message:', content);
      } catch (err) {
        console.error('[ERROR] Failed to process message:', err);
        // basic strategy: reject & requeue once, or send to DLQ in later phases
        channel.nack(msg, false, false); // false requeue ⇒ will rely on DLQ policy later
      }
    },
    { noAck: false }
  );
}

startConsumer().catch((err) => {
  console.error('[FATAL] Consumer crashed on startup:', err);
  process.exit(1);
});
