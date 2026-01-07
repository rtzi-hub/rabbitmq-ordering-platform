kubectl create namespace argocd     >/dev/null 2>&1 || true

helm repo add argo https://argoproj.github.io/argo-helm

helm install argocd argo/argo-cd -f /k8s/values/dev/argocd.yaml -n argocd

