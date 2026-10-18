/**
 * In-process Prometheus text exposition (#1473).
 * Lightweight registry — avoids coupling every request to external I/O.
 */

type Labels = Record<string, string>;

function labelKey(labels: Labels): string {
  return Object.keys(labels)
    .sort()
    .map((k) => `${k}=${labels[k]}`)
    .join(',');
}

class Counter {
  private values = new Map<string, { labels: Labels; value: number }>();
  constructor(
    public readonly name: string,
    public readonly help: string,
    public readonly labelNames: string[],
  ) {}

  inc(labels: Labels = {}, by = 1): void {
    const key = labelKey(labels);
    const cur = this.values.get(key);
    if (cur) cur.value += by;
    else this.values.set(key, { labels: { ...labels }, value: by });
  }

  get(labels: Labels = {}): number {
    return this.values.get(labelKey(labels))?.value ?? 0;
  }

  collect(): string {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} counter`];
    for (const { labels, value } of this.values.values()) {
      const ls = Object.entries(labels)
        .map(([k, v]) => `${k}="${v}"`)
        .join(',');
      lines.push(ls ? `${this.name}{${ls}} ${value}` : `${this.name} ${value}`);
    }
    if (this.values.size === 0) lines.push(`${this.name} 0`);
    return lines.join('\n');
  }
}

class Gauge {
  private values = new Map<string, { labels: Labels; value: number }>();
  constructor(
    public readonly name: string,
    public readonly help: string,
  ) {}

  set(value: number, labels: Labels = {}): void {
    this.values.set(labelKey(labels), { labels: { ...labels }, value });
  }

  collect(): string {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} gauge`];
    for (const { labels, value } of this.values.values()) {
      const ls = Object.entries(labels)
        .map(([k, v]) => `${k}="${v}"`)
        .join(',');
      lines.push(ls ? `${this.name}{${ls}} ${value}` : `${this.name} ${value}`);
    }
    if (this.values.size === 0) lines.push(`${this.name} 0`);
    return lines.join('\n');
  }
}

/** Cumulative histogram with fixed buckets (seconds). */
class Histogram {
  private readonly buckets: number[];
  private data = new Map<
    string,
    { labels: Labels; counts: number[]; sum: number; count: number }
  >();

  constructor(
    public readonly name: string,
    public readonly help: string,
    buckets: number[] = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  ) {
    this.buckets = [...buckets].sort((a, b) => a - b);
  }

  observe(seconds: number, labels: Labels = {}): void {
    const key = labelKey(labels);
    let row = this.data.get(key);
    if (!row) {
      row = {
        labels: { ...labels },
        counts: this.buckets.map(() => 0),
        sum: 0,
        count: 0,
      };
      this.data.set(key, row);
    }
    row.sum += seconds;
    row.count += 1;
    for (let i = 0; i < this.buckets.length; i++) {
      if (seconds <= this.buckets[i]) row.counts[i] += 1;
    }
  }

  collect(): string {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} histogram`];
    for (const row of this.data.values()) {
      const base = Object.entries(row.labels)
        .map(([k, v]) => `${k}="${v}"`)
        .join(',');
      let cumulative = 0;
      for (let i = 0; i < this.buckets.length; i++) {
        cumulative = row.counts[i];
        const le = this.buckets[i];
        const ls = base ? `${base},le="${le}"` : `le="${le}"`;
        lines.push(`${this.name}_bucket{${ls}} ${cumulative}`);
      }
      const infLs = base ? `${base},le="+Inf"` : `le="+Inf"`;
      lines.push(`${this.name}_bucket{${infLs}} ${row.count}`);
      lines.push(
        base
          ? `${this.name}_sum{${base}} ${row.sum}`
          : `${this.name}_sum ${row.sum}`,
      );
      lines.push(
        base
          ? `${this.name}_count{${base}} ${row.count}`
          : `${this.name}_count ${row.count}`,
      );
    }
    return lines.join('\n');
  }
}

export const httpRequestsTotal = new Counter(
  'http_requests_total',
  'Total HTTP requests',
  ['method', 'path', 'status'],
);

export const httpRequestDuration = new Histogram(
  'http_request_duration_seconds',
  'HTTP request duration in seconds',
);

export const dbQueryDuration = new Histogram(
  'db_query_duration_seconds',
  'Database query duration in seconds',
);

export const dbPoolSize = new Gauge(
  'db_connection_pool_size',
  'Database connection pool size',
);

export const redisOpDuration = new Histogram(
  'redis_operation_duration_seconds',
  'Redis operation duration in seconds',
);

export const activeUsers = new Gauge('active_users', 'Approximate active authenticated users');

export const jwtVerificationFailures = new Counter(
  'jwt_verification_failures_total',
  'JWT verification failures',
  ['reason'],
);

export const activeConnections = new Gauge(
  'active_connections',
  'Active HTTP connections observed by the metrics middleware',
);

export function renderMetrics(): string {
  return [
    httpRequestsTotal.collect(),
    httpRequestDuration.collect(),
    dbQueryDuration.collect(),
    dbPoolSize.collect(),
    redisOpDuration.collect(),
    activeUsers.collect(),
    jwtVerificationFailures.collect(),
    activeConnections.collect(),
  ].join('\n\n');
}

/** Helpers for other modules */
export function observeDbQuery(seconds: number, operation = 'query'): void {
  dbQueryDuration.observe(seconds, { operation });
}

export function observeRedisOp(seconds: number, operation = 'cmd'): void {
  redisOpDuration.observe(seconds, { operation });
}

export function recordJwtFailure(reason: string): void {
  jwtVerificationFailures.inc({ reason });
}
