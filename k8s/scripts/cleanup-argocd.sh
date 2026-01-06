helm uninstall argocd -n default
kubectl delete crd -n default appprojects.argoproj.io  applicationsets.argoproj.io  applications.argoproj.io
