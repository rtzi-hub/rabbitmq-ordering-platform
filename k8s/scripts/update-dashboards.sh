set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MONITOR_NS="monitoring"
DASH_DIR="${ROOT_DIR}/monitoring/dashboards"
CM_NAME="grafana-dashboards"

kubectl -n monitoring create configmap "$CM_NAME" \
  --from-file="$DASH_DIR" \
  --dry-run=client -o yaml > /tmp/grafana-dashboards-cm.yaml

kubectl -n monitoring replace --force -f /tmp/grafana-dashboards-cm.yaml

kubectl -n monitoring label cm grafana-dashboards grafana_dashboard=1 --overwrite
kubectl -n monitoring annotate cm grafana-dashboards grafana_folder=CompanyDashboards --overwrite

