helm uninstall argocd -n default
kubectl delete crd -n default appprojects.argoproj.io  applicationsets.argoproj.io  applications.argoproj.io


# Deletation option
```bash
kubectl get applications.argoproj.io -n argocd -o name | while read app; do
  kubectl patch "$app" -n argocd --type=json -p='[{"op":"remove","path":"/metadata/finalizers"}]' || true
done

kubectl delete ns argocd
kubectl get ns argocd
```
