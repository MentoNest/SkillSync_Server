import express from 'express';
import request from 'supertest';
import { configureSecurityHeaders } from './security-headers.js';

describe('security headers', () => {
  it('sets the required headers on responses', async () => {
    const app = express();
    configureSecurityHeaders(app as never, 'production');
    app.get('/health', (_request, response) => response.sendStatus(200));

    const response = await request(app).get('/health');

    expect(response.headers['content-security-policy']).toContain(
      "default-src 'self'",
    );
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['x-xss-protection']).toBe('1; mode=block');
    expect(response.headers['strict-transport-security']).toContain(
      'max-age=31536000',
    );
    expect(response.headers['x-powered-by']).toBeUndefined();
  });
});
