#!/usr/bin/env bash
set -euo pipefail

echo "[INFO] Uninstalling Helm releases..."
helm uninstall webserver-chart -n apps 2>/dev/null || true
helm uninstall consumer-chart -n apps 2>/dev/null || true
helm uninstall rabbitmq -n messaging 2>/dev/null || true
helm uninstall postgresql -n database 2>/dev/null || true

echo "[INFO] Deleting PVCs..."
kubectl delete pvc -n messaging --all 2>/dev/null || true
kubectl delete pvc -n database --all 2>/dev/null || true
kubectl delete pvc -n default --all 2>/dev/null || true

echo "[INFO] Deleting secrets..."
kubectl delete secret rabbitmq-credentials -n messaging 2>/dev/null || true
kubectl delete secret rabbitmq-credentials -n apps 2>/dev/null || true
kubectl delete secret postgresql-credentials -n apps 2>/dev/null || true
kubectl delete secret postgresql-credentials -n database 2>/dev/null || true

echo "[INFO] Deleting configmaps..."
kubectl delete configmap rabbitmq-config -n apps 2>/dev/null || true
kubectl delete configmap postgresql-config -n database 2>/dev/null || true
kubectl delete configmap postgresql-config -n apps 2>/dev/null || true
