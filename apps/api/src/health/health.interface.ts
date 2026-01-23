export interface HealthCheck {
  status: 'ok' | 'error';
  latencyMs: number;
  error?: string;
}

export interface ReadinessResponse {
  status: 'ok' | 'degraded' | 'error';
  checks: {
    db: HealthCheck;
    redis: HealthCheck;
  };
  timestamp: string;
}

export interface LivenessResponse {
  status: 'ok';
  uptime: number;
  timestamp: string;
}
