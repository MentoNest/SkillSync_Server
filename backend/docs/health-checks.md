# Health Checks

`GET /health` is a public readiness check outside the `/api/v1` prefix. It checks PostgreSQL with `SELECT 1`, Redis with `PING`, and reports process memory usage. The database and Redis checks run concurrently with a 75 ms timeout; a missing Redis connection, unexpected PING response, query failure, or timeout marks the response unhealthy and returns HTTP `503`. A healthy response returns HTTP `200` with component statuses, response times, process uptime, and timestamp.

`GET /health/live` is a public liveness check that only reports whether the process is responding. It intentionally does not check dependencies, so Kubernetes restarts are not triggered by a transient database or Redis outage. Both routes require no authentication.

## Kubernetes

Use readiness to stop routing traffic while a critical dependency is unavailable, and liveness to restart only an unresponsive application process:

```yaml
spec:
  containers:
    - name: skillsync-backend
      ports:
        - name: http
          containerPort: 3000
      startupProbe:
        httpGet:
          path: /health/live
          port: http
        periodSeconds: 5
        failureThreshold: 30
      livenessProbe:
        httpGet:
          path: /health/live
          port: http
        periodSeconds: 10
        timeoutSeconds: 2
        failureThreshold: 3
      readinessProbe:
        httpGet:
          path: /health
          port: http
        periodSeconds: 5
        timeoutSeconds: 2
        failureThreshold: 2
```

Merge these probe settings into the application's existing Deployment container spec and adjust the port name/number to match the deployment.
