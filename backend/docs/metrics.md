# Prometheus Metrics

The backend exposes Prometheus text format at `GET /metrics`, outside the `/api/v1` prefix. The endpoint requires HTTP Basic authentication. Set both `METRICS_BASIC_AUTH_USERNAME` and `METRICS_BASIC_AUTH_PASSWORD`; if both are absent, the endpoint returns `503` and does not expose metrics, while setting only one prevents the application from starting. Use TLS or a private network between Prometheus and the backend, and store the password in a secret file rather than committing it to configuration.

## Metrics

- `http_requests_total` and `http_request_duration_seconds`: request totals and latency by method, route template, and status code.
- `http_errors_total`: HTTP responses with a 5xx status.
- `active_http_connections`, `active_http_requests`, and `active_users`: open HTTP sockets, in-flight requests, and distinct authenticated users with an in-flight request.
- `db_queries_total`, `db_query_duration_seconds`, and `db_connection_pool_size`: database query totals, duration observations, and configured maximum pool size.
- `redis_operations_total` and `redis_operation_duration_seconds`: Redis-service operation totals and durations, including fallback-store operations.
- `jwt_verification_failures_total`: expired and invalid bearer-token verification attempts.
- Default Node.js process metrics from `prom-client`.

Route labels use Express route templates rather than raw URLs, avoiding per-user or per-resource label cardinality.

## Prometheus

Add a scrape job to `prometheus.yml`. The password file must contain only the configured metrics password and be readable by the Prometheus process.

```yaml
scrape_configs:
  - job_name: skillsync-backend
    metrics_path: /metrics
    static_configs:
      - targets: ['backend:3000']
    basic_auth:
      username: prometheus
      password_file: /etc/prometheus/secrets/skillsync-metrics-password
```

Replace the target with the backend address reachable from Prometheus and set the backend username/password to match. Reload Prometheus or restart it after changing the scrape configuration.

## Grafana

In Grafana, add the Prometheus server as a data source, then create panels using queries such as:

```promql
sum(rate(http_requests_total[5m]))
```

```promql
histogram_quantile(0.95, sum by (le) (rate(http_request_duration_seconds_bucket[5m])))
```

```promql
sum(rate(http_errors_total[5m])) / clamp_min(sum(rate(http_requests_total[5m])), 1)
```

```promql
sum by (operation) (rate(redis_operations_total[5m]))
```

```promql
sum by (operation) (rate(db_queries_total[5m]))
```

Use `active_users`, `active_http_connections`, `active_http_requests`, `db_connection_pool_size`, and `jwt_verification_failures_total` for current-state and security panels.
