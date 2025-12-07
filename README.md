# RabbitMQ Ordering Platform

Event-driven demo of a simple online ticket ordering system built with:

- **order-api** – Node.js HTTP API that creates orders and publishes `order.created` events to RabbitMQ
- **payment-service** – Node.js worker that consumes `order.created`, writes to PostgreSQL, and publishes `payment.succeeded` / `payment.failed`
- **RabbitMQ** – message broker (Bitnami Helm chart)
- **PostgreSQL** – relational database (Bitnami Helm chart, auto-init schema)
- **Kubernetes + Helm** – orchestration and deployment

---

## Architecture

1. Client calls `POST /orders` on **order-api**
2. **order-api**:
   - inserts a row into the `orders` table with status `PENDING`
   - publishes an `order.created` event to RabbitMQ (topic exchange `events.topic`)
3. **payment-service**:
   - consumes `order.created` from queue `payment.order-created.q`
   - checks idempotency using `message_id` in the `payments` table
   - simulates a payment attempt
   - inserts a record into `payments` with `SUCCEEDED` or `FAILED`
   - publishes `payment.succeeded` or `payment.failed` back to `events.topic`

---

## Database schema (dev)

PostgreSQL is initialized automatically via the Bitnami chart `primary.initdb.scripts` mechanism.

Tables:

- `shows` – events you can buy tickets for
- `orders` – created by `order-api`, FK to `shows(id)`
- `payments` – created by `payment-service`, FK to `orders(id)`
- `inventory_reservations` – optional reservations table for interview discussion (overselling, holds, etc.)

Dev seed data:

- 3 example shows are inserted into `shows` (IDs 1, 2, 3).

---

## Running locally on Kubernetes (dev)

From the repo root:

```bash
cd k8s/scripts
./run-dev.sh
```

This will:
- create the messaging, database, and apps namespaces
- install / upgrade RabbitMQ (bitnami/rabbitmq)
- install / upgrade PostgreSQL (bitnami/postgresql) and apply the schema + seed data

install / upgrade:
- order-api (HTTP API)
- payment-service (background worker)
## Port-forward the API
```bash
kubectl -n apps port-forward deploy/order-api-order-api-chart 8080:8080
```
Create a test order
```bash
curl -X POST http://localhost:8080/orders \
  -H "Content-Type: application/json" \
  -d '{
    "userId": 123,
    "showId": 1,
    "quantity": 2
  }'
```
Expected response:
```bash
{"status":"accepted","orderId":1}
```
Check logs:
```bash
### order-api (HTTP + publishing order.created)
kubectl -n apps logs deploy/order-api-order-api-chart --tail=50

### payment-service (consumer + payments table writes)
kubectl -n apps logs deploy/payment-service-payment-service-chart --tail=50
```
### list shows order (seed data)
```bash
kubectl exec -n database -it postgresql-0 -- \
  psql -U postgresdb -d postgresdb -c "SELECT id, name FROM shows;"
```

### Project structure
```bash
rabbitmq-ordering-platform/
├─ order-api/                 # Order HTTP API
├─ payment-service/           # Payment worker
└─ k8s/
   ├─ charts/                 # Local Helm charts (order-api, payment-service, etc.)
   ├─ configmaps/             # Shared nonsecret configuration (RabbitMQ, Postgres)
   ├─ secrets/                # Secrets manifests (real secrets are .gitignored)
   ├─ values/
   │  └─ dev/                 # Dev environment values (RabbitMQ, Postgres, services)
   └─ scripts/
      ├─ run-dev.sh           # Spin up full dev stack
      └─ cleanup-dev.sh       # (optional) tear down / reset dev stack
```
