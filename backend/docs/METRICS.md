# Prometheus metrics (#1473)

## Endpoint

`GET /metrics` — Prometheus text format (`text/plain; version=0.0.4`).

### Series

| Metric | Type | Labels |
| --- | --- | --- |
| `http_requests_total` | counter | method, path, status |
| `http_request_duration_seconds` | histogram | method, path |
| `db_query_duration_seconds` | histogram | operation |
| `db_connection_pool_size` | gauge | — |
| `redis_operation_duration_seconds` | histogram | operation |
| `active_users` | gauge | — |
| `jwt_verification_failures_total` | counter | reason |
| `active_connections` | gauge | — |

## Security

Set either or both:

```env
METRICS_BASIC_AUTH_USER=prom
METRICS_BASIC_AUTH_PASS=secret
METRICS_ALLOWED_IPS=10.0.0.0/8,127.0.0.1
```

When basic auth is configured, scrapers must send `Authorization: Basic …`.

## Grafana

1. Add a Prometheus datasource scraping `http://backend:3000/metrics`.
2. Import panels for `rate(http_requests_total[5m])` and
   `histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))`.

Example `prometheus.yml` scrape config:

```yaml
scrape_configs:
  - job_name: skillsync
    metrics_path: /metrics
    basic_auth:
      username: prom
      password: secret
    static_configs:
      - targets: ['backend:3000']
```
