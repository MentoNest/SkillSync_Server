import { generateRequestId, isValidRequestId, extractOrGenerateRequestId, createCorrelationHeaders } from './request-id.util';
import { Request } from 'express';

describe('request-id.util', () => {
  test('generateRequestId produces a valid UUID v4', () => {
    const id = generateRequestId();
    expect(typeof id).toBe('string');
    expect(isValidRequestId(id)).toBe(true);
  });

  test('extractOrGenerateRequestId returns header value if present', () => {
    const req = { headers: { 'x-request-id': 'test-id-123' } } as unknown as Request;
    const id = extractOrGenerateRequestId(req);
    expect(id).toBe('test-id-123');
  });

  test('createCorrelationHeaders returns expected keys', () => {
    const id = '11111111-2222-4333-8444-555555555555';
    const headers = createCorrelationHeaders(id);
    expect(headers['X-Request-Id']).toBe(id);
    expect(headers['X-Correlation-Id']).toBe(id);
    expect(headers['Traceparent']).toMatch(/^00-/);
  });
});
