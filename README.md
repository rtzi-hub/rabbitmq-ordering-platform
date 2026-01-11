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
└─ app/   
   ├─ order-api/                 # Order HTTP API
   └─ payment-service/           # Payment worker
├─ ci-test/ 
└─ k8s/
   ├─ charts/                 # Local Helm charts (order-api, payment-service, etc.)
   ├─ configmaps/             # Shared nonsecret configuration (RabbitMQ, Postgres)
   ├─ secrets/                # Secrets manifests
   ├─ values/
   │  └─ dev/                 # Dev environment values (RabbitMQ, Postgres, services)
   └─ scripts/
      ├─ run-dev.sh           # Spin up full dev stack
      ├─ cleanup-kibana.sh 
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

<img width="1007" height="656" alt="image" src="https://github.com/user-attachments/assets/802a5ba4-da9c-47b8-96a1-f181309652d8" />


### DB Overview

<img width="1619" height="676" alt="image" src="https://github.com/user-attachments/assets/d65f240b-4ce1-4aa2-b492-a195f633e073" />
<img width="1587" height="781" alt="image" src="https://github.com/user-attachments/assets/b7ef8aca-2d61-4f95-ad76-54f5da2ac70f" />

### RabbitMQ Dashboard

<img width="1601" height="825" alt="image" src="https://github.com/user-attachments/assets/c68f8872-8c45-4eb2-aa07-5ea3f7292fc6" />
<img width="1601" height="624" alt="image" src="https://github.com/user-attachments/assets/c8175b3f-798c-4860-98dd-3afb3db55853" />


### Logging (EFK: Elasticsearch + Fluent Bit + Kibana)

This project ships logs to Elasticsearch using Fluent Bit, and visualizes them in Kibana.

Fluent Bit creates two daily indices:

kubernetes-YYYY.MM.DD → Kubernetes container logs (/var/log/containers/*.log)

node-YYYY.MM.DD → Node/kubelet logs (systemd kubelet.service)

Access Kibana

Port-forward Kibana:

```bash
kubectl -n logging port-forward svc/kibana-kibana 5601:5601
```

Open:
```bash
http://localhost:5601
```

Get the Elasticsearch credentials (used by Kibana login if prompted):
```bash
kubectl -n logging get secret elasticsearch-master-credentials \
  -o jsonpath='{.data.username}' | base64 -d; echo
```
```bash
kubectl -n logging get secret elasticsearch-master-credentials \
  -o jsonpath='{.data.password}' | base64 -d; echo
```

### Create Kibana Data Views

In Kibana:

Go to Stack Management → Data Views → Create data view

### Create these two data views:

1) Kubernetes logs

Name: kubernetes

Index pattern: kubernetes-*

Timestamp field: @timestamp

2) Node logs

Name: node

Index pattern: node-*

Timestamp field: @timestamp

### View Logs

Go to Discover and select:

kubernetes-* to see application/container logs

node-* to see kubelet/node logs
This is the Results You Should see in the UI:
<img width="1393" height="484" alt="Screenshot 2026-01-05 162054" src="https://github.com/user-attachments/assets/bd4462fe-6adb-4af0-9507-0e603080c587" />
Example for Dashboard Sorted via Namespace:
<img width="1901" height="751" alt="Screenshot 2025-12-31 174738" src="https://github.com/user-attachments/assets/29edcc10-b44c-41a9-a0c8-342d9eef6ee9" />



### Argocd Deploying
```bash
bash ./k8s/scripts/run-applicationsets.sh
```
### Argocd Dashboard view
<img width="1900" height="907" alt="image" src="https://github.com/user-attachments/assets/9f9fc548-8e27-4c56-9f58-10f7d00ed713" />
<img width="1899" height="911" alt="image" src="https://github.com/user-attachments/assets/70cda8d9-2ec6-4dae-b8e6-18481753a062" />

### Cleanup argocd applications
```bash
bash ./k8s/scripts/cleanup-applicationset.sh 
```
### Troubleshooting
fluentbit:
If Fluent Bit shows HTTP status=401 ... missing authentication credentials:
Ensure Fluent Bit outputs use HTTP_User ${ELASTIC_USERNAME} / HTTP_Passwd ${ELASTIC_PASSWORD}
Ensure the Fluent Bit pod has these env vars from the elasticsearch-master-credentials secret.

Argocd Applications delete stuck (For example if you see that after running cleanup applicationsets):
The 'dev-kibana' is still alive and outofsync run this command (Because the namespace logging isn't exist use the patch command):
```bash
kubectl patch application dev-kibana -n argocd --type=merge -p '{"metadata":{"finalizers":[]}}'
```
