#!/usr/bin/env bash
set -euo pipefail

# K8s root: .../rabbitMQ-Webserver/k8s
K8S_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_ROOT="$(cd "${K8S_DIR}/.." && pwd)"

echo "[INFO] K8s root: ${K8S_DIR}"

echo "[INFO] Installing local-path storage..."
kubectl apply -f https://raw.githubusercontent.com/rancher/local-path-provisioner/v0.0.32/deploy/local-path-storage.yaml
kubectl patch storageclass local-path -p '{"metadata": {"annotations":{"storageclass.kubernetes.io/is-default-class":"true"}}}' 2>/dev/null || true

echo "[INFO] Creating namespaces..."
kubectl create namespace messaging 2>/dev/null || true
kubectl create namespace apps 2>/dev/null || true
kubectl create namespace database 2>/dev/null || true

echo "[INFO] Applying secrets..."
kubectl apply -f "${K8S_DIR}/secrets/rabbitmq-credentials-apps.yaml" 2>/dev/null || true
kubectl apply -f "${K8S_DIR}/secrets/rabbitmq-credentials-messaging.yaml" 2>/dev/null || true
kubectl apply -f "${K8S_DIR}/secrets/postgresql-credentials-apps.yaml" 2>/dev/null || true
kubectl apply -f "${K8S_DIR}/secrets/postgresql-credentials-database.yaml" 2>/dev/null || true

echo "[INFO] Applying ConfigMap..."
kubectl apply -f "${K8S_DIR}/configmaps/rabbitmq-config-apps.yaml"
kubectl apply -f "${K8S_DIR}/configmaps/postgresql-config-database.yaml" 2>/dev/null || true
kubectl apply -f "${K8S_DIR}/configmaps/postgresql-config-apps.yaml" 2>/dev/null || true

echo "[INFO] Adding Helm repo..."
helm repo add bitnami https://charts.bitnami.com/bitnami 2>/dev/null || true
helm repo update

echo "[INFO] Installing RabbitMQ..."
helm upgrade --install rabbitmq bitnami/rabbitmq \
  -n messaging \
  -f "${K8S_DIR}/values/dev/rabbitmq.yaml"

echo "[INFO] Installing PostgreSQL..."
helm upgrade --install postgresql bitnami/postgresql \
  -n database \
  -f "${K8S_DIR}/values/dev/postgresql.yaml" 2>/dev/null || true

echo "[INFO] Installing webserver..."
helm upgrade --install webserver-chart \
  "${K8S_DIR}/charts/webserver-chart" \
  -n apps \
  -f "${K8S_DIR}/values/dev/webserver.yaml"

echo "[INFO] Installing consumer..."
helm upgrade --install consumer-chart \
  "${K8S_DIR}/charts/consumer-chart" \
  -n apps \
  -f "${K8S_DIR}/values/dev/consumer.yaml" 2>/dev/null || true
