kubectl create namespace argocd     >/dev/null 2>&1 || true

helm repo add argo https://argoproj.github.io/argo-helm

kubectl create namespace argocd

helm install argocd argo/argo-cd -f ./k8s/values/dev/argocd.yaml -n argocd

kubectl -n argocd port-forward svc/argocd-server 8085:443

kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d
