#!/usr/bin/env bash
set -euo pipefail

echo "[1/2] Uninstalling Helm releases..."

helm uninstall order-api            -n apps        || echo "order-api not found, skipping"
helm uninstall payment-service      -n apps        || echo "payment-service not found, skipping"

helm uninstall rabbitmq             -n messaging   || echo "rabbitmq not found, skipping"
helm uninstall postgresql           -n database    || echo "postgresql not found, skipping"

helm uninstall kube-prometheus-stack -n monitoring || echo "kube-prometheus-stack not found, skipping"

# 2. Delete namespaces (this removes pods, services, configmaps, secrets, PVCs…)
echo "[2/2] Deleting namespaces..."

kubectl delete ns apps       --ignore-not-found=true
kubectl delete ns messaging  --ignore-not-found=true
kubectl delete ns database   --ignore-not-found=true
kubectl delete ns monitoring --ignore-not-found=true

echo "=== Cleanup finished. ==="
