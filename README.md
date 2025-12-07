# RabbitMQ Ordering Platform

Event-driven demo for an online ticket ordering system using:

- **order-api** – Node.js HTTP API that creates orders and publishes `order.created` events to RabbitMQ
- **payment-service** – Node.js worker that consumes `order.created`, writes to PostgreSQL, and publishes `payment.succeeded` / `payment.failed`
- **RabbitMQ** – message broker (Bitnami chart)
- **PostgreSQL** – relational database (Bitnami chart)
- **Kubernetes + Helm** – orchestration and deployment

## Architecture

1. Client calls `POST /orders` on **order-api**
2. `order-api`:
   - inserts a row into `orders` table with status `PENDING`
   - publishes an `order.created` event to RabbitMQ (topic exchange `events.topic`)
3. **payment-service**:
   - consumes `order.created` from queue `payment.order-created.q`
   - checks idempotency using `message_id`
   - simulates payment, inserts into `payments` table
   - publishes `payment.succeeded` or `payment.failed` back to `events.topic`

## Running locally on Kubernetes (dev)

```bash
cd k8s/scripts
./run-dev.sh

Then port-forward the API and create an order:

kubectl -n apps port-forward svc/order-api 8080:8080

curl -X POST http://localhost:8080/orders \
  -H "Content-Type: application/json" \
  -d '{"userId":"user-1","showId":1,"quantity":2}'


Check logs:

kubectl -n apps logs deploy/order-api
kubectl -n apps logs deploy/payment-service

Project structure
order-api/               # Order HTTP API
payment-service/         # Payment worker
k8s/
  charts/                # Helm charts for each service
  configmaps/            # Shared non-secret config
  secrets/               # Example + real secrets (real are gitignored)
  values/                # Environment-specific values
  scripts/               # run-dev / cleanup-dev
