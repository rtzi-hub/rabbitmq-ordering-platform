# RabbitMQ Ordering Platform

A small event-driven demo of an online ticket shop powered by RabbitMQ, PostgreSQL, Kubernetes, Fully Monitored using Prometheus & Grafana and Node.js apps microservices.

This project demonstrates a basic ordering and payment flow using asynchronous messaging via RabbitMQ, with a clear separation of concerns between services.

---

## Table of Contents

- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Installation](#installation)
- [Usage](#usage)
- [Features](#features)
- [Database Schema](#database-schema)
- [Configuration](#configuration)
- [Examples](#examples)
- [Troubleshooting](#troubleshooting)
- [Contributors](#contributors)
- [License](#license)

---

## Architecture

User → order-api (HTTP)

↓

Inventory Reservation

↓

Publishes order.created to RabbitMQ

↓

payment-service consumes order.created

↓

Creates a PENDING payment

↓

Manual approval/rejection via HTTP

### Flow Overview

1. `POST /orders` (via order-api):
   - Checks show capacity
   - Creates a PENDING order
   - Reserves inventory
   - Publishes `order.created` to RabbitMQ (events.topic exchange)

2. payment-service:
   - Consumes `order.created` from queue `payment.order-created.q`
   - Ensures idempotency using `message_id`
   - Inserts a PENDING row in `payments`

3. Manual approval or rejection:
   - `POST /payments/:orderId/approve`
     - Payment status → SUCCEEDED
     - Order status → CONFIRMED
     - Inventory status → COMMITTED
   - `POST /payments/:orderId/reject`
     - Payment status → FAILED
     - Order status → CANCELLED
     - Inventory status → EXPIRED

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

---
## Installation

### Prerequisites

- Kubernetes cluster
- Helm 3+
- kubectl
- Docker (optional for local builds)

### Run the Development Stack

From the repo root:

```bash
cd k8s/scripts
./run-dev.sh
```
This script will:
Create namespaces: messaging, database, apps
Install RabbitMQ (Bitnami Helm)
Install PostgreSQL (Bitnami Helm) with schema and seed data
Deploy order-api and payment-service

Pods list of the lab results:
<img width="726" height="266" alt="image" src="https://github.com/user-attachments/assets/94e4d83b-f4f6-4f3b-9c0e-d954979e0091" />

1. Access the Dashboard
```bash
kubectl -n apps port-forward deploy/order-api-order-api-chart 8080:8080
```
Open in browser:
```text
http://localhost:8080/
```
The dashboard shows:
Left: Shows (from shows table)
Right: Orders joined with payments
Stats: totals, succeeded, failed, no payment rows

2. Create an Order
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

```json
{"status":"accepted","orderId":1}
```
This will:
Insert into orders (status: PENDING)
Insert into inventory_reservations (status: RESERVED)
Publish order.created to RabbitMQ

3. Approve or Reject Payment
Port-forward the payment-service
```bash
kubectl -n apps port-forward svc/payment-service-payment-service-chart-svc 8081:8081
```
List Payments
```bash
curl http://localhost:8081/payments
```
You should see a PENDING payment.
Approve Payment
```bash
curl -X POST http://localhost:8081/payments/1/approve
```
This will update:
payments.status → SUCCEEDED
orders.status → CONFIRMED
inventory_reservations.status → COMMITTED

Reject Payment
```bash
curl -X POST http://localhost:8081/payments/1/reject
```
This will update:
payments.status → FAILED
orders.status → CANCELLED
inventory_reservations.status → EXPIRED

Then refresh http://localhost:8080/ to verify updated states.

Landing page example for the result of the rejected payment + the approved payment (PAY ATTENTION That the Quantity is changing according to the approval):
<img width="1182" height="593" alt="image" src="https://github.com/user-attachments/assets/ea2df57a-95b3-4b4e-a1be-cf1c0718ccc4" />


## Monitoring (Prometheus + Grafana)

This repo can be observed with kube-prometheus-stack (Prometheus + Alertmanager + Grafana) plus:

RabbitMQ metrics (queue depth, publish/ack rates, consumers)

Postgres exporter (connections, TPS, cache hit ratio, locks, DB size)

Recommended namespace: monitoring

Install kube-prometheus-stack
```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

helm upgrade --install kube-prometheus-stack prometheus-community/kube-prometheus-stack \
  -n monitoring --create-namespace \
  -f k8s/values/dev/kube-prom-stack.yaml
```
Access Grafana
```bash
kubectl -n monitoring port-forward svc/kube-prometheus-stack-grafana 3000:80
```

Open:
```text
http://localhost:3000
```
Example of the monitoring dashboards - Configmap import (Inside the UI Dashboard -> Company Dashboards):
> If You want to add/update/remove a dashboard enter the dashboard json file to [monitoring/dashboards](https://github.com/rtzi-hub/rabbitmq-ordering-platform/blob/main/k8s/monitoring/dashboards) folder Then run this [scripts/update-dashboards.sh](https://github.com/rtzi-hub/rabbitmq-ordering-platform/blob/main/k8s/scripts/update-dashboards.sh)
### VM Node Overview

<img width="1603" height="819" alt="image" src="https://github.com/user-attachments/assets/10f48680-82e0-480b-88ca-f26149229c74" />

### K8s & Platform Overview

<img width="1024" height="668" alt="image" src="https://github.com/user-attachments/assets/b8ed0477-63ac-4fe4-8c67-46bf3f7f8de2" />

### DB Overview

<img width="1619" height="676" alt="image" src="https://github.com/user-attachments/assets/d65f240b-4ce1-4aa2-b492-a195f633e073" />
<img width="1587" height="781" alt="image" src="https://github.com/user-attachments/assets/b7ef8aca-2d61-4f95-ad76-54f5da2ac70f" />

### RabbitMQ Dashboard

<img width="1610" height="776" alt="image" src="https://github.com/user-attachments/assets/e3f43b58-552c-40d2-a6d5-d2ab53558c1a" />

Features
Event-driven architecture using RabbitMQ
Microservice separation between order and payment workflows
Manual payment simulation via HTTP endpoints
Dashboard to track shows, orders, payments
Helm-based deployment to Kubernetes

Auto-initialized and seeded PostgreSQL database

Database Schema
Tables:
shows – Event data (3 pre-seeded rows)
orders – Order records
payments – Payment attempts
inventory_reservations – Reserved seats per order

PostgreSQL Access (Dev)
```bash
kubectl exec -n database -it postgresql-0 -- \
  psql -U postgresdb -d postgresdb
```
Example Queries
```sql
SELECT id, name, capacity FROM shows;
SELECT * FROM orders;
SELECT * FROM payments;
SELECT * FROM inventory_reservations;
```
Configuration
Helm values: k8s/values/dev/

ConfigMaps: k8s/configmaps/

Secrets: k8s/secrets/ (not committed to version control)

Examples
Create an order → View in dashboard

Approve or reject payments → Observe status changes

View logs for debugging:

```bash
# order-api
kubectl -n apps logs deploy/order-api-order-api-chart --tail=50
# payment-service
kubectl -n apps logs deploy/payment-service-payment-service-chart --tail=50
```

