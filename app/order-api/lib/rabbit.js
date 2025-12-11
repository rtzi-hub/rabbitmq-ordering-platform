const amqp = require("amqplib");

let connection;
let channel;

async function getChannel() {
  if (channel) return channel;

  const host = process.env.RABBITMQ_HOST || "localhost";
  const port = process.env.RABBITMQ_PORT || "5672";
  const user = process.env.RABBITMQ_USERNAME || process.env.RABBITMQ_USER || "guest";
  const pass = process.env.RABBITMQ_PASSWORD || process.env.RABBITMQ_PASS || "guest";

  const baseUrl = process.env.RABBITMQ_URL || `amqp://${user}:${pass}@${host}:${port}`;

  const vhost = process.env.RABBITMQ_VHOST || "/";
  const vhostPath = vhost === "/" ? "" : `/${vhost.replace(/^\//, "")}`;

  const url = `${baseUrl}${vhostPath}`;

  connection = await amqp.connect(url);
  channel = await connection.createChannel();

  const eventsExchange = process.env.RABBITMQ_EXCHANGE_EVENTS || "events.topic";
  const dlxExchange = process.env.RABBITMQ_EXCHANGE_DLX || "dlx.direct";

  await channel.assertExchange(eventsExchange, "topic", { durable: true });
  await channel.assertExchange(dlxExchange, "direct", { durable: true });

  return channel;
}

function randomId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

async function publishEvent(routingKey, payload = {}, options = {}) {
  const ch = await getChannel();
  const exchange = process.env.RABBITMQ_EXCHANGE_EVENTS || "events.topic";

  const message = {
    messageId: payload.messageId || randomId(),
    createdAt: new Date().toISOString(),
    ...payload
  };

  const buffer = Buffer.from(JSON.stringify(message));

  ch.publish(exchange, routingKey, buffer, {
    contentType: "application/json",
    deliveryMode: 2,
    ...options
  });

  return message;
}

module.exports = { getChannel, publishEvent };
