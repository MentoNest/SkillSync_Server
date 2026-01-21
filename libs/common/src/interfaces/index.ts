export interface HealthStatus {
  status: string;
  timestamp?: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
}
