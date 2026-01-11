# RabbitMQ Ordering Platform

A microservices demo for an online ticket ordering system built using RabbitMQ, Node.js, PostgreSQL, Kubernetes, and ArgoCD. It illustrates an event-driven architecture with clear separation of services, manual payment handling, and observability tools like Prometheus/Grafana and EFK (Elasticsearch, Fluent Bit, Kibana).

## Table of Contents

- [Introduction](#introduction)
- [Architecture & Flow](#architecture--flow)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Installation (Dev Stack)](#installation-dev-stack)
- [Usage](#usage)
- [Observability](#observability)
  - [Monitoring (Prometheus & Grafana)](#monitoring-prometheus--grafana)
  - [Logging (EFK Stack)](#logging-efk-stack)
- [Deployment with ArgoCD](#deployment-with-argocd)
- [Troubleshooting & Cleanup](#troubleshooting--cleanup)
- [Contributing](#contributing)
- [License](#license)

## Introduction

This platform simulates a simple order/payment microservices system:
- Uses RabbitMQ for message-based communication.
- Deployed via Helm and optionally via ArgoCD.
- Built for educational purposes to explore event-driven systems on Kubernetes.

## Architecture & Flow

### Services
- Order API:
  - Accepts HTTP orders.
  - Checks seat availability and creates PENDING orders.
  - Publishes order.created events to RabbitMQ.

- Payment Service:
  - Consumes order.created events.
  - Creates a PENDING payment record.
  - Supports manual approval or rejection of payments via API.

### Messaging
- RabbitMQ:
  - Topic exchange: events.topic
  - Queue: payment.order-created.q

### Payment API Endpoints
- POST /payments/{orderId}/approve: Marks payment as SUCCEEDED, confirms order.
- POST /payments/{orderId}/reject: Marks payment as FAILED, cancels order.

### Data Storage
- Uses PostgreSQL for storing orders, payments, and inventory.
- Services have separate tables for their responsibilities.

## Project Structure

```
rabbitmq-ordering-platform/
├─ .github/                      # GitHub workflows / CI helpers
├─ app/
│  ├─ order-api/                 # Order HTTP API
│  └─ payment-service/           # Payment worker
├─ archive/                      # Old / extra files (optional)
├─ argocd/
│  ├─ applicationsets/           # ArgoCD ApplicationSets
│  └─ README.md                  # ArgoCD notes / usage
├─ ci-test/                      # CI / test scripts
├─ k8s/
│  ├─ bootstrap/                 # Cluster bootstrap manifests (namespaces, base setup)
│  ├─ charts/                    # Local Helm charts (order-api, payment-service, etc.)
│  ├─ configmaps/                # Shared nonsecret configuration (RabbitMQ, Postgres, etc.)
│  ├─ logging/                   # EFK logging stack manifests / dashboards
│  ├─ monitoring/                # Prometheus/Grafana manifests / dashboards
│  ├─ scripts/
│  │  ├─ run-dev.sh              # Spin up full dev stack
│  │  ├─ cleanup-kibana.sh       # Reset / cleanup Kibana (logging)
│  │  └─ cleanup-dev.sh          # Tear down / reset dev stack
│  ├─ secrets/                   # Secrets manifests
│  └─ values/
│     ├─ dev/                    # Dev environment values
│     │  ├─ argocd.yaml
│     │  ├─ elasticsearch.yaml
│     │  ├─ fluentbit.yaml
│     │  ├─ kibana.yaml
│     │  ├─ kube-prom-stack.yaml
│     │  ├─ order-api.yaml
│     │  ├─ payment-service.yaml
│     │  ├─ postgresql.yaml
│     │  └─ rabbitmq.yaml
│     └─ prod/                   # Prod environment values (if used)
├─ .gitignore
└─ README.md
```

## Prerequisites

Ensure the following are installed:
- Kubernetes cluster (Minikube or kind)
- kubectl
- helm (v3+)
- Docker (optional)

## Installation (Dev Stack)

```bash
git clone https://github.com/your-user/rabbitmq-ordering-platform.git
cd rabbitmq-ordering-platform/k8s/scripts
./run-dev.sh
```

## Usage

### Step-by-Step Flow

1. Port-forward Order API:
   ```bash
   kubectl -n apps port-forward deploy/order-api-order-api-chart 8080:8080
   ```

2. Access Dashboard:
   Open: http://localhost:8080

3. Create an Order:
   ```bash
   curl -X POST http://localhost:8080/orders      -H "Content-Type: application/json"      -d '{"userId":123,"showId":1,"quantity":2}'
   ```

4. Port-forward Payment Service:
   ```bash
   kubectl -n apps port-forward svc/payment-service-payment-service-chart-svc 8081:8081
   ```

5. View Pending Payments:
   ```bash
   curl http://localhost:8081/payments
   ```

6. Approve Payment:
   ```bash
   curl -X POST http://localhost:8081/payments/1/approve
   ```

7. Reject Payment (optional):
   ```bash
   curl -X POST http://localhost:8081/payments/1/reject
   ```

Pods list of the lab results:
<img width="726" height="266" alt="image" src="https://github.com/user-attachments/assets/94e4d83b-f4f6-4f3b-9c0e-d954979e0091" />

8. Refresh the UI to see updated statuses.

## Observability

### Monitoring (Prometheus & Grafana)

1. Install kube-prometheus-stack:
   ```bash
   helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
   helm upgrade --install kube-prometheus-stack prometheus-community/kube-prometheus-stack      -n monitoring --create-namespace      -f k8s/values/dev/kube-prom-stack.yaml
   ```

2. Port-forward Grafana:
   ```bash
   kubectl -n monitoring port-forward svc/kube-prometheus-stack-grafana 3000:80
   ```

3. Access Grafana: http://localhost:3000  
   - Default credentials: admin/prom-operator

4. Dashboards Provided:
   - Kubernetes Overview
   - RabbitMQ Queues
   - PostgreSQL Metrics
   - Node/VM Resource Usage

Landing page example for the result of the rejected payment + the approved payment (PAY ATTENTION That the Quantity is changing according to the approval):
<img width="1182" height="593" alt="image" src="https://github.com/user-attachments/assets/ea2df57a-95b3-4b4e-a1be-cf1c0718ccc4" />



<img width="1603" height="819" alt="image" src="https://github.com/user-attachments/assets/10f48680-82e0-480b-88ca-f26149229c74" />

### K8s & Platform Overview

<img width="1007" height="656" alt="image" src="https://github.com/user-attachments/assets/802a5ba4-da9c-47b8-96a1-f181309652d8" />


### DB Overview

<img width="1619" height="676" alt="image" src="https://github.com/user-attachments/assets/d65f240b-4ce1-4aa2-b492-a195f633e073" />
<img width="1587" height="781" alt="image" src="https://github.com/user-attachments/assets/b7ef8aca-2d61-4f95-ad76-54f5da2ac70f" />

### RabbitMQ Dashboard

<img width="1601" height="825" alt="image" src="https://github.com/user-attachments/assets/c68f8872-8c45-4eb2-aa07-5ea3f7292fc6" />
<img width="1601" height="624" alt="image" src="https://github.com/user-attachments/assets/c8175b3f-798c-4860-98dd-3afb3db55853" />

### Logging (EFK Stack)

1. Deploy EFK stack using Helm or ArgoCD.
2. Port-forward Kibana:
   ```bash
   kubectl -n logging port-forward svc/kibana-kibana 5601:5601
   ```

3. Access Kibana: http://localhost:5601  
   - Use credentials from elasticsearch-master-credentials secret.

4. Create Data Views:
   - kubernetes-* → "kubernetes"
   - node-* → "node"

5. Explore Logs in Discover tab using filters.

node-* to see kubelet/node logs
This is the Results You Should see in the UI:
<img width="1393" height="484" alt="Screenshot 2026-01-05 162054" src="https://github.com/user-attachments/assets/bd4462fe-6adb-4af0-9507-0e603080c587" />
Example for Dashboard Sorted via Namespace:
<img width="1901" height="751" alt="Screenshot 2025-12-31 174738" src="https://github.com/user-attachments/assets/29edcc10-b44c-41a9-a0c8-342d9eef6ee9" />

## Deployment with ArgoCD

1. Install ArgoCD and access the UI:
   ```bash
   kubectl -n argocd port-forward svc/argocd-server 8085:443
   ```

2. Run ApplicationSets:
   ```bash
   k8s/scripts/run-applicationsets.sh
   ```

3. Watch Deployment in ArgoCD UI.

## Troubleshooting & Cleanup

### Cleanup Dev Stack

- If using scripts:
  ```bash
  k8s/scripts/cleanup-dev.sh
  ```

- If using ArgoCD:
  ```bash
  k8s/scripts/cleanup-applicationset.sh
  ```

### Argocd Dashboard view
<img width="1900" height="907" alt="image" src="https://github.com/user-attachments/assets/9f9fc548-8e27-4c56-9f58-10f7d00ed713" />
<img width="1899" height="911" alt="image" src="https://github.com/user-attachments/assets/70cda8d9-2ec6-4dae-b8e6-18481753a062" />


### Common Issues

- Fluent Bit 401: Ensure correct credentials from elasticsearch-master-credentials secret.
- Stuck ArgoCD App:
  ```bash
  kubectl patch application dev-kibana -n argocd --type=merge -p '{"metadata":{"finalizers":[]}}'
  ```
- Check Logs/Events:
  ```bash
  kubectl logs <pod>
  kubectl get events
  ```

## Contributing

Feel free to fork the repo, submit PRs, or open issues. This project is meant as a learning resource for exploring microservices and event-driven architectures.

## License

MIT License. See LICENSE file for details.

Enjoy exploring the RabbitMQ Ordering Platform.
