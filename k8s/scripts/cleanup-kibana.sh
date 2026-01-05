kubectl delete configmap kibana-kibana-helm-scripts -n logging
kubectl delete serviceaccount pre-install-kibana-kibana -n logging
kubectl delete serviceaccount post-install-kibana-kibana -n logging
kubectl delete roles pre-install-kibana-kibana -n logging
kubectl delete rolebindings pre-install-kibana-kibana -n logging
kubectl delete job pre-install-kibana-kibana -n logging
kubectl delete secrets kibana-kibana-es-token -n logging
kubectl delete roles post-install-kibana-kibana -n logging
