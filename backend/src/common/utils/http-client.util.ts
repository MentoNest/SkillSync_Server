import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { getContextRequestId, createCorrelationHeaders } from '../utils/request-id.util';

/**
 * Create an Axios instance with request ID propagation
 * Automatically adds X-Request-Id, X-Correlation-Id, and W3C Trace Context headers
 * 
 * @example
 * const axiosWithRequestId = createHttpClientWithRequestId();
 * const response = await axiosWithRequestId.get('/api/external-service');
 */
export function createHttpClientWithRequestId(): AxiosInstance {
  const client = axios.create();

  // Add request interceptor to propagate request ID
  client.interceptors.request.use((config: InternalAxiosRequestConfig) => {
    const requestId = getContextRequestId();
    
    if (requestId) {
      const correlationHeaders = createCorrelationHeaders(requestId);
      config.headers = {
        ...config.headers,
        ...correlationHeaders,
      };
    }

    return config;
  });

  return client;
}

/**
 * Add request ID propagation to existing Axios instance
 * 
 * @param axiosInstance Axios instance to enhance
 * @example
 * const axios = require('axios');
 * addRequestIdInterceptor(axios);
 */
export function addRequestIdInterceptor(axiosInstance: AxiosInstance): void {
  axiosInstance.interceptors.request.use((config: InternalAxiosRequestConfig) => {
    const requestId = getContextRequestId();
    
    if (requestId) {
      const correlationHeaders = createCorrelationHeaders(requestId);
      config.headers = {
        ...config.headers,
        ...correlationHeaders,
      };
    }

    return config;
  });
}

/**
 * Create headers with request ID propagation for fetch API
 * 
 * @param additionalHeaders Optional additional headers to merge
 * @returns Headers object with request ID
 * @example
 * const headers = createFetchHeaders({ 'X-Custom-Header': 'value' });
 * const response = await fetch('/api/external', { headers });
 */
export function createFetchHeaders(
  additionalHeaders?: Record<string, string>,
): Record<string, string> {
  const requestId = getContextRequestId();
  
  const baseHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...additionalHeaders,
  };

  if (requestId) {
    const correlationHeaders = createCorrelationHeaders(requestId);
    return {
      ...baseHeaders,
      ...correlationHeaders,
    };
  }

  return baseHeaders;
}

/**
 * Fetch with automatic request ID propagation
 * Wrapper around native fetch that adds correlation headers
 * 
 * @param url URL to fetch
 * @param options Fetch options
 * @returns Promise with fetch response
 * @example
 * const response = await fetchWithRequestId('/api/external');
 */
export async function fetchWithRequestId(
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  const requestId = getContextRequestId();
  
  const headers = createFetchHeaders(
    options.headers as Record<string, string>,
  );

  return fetch(url, {
    ...options,
    headers,
  });
}
