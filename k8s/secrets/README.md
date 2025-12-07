## Active Secrets Before Deploy the helm charts!
```bash
kubectl apply -f k8s/secrets/rabbitmq-credentials-n-messaging.yaml
kubectl apply -f k8s/secrets/rabbitmq-credentials-n-apps.yaml
```
