#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

kubectl create namespace messaging >/dev/null 2>&1 || true
kubectl create namespace database  >/dev/null 2>&1 || true
kubectl create namespace apps      >/dev/null 2>&1 || true

helm repo add bitnami https://charts.bitnami.com/bitnami >/dev/null 2>&1 || true
helm repo update >/dev/null 2>&1 || true

kubectl apply -f "${ROOT_DIR}/configmaps"

# apply real secrets if present, ignore if missing
kubectl apply -f "${ROOT_DIR}/secrets/rabbitmq-credentials-apps.yaml"
kubectl apply -f "${ROOT_DIR}/secrets/rabbitmq-credentials-messaging.yaml"
kubectl apply -f "${ROOT_DIR}/secrets/postgresql-credentials-apps.yaml"
kubectl apply -f "${ROOT_DIR}/secrets/postgresql-credentials-database.yaml"

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
