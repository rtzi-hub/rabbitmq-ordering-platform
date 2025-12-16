#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MONITOR_NS="monitoring"
DASH_DIR="${ROOT_DIR}/monitoring/dashboards"
CM_NAME="grafana-dashboards"

kubectl create namespace messaging >/dev/null 2>&1 || true
kubectl create namespace database  >/dev/null 2>&1 || true
kubectl create namespace apps      >/dev/null 2>&1 || true
kubectl create namespace monitoring      >/dev/null 2>&1 || true

helm repo add bitnami https://charts.bitnami.com/bitnami >/dev/null 2>&1 || true
helm repo update >/dev/null 2>&1 || true

kubectl apply -f "${ROOT_DIR}/configmaps"

# Import All Dashborads inventory - Monitoring/dashborads/*.json
kubectl -n monitoring create configmap grafana-dashboards \
  --from-file="$DASH_DIR" \
  --dry-run=client -o yaml > /tmp/grafana-dashboards-cm.yaml

kubectl -n monitoring replace --force -f /tmp/grafana-dashboards-cm.yaml

kubectl -n monitoring label cm grafana-dashboards grafana_dashboard=1 --overwrite
kubectl -n monitoring annotate cm grafana-dashboards grafana_folder=CompanyDashboards --overwrite


# apply real secrets if present, ignore if missing
kubectl apply -f "${ROOT_DIR}/secrets/rabbitmq-credentials-apps.yaml"
kubectl apply -f "${ROOT_DIR}/secrets/rabbitmq-credentials-messaging.yaml"
kubectl apply -f "${ROOT_DIR}/secrets/postgresql-credentials-apps.yaml"
kubectl apply -f "${ROOT_DIR}/secrets/postgresql-credentials-database.yaml"
kubectl apply -f "${ROOT_DIR}/secrets/grafana-credentials.yaml"

helm upgrade --install rabbitmq bitnami/rabbitmq \
  -f "${ROOT_DIR}/values/dev/rabbitmq.yaml" \
  -n messaging

helm upgrade --install postgresql bitnami/postgresql \
  -f "${ROOT_DIR}/values/dev/postgresql.yaml" \
  -n database

helm upgrade --install order-api \
  "${ROOT_DIR}/charts/order-api-chart" \
  -f "${ROOT_DIR}/values/dev/order-api.yaml" \
  -n apps

helm upgrade --install payment-service \
  "${ROOT_DIR}/charts/payment-service-chart" \
  -f "${ROOT_DIR}/values/dev/payment-service.yaml" \
  -n apps

helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

helm upgrade --install kube-prometheus-stack \
  --create-namespace \
  --namespace "${MONITOR_NS}" \
  -f "${ROOT_DIR}/values/dev/kube-prom-stack.yaml" \
  prometheus-community/kube-prometheus-stack


helm upgrade --install postgres-exporter \
  prometheus-community/prometheus-postgres-exporter \
  -n database \
  -f k8s/monitoring/prom-exporters/postgresql-exporter.yaml

