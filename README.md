# RabbitMQ Ordering Platform

A small event-driven demo of an online ticket shop powered by RabbitMQ, PostgreSQL, Kubernetes, and Node.js microservices.

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

markdown
Copy code

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

---

## Project Structure
```bash
rabbitmq-ordering-platform/
├── order-api/ # Order HTTP API and Dashboard (port 8080)
├── payment-service/ # Payment consumer and HTTP API (port 8081)
└── k8s/
├── charts/ # Helm charts for services
├── configmaps/ # Shared non-secret config
├── secrets/ # Kubernetes secrets (gitignored)
├── values/
│ └── dev/ # Dev values for Helm charts
└── scripts/
├── run-dev.sh # Launch development stack
└── cleanup-dev.sh # Tear down development stack
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
