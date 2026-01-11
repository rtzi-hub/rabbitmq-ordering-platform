kubectl delete configmap kibana-kibana-helm-scripts -n logging
kubectl delete serviceaccount pre-install-kibana-kibana -n logging
kubectl delete serviceaccount post-install-kibana-kibana -n logging
kubectl delete roles pre-install-kibana-kibana -n logging
kubectl delete rolebindings pre-install-kibana-kibana -n logging
kubectl delete job pre-install-kibana-kibana -n logging
kubectl delete secrets kibana-kibana-es-token -n logging
kubectl delete roles post-install-kibana-kibana -n logging



# Deleting the kibana resources for the logging ns
kubectl patch -n logging configmap/kibana-kibana-helm-scripts \
  --type='json' -p='[{"op":"remove","path":"/metadata/finalizers"}]' || true

kubectl patch -n logging serviceaccount/pre-install-kibana-kibana \
  --type='json' -p='[{"op":"remove","path":"/metadata/finalizers"}]' || true

kubectl patch -n logging role.rbac.authorization.k8s.io/pre-install-kibana-kibana \
  --type='json' -p='[{"op":"remove","path":"/metadata/finalizers"}]' || true

kubectl patch -n logging rolebinding.rbac.authorization.k8s.io/pre-install-kibana-kibana \
  --type='json' -p='[{"op":"remove","path":"/metadata/finalizers"}]' || true

kubectl delete -n logging configmap/kibana-kibana-helm-scripts --grace-period=0 --force
kubectl delete -n logging serviceaccount/pre-install-kibana-kibana --grace-period=0 --force
kubectl delete -n logging role/pre-install-kibana-kibana --grace-period=0 --force
kubectl delete -n logging rolebinding/pre-install-kibana-kibana --grace-period=0 --force
kubectl delete -n logging job/kibana-import-saved-objects --grace-period=0 --force


#Cleanup application
kubectl -n argocd patch application dev-kibana -p '{"metadata":{"finalizers":[]}}' --type=merge
kubectl -n argocd patch application dev-kibana-import -p '{"metadata":{"finalizers":[]}}' --type=merge


# logging namespace
kubectl -n logging patch job kibana-import-saved-objects \
  --type=merge -p '{"metadata":{"finalizers":[]}}'

 kubectl -n logging patch job pre-install-kibana-kibana \
  --type=merge -p '{"metadata":{"finalizers":[]}}'
#Delete namespace
 kubectl delete namespace logging --force --grace-period=0
