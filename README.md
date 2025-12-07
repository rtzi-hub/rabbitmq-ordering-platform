# Webserver With RabbitMQ Project

Small lab project that shows:

- Node.js **webserver** that publishes messages to RabbitMQ
- Node.js **consumer** that reads from RabbitMQ and writes to **PostgreSQL**
- All running on a single node Kubernetes cluster (kubeadm + containerd)

---

## 1. Tech Stack

- Kubernetes (kubeadm, single node)
- RabbitMQ (Bitnami Helm chart)
- PostgreSQL (Bitnami Helm chart)
- Node.js webserver
- Node.js consumer

---

## 2. Project Structure

```text
rabbitmq-webserver/
├─ app/                         # Node.js webserver + Dockerfile
├─ app-consumer/                # Node.js consumer + Dockerfile
├─ k8s/
│  ├─ charts/
│  │  ├─ webserver-chart/       # Local Helm chart for webserver
│  │  └─ consumer-chart/        # Local Helm chart for consumer
│  ├─ configmaps/
│  │  ├─ rabbitmq-config.yaml   # RabbitMQ non-sensitive settings (ns: apps)
│  │  └─ postgresql-config.yaml # PostgreSQL non-sensitive settings (ns: database)
│  ├─ secrets/
│  │  ├─ rabbitmq-credentials-messaging.yaml  # RabbitMQ credentials (ns: messaging)
│  │  ├─ rabbitmq-credentials-apps.yaml       # Webserver/consumer RabbitMQ creds (ns: apps)
│  │  └─ postgresql-credentials.yaml          # PostgreSQL credentials (ns: database)
│  ├─ scripts/
│  │  ├─ run-dev.sh             # Full dev deployment script
│  │  └─ cleanup-dev.sh         # Dev cleanup script
│  └─ values/
│     ├─ dev/
│     │  ├─ rabbitmq.yaml       # Dev values for Bitnami RabbitMQ
│     │  ├─ postgresql.yaml     # Dev values for Bitnami PostgreSQL
│     │  ├─ webserver.yaml      # Dev values for webserver chart
│     │  └─ consumer.yaml       # Dev values for consumer chart
│     └─ prod/                  # Optional prod values
├─ rabbitmq.md                  # Optional notes
└─ README.md
```
## 3. Requirements
- Kubernetes cluster (single node is enough)
Guide: Create (Kubernetes Cluster)[https://github.com/rtzi-hub/Kubernetes-Cluster-Creation-single-node-kubeadm/tree/main?tab=readme-ov-file#steps-to-create-kubernetes-cluster-single-node-kubeadm]
- kubectl and helm configured to talk to the cluster
- docker and a container registry (for example Docker Hub)

## 4. One Command Dev Setup
Recommended way to bring up the full stack (RabbitMQ, PostgreSQL, webserver, consumer):

1. Build and push images (see section 5.3)
2. From repo root:
```bash
bash k8s/scripts/run-dev.sh
```
This script:

- Creates namespaces:
- messaging for RabbitMQ
- apps for webserver and consumer
- database for PostgreSQL
- Applies ConfigMaps and Secrets
- Installs RabbitMQ and PostgreSQL (Bitnami)
- Installs webserver and consumer Helm charts

To clean everything:
```bash
bash k8s/scripts/cleanup-dev.sh
```
## 5. Manual Setup (Short Version)
If you prefer to run the steps yourself instead of the script.

### 5.1 Storage and Namespaces
```bash
# Storage
kubectl apply -f https://raw.githubusercontent.com/rancher/local-path-provisioner/v0.0.32/deploy/local-path-storage.yaml
kubectl patch storageclass local-path \
  -p '{"metadata":{"annotations":{"storageclass.kubernetes.io/is-default-class":"true"}}}' || true

# Namespaces
kubectl create namespace messaging || true
kubectl create namespace apps || true
kubectl create namespace database || true
```

### 5.2 Secrets and ConfigMaps
```bash
# RabbitMQ
kubectl apply -f k8s/secrets/rabbitmq-credentials-messaging.yaml
kubectl apply -f k8s/secrets/rabbitmq-credentials-apps.yaml
kubectl apply -f k8s/configmaps/rabbitmq-config.yaml

# PostgreSQL
kubectl apply -f k8s/secrets/postgresql-credentials.yaml
kubectl apply -f k8s/configmaps/postgresql-config.yaml
```

### 5.3 Build and Push Images
Update k8s/values/dev/webserver.yaml and k8s/values/dev/consumer.yaml to match your registry.
```bash
# Webserver image
cd app
docker build -t <DOCKER_USER>/rabbitmq-webserver:dev-1 .
docker push <DOCKER_USER>/rabbitmq-webserver:dev-1
cd ..
# Consumer image
cd app-consumer
docker build -t <DOCKER_USER>/rabbitmq-consumer:dev-1 .
docker push <DOCKER_USER>/rabbitmq-consumer:dev-1
cd ..
```

### 5.4 Install RabbitMQ and PostgreSQL
```bash
helm repo add bitnami https://charts.bitnami.com/bitnami || true
helm repo update

# RabbitMQ in namespace messaging
helm upgrade --install rabbitmq bitnami/rabbitmq \
  -n messaging \
  -f k8s/values/dev/rabbitmq.yaml

# PostgreSQL in namespace database
helm upgrade --install postgresql bitnami/postgresql \
  -n database \
  -f k8s/values/dev/postgresql.yaml
```
Wait for both to be ready:
```bash
kubectl wait --for=condition=ready pod -l app.kubernetes.io/name=rabbitmq -n messaging --timeout=180s
kubectl wait --for=condition=ready pod -l app.kubernetes.io/name=postgresql -n database --timeout=180s
```
### 5.5 Deploy Webserver and Consumer
```bash
# Webserver
helm upgrade --install webserver-chart \
  k8s/charts/webserver-chart \
  -n apps \
  -f k8s/values/dev/webserver.yaml

# Consumer
helm upgrade --install consumer-chart \
  k8s/charts/consumer-chart \
  -n apps \
  -f k8s/values/dev/consumer.yaml

kubectl get pods -n apps
```
At this point the flow is:

webserver → RabbitMQ queue → consumer → PostgreSQL table.
<img width="763" height="259" alt="image" src="https://github.com/user-attachments/assets/695df6b7-73ee-43e4-a24f-9a891284ff55" />

## 6. Basic Testing
### 6.1 Webserver HTTP
```bash
# Port forward webserver
kubectl port-forward -n apps deploy/webserver-chart-deployment 8080:8080
```
In another terminal:
```bash
# Health
curl http://localhost:8080/healthz
# Send message to queue
curl "http://localhost:8080/send?msg=hello-from-k8s"
```
You should see JSON with status: "sent".

### 6.2 RabbitMQ UI
```bash
kubectl port-forward svc/rabbitmq -n messaging 15672:15672
```
Open in browser:
```bash
http://localhost:15672
```
Use credentials from rabbitmq-credentials-messaging.yaml.
Check demo-queue and verify messages arrive when you hit /send.

### 6.3 Consumer and PostgreSQL
Check consumer logs:
```bash
kubectl logs -n apps -l app.kubernetes.io/name=consumer-chart
```
You should see messages that were consumed and written to PostgreSQL.

Optional: connect to PostgreSQL to inspect the data (table name and schema depend on app-consumer implementation):
```bash
kubectl exec -it -n database deploy/postgresql -- bash
psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
```
##7. Cleanup
Use the script:
```bash
bash k8s/scripts/cleanup-dev.sh
```
Or do it manually:
```bash
Copy code
helm uninstall webserver-chart -n apps || true
helm uninstall consumer-chart -n apps || true
helm uninstall rabbitmq -n messaging || true
helm uninstall postgresql -n database || true

kubectl delete pvc -n messaging --all || true
kubectl delete pvc -n database --all || true

kubectl delete namespace apps messaging database || true
```
