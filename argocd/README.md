## ArgoCD First Installation Guide
This guide is an explanation how to install and expose the argocd before deploying the application.
### Create the namespace for the argocd
```bash
kubectl create namespace argocd     >/dev/null 2>&1 || true
```
### Adding repo ArgoCD helm
```bash
helm repo add argo https://argoproj.github.io/argo-helm
```
### Installing the argo
```bash
helm install argocd argo/argo-cd -f /k8s/values/dev/argocd.yaml -n argocd
```

### Get Password
```bash
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 --decode
```
### Access to the argocd command
```bash
kubectl port-forward svc/argocd-server -n argocd 8080:443
```
### Run the bash script
```bash
bash ../k8s/scripts/first-installation-argocd.sh
```

### Run the applicationsets to run the applications (Order-api, Payment-service, postgresql, rabbitmq, premetheus, grafana, EFK)
```bash
kubectl apply -n argocd -f argocd/applicationsets/dev-platform-kustomize.yaml
kubectl apply -n argocd -f argocd/applicationsets/dev-platform-helm.yaml
```
