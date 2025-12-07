const express = require('express');
const amqp = require('amqplib');

const {
  RABBITMQ_HOST,
  RABBITMQ_PORT,
  RABBITMQ_USER,
  RABBITMQ_PASS,
  QUEUE_NAME,
  PORT = 8080,
} = process.env;

if (!RABBITMQ_USER || !RABBITMQ_PASS) {
  console.error('❌ RABBITMQ_USER and RABBITMQ_PASS must be set');
  process.exit(1);
}

const RABBITMQ_URL = `amqp://${encodeURIComponent(RABBITMQ_USER)}:${encodeURIComponent(
  RABBITMQ_PASS
)}@${RABBITMQ_HOST}:${RABBITMQ_PORT}`;

const app = express();

let amqpConnection;
let amqpChannel;

/**
 * Connect to RabbitMQ and create a channel + queue
 */
async function initRabbitMQ() {
  try {
    console.log(`🔌 Connecting to RabbitMQ at: ${RABBITMQ_URL}`);
    amqpConnection = await amqp.connect(RABBITMQ_URL);
    amqpChannel = await amqpConnection.createChannel();
    await amqpChannel.assertQueue(QUEUE_NAME, {
      durable: true,
    });
    console.log(`✅ Connected to RabbitMQ, queue ready: ${QUEUE_NAME}`);
  } catch (err) {
    console.error('❌ Failed to connect to RabbitMQ:', err.message);
    // Try again after a short delay
    setTimeout(initRabbitMQ, 5000);
  }
}

/**
 * Health endpoint for Kubernetes liveness/readiness probes
 */
app.get('/healthz', (req, res) => {
  if (amqpChannel) {
    return res.status(200).json({ status: 'ok', rabbitmq: 'connected' });
  }
  return res.status(500).json({ status: 'degraded', rabbitmq: 'not_connected' });
});

/**
 * Basic info endpoint
 */
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Webserver is running',
    rabbitmqHost: RABBITMQ_HOST,
    queue: QUEUE_NAME,
  });
});

/**
 * Send message to RabbitMQ queue
 * Example: GET /send?msg=hello
 */
app.get('/send', async (req, res) => {
  const msg = req.query.msg || 'hello from webserver';

  if (!amqpChannel) {
    return res.status(503).json({
      status: 'error',
      error: 'RabbitMQ channel not ready yet',
    });
  }

  try {
    const buffer = Buffer.from(msg, 'utf8');
    const ok = amqpChannel.sendToQueue(QUEUE_NAME, buffer, { persistent: true });

    if (!ok) {
      console.warn('⚠️ sendToQueue returned false (internal buffer full)');
    }

    console.log(`📨 Sent message to queue "${QUEUE_NAME}":`, msg);

    res.json({
      status: 'sent',
      queue: QUEUE_NAME,
      message: msg,
    });
  } catch (err) {
    console.error('❌ Failed to send message:', err);
    res.status(500).json({
      status: 'error',
      error: 'Failed to send message',
    });
  }
});

/**
 * Start server and initialize RabbitMQ connection
 */
app.listen(PORT, () => {
  console.log(`🚀 Webserver listening on port ${PORT}`);
  initRabbitMQ();
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('🛑 Shutting down webserver...');
  try {
    if (amqpChannel) await amqpChannel.close();
    if (amqpConnection) await amqpConnection.close();
  } catch (err) {
    console.error('Error closing RabbitMQ connection:', err.message);
  }
  process.exit(0);
})
