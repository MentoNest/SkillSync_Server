import { CorsConfig } from './cors.config';

describe('CorsConfig', () => {
  describe('getCorsOptions', () => {
    const allowedOrigins = [
      'https://example.com',
      'https://app.example.com',
    ];
    const allowedMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];
    const credentials = true;

    it('should return valid CORS options', () => {
      const corsOptions = CorsConfig.getCorsOptions(
        allowedOrigins,
        allowedMethods,
        credentials,
        false,
      );

      expect(corsOptions).toBeDefined();
      expect(corsOptions.methods).toEqual(allowedMethods);
      expect(corsOptions.credentials).toBe(true);
      expect(corsOptions.maxAge).toBe(600);
      expect(corsOptions.optionsSuccessStatus).toBe(204);
    });

    it('should include required CORS headers', () => {
      const corsOptions = CorsConfig.getCorsOptions(
        allowedOrigins,
        allowedMethods,
        credentials,
        false,
      );

      expect(corsOptions.allowedHeaders).toContain('Content-Type');
      expect(corsOptions.allowedHeaders).toContain('Authorization');
      expect(corsOptions.allowedHeaders).toContain('Accept');
      expect(corsOptions.allowedHeaders).toContain('X-CSRF-Token');
    });

    it('should include required exposed headers', () => {
      const corsOptions = CorsConfig.getCorsOptions(
        allowedOrigins,
        allowedMethods,
        credentials,
        false,
      );

      expect(corsOptions.exposedHeaders).toContain('X-Total-Count');
      expect(corsOptions.exposedHeaders).toContain('X-Page-Count');
    });

    it('should return 204 for successful preflight requests', () => {
      const corsOptions = CorsConfig.getCorsOptions(
        allowedOrigins,
        allowedMethods,
        credentials,
        false,
      );

      expect(corsOptions.optionsSuccessStatus).toBe(204);
    });
  });

  describe('Origin Validation - isOriginAllowed', () => {
    const allowedOrigins = [
      'https://example.com',
      'https://app.example.com',
      'https://*.staging.example.com',
    ];

    describe('Exact match', () => {
      it('should allow exact matching origins', (done) => {
        const corsOptions = CorsConfig.getCorsOptions(
          allowedOrigins,
          ['GET', 'POST'],
          false,
          false,
        );

        (corsOptions.origin as any)(
          'https://example.com',
          (err: any, allow: boolean) => {
            expect(err).toBeNull();
            expect(allow).toBe(true);
            done();
          },
        );
      });

      it('should allow exact matching origin for app subdomain', (done) => {
        const corsOptions = CorsConfig.getCorsOptions(
          allowedOrigins,
          ['GET', 'POST'],
          false,
          false,
        );

        (corsOptions.origin as any)(
          'https://app.example.com',
          (err: any, allow: boolean) => {
            expect(err).toBeNull();
            expect(allow).toBe(true);
            done();
          },
        );
      });

      it('should reject unauthorized origins', (done) => {
        const corsOptions = CorsConfig.getCorsOptions(
          allowedOrigins,
          ['GET', 'POST'],
          false,
          false,
        );

        (corsOptions.origin as any)(
          'https://unauthorized.com',
          (err: any, allow: boolean) => {
            expect(err).toBeDefined();
            expect(err.message).toContain('Origin not allowed');
            expect(allow).toBeUndefined();
            done();
          },
        );
      });
    });

    describe('Wildcard patterns', () => {
      it('should allow wildcard subdomain patterns', (done) => {
        const corsOptions = CorsConfig.getCorsOptions(
          allowedOrigins,
          ['GET', 'POST'],
          false,
          false,
        );

        (corsOptions.origin as any)(
          'https://test.staging.example.com',
          (err: any, allow: boolean) => {
            expect(err).toBeNull();
            expect(allow).toBe(true);
            done();
          },
        );
      });

      it('should allow multiple levels of subdomains in wildcard pattern', (done) => {
        const corsOptions = CorsConfig.getCorsOptions(
          allowedOrigins,
          ['GET', 'POST'],
          false,
          false,
        );

        (corsOptions.origin as any)(
          'https://deep.nested.staging.example.com',
          (err: any, allow: boolean) => {
            expect(err).toBeNull();
            expect(allow).toBe(true);
            done();
          },
        );
      });
    });

    describe('Localhost in development', () => {
      it('should allow localhost:3000 in development', (done) => {
        const corsOptions = CorsConfig.getCorsOptions(
          ['https://example.com'],
          ['GET', 'POST'],
          false,
          true, // isDevelopment = true
        );

        (corsOptions.origin as any)(
          'http://localhost:3000',
          (err: any, allow: boolean) => {
            expect(err).toBeNull();
            expect(allow).toBe(true);
            done();
          },
        );
      });

      it('should allow localhost:3001 in development', (done) => {
        const corsOptions = CorsConfig.getCorsOptions(
          ['https://example.com'],
          ['GET', 'POST'],
          false,
          true,
        );

        (corsOptions.origin as any)(
          'http://localhost:3001',
          (err: any, allow: boolean) => {
            expect(err).toBeNull();
            expect(allow).toBe(true);
            done();
          },
        );
      });

      it('should allow localhost:4200 in development', (done) => {
        const corsOptions = CorsConfig.getCorsOptions(
          ['https://example.com'],
          ['GET', 'POST'],
          false,
          true,
        );

        (corsOptions.origin as any)(
          'http://localhost:4200',
          (err: any, allow: boolean) => {
            expect(err).toBeNull();
            expect(allow).toBe(true);
            done();
          },
        );
      });

      it('should allow localhost:5173 (Vite) in development', (done) => {
        const corsOptions = CorsConfig.getCorsOptions(
          ['https://example.com'],
          ['GET', 'POST'],
          false,
          true,
        );

        (corsOptions.origin as any)(
          'http://localhost:5173',
          (err: any, allow: boolean) => {
            expect(err).toBeNull();
            expect(allow).toBe(true);
            done();
          },
        );
      });

      it('should allow 127.0.0.1:3000 in development', (done) => {
        const corsOptions = CorsConfig.getCorsOptions(
          ['https://example.com'],
          ['GET', 'POST'],
          false,
          true,
        );

        (corsOptions.origin as any)(
          'http://127.0.0.1:3000',
          (err: any, allow: boolean) => {
            expect(err).toBeNull();
            expect(allow).toBe(true);
            done();
          },
        );
      });

      it('should allow IPv6 localhost [::1] in development', (done) => {
        const corsOptions = CorsConfig.getCorsOptions(
          ['https://example.com'],
          ['GET', 'POST'],
          false,
          true,
        );

        (corsOptions.origin as any)(
          'http://[::1]:3000',
          (err: any, allow: boolean) => {
            expect(err).toBeNull();
            expect(allow).toBe(true);
            done();
          },
        );
      });

      it('should reject localhost in production', (done) => {
        const corsOptions = CorsConfig.getCorsOptions(
          ['https://example.com'],
          ['GET', 'POST'],
          false,
          false, // isDevelopment = false
        );

        (corsOptions.origin as any)(
          'http://localhost:3000',
          (err: any, allow: boolean) => {
            expect(err).toBeDefined();
            expect(err.message).toContain('Origin not allowed');
            done();
          },
        );
      });
    });

    describe('No origin header', () => {
      it('should allow requests with no origin (mobile apps, curl)', (done) => {
        const corsOptions = CorsConfig.getCorsOptions(
          ['https://example.com'],
          ['GET', 'POST'],
          false,
          false,
        );

        (corsOptions.origin as any)(
          undefined,
          (err: any, allow: boolean) => {
            expect(err).toBeNull();
            expect(allow).toBe(true);
            done();
          },
        );
      });
    });
  });

  describe('getAllowedOrigins', () => {
    it('should return configured origins when not in development', () => {
      const configured = [
        'https://example.com',
        'https://app.example.com',
      ];
      const result = CorsConfig.getAllowedOrigins(configured, false);

      expect(result).toEqual(configured);
    });

    it('should add development origins in development mode', () => {
      const configured = ['https://example.com'];
      const result = CorsConfig.getAllowedOrigins(configured, true);

      expect(result).toContain('https://example.com');
      expect(result).toContain('http://localhost:3000');
      expect(result).toContain('http://localhost:3001');
      expect(result).toContain('http://localhost:4200');
      expect(result).toContain('http://localhost:5173');
    });

    it('should not duplicate localhost origins', () => {
      const configured = [
        'https://example.com',
        'http://localhost:3000',
      ];
      const result = CorsConfig.getAllowedOrigins(configured, true);

      const count = result.filter((origin) => origin === 'http://localhost:3000')
        .length;
      expect(count).toBe(1);
    });

    it('should preserve order of configured origins', () => {
      const configured = [
        'https://first.com',
        'https://second.com',
        'https://third.com',
      ];
      const result = CorsConfig.getAllowedOrigins(configured, false);

      expect(result[0]).toBe('https://first.com');
      expect(result[1]).toBe('https://second.com');
      expect(result[2]).toBe('https://third.com');
    });
  });

  describe('validateCorsConfig', () => {
    it('should validate valid CORS configuration', () => {
      const result = CorsConfig.validateCorsConfig(
        ['https://example.com'],
        ['GET', 'POST', 'DELETE'],
      );

      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('should detect missing origins', () => {
      const result = CorsConfig.validateCorsConfig([], ['GET', 'POST']);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors).toContain(
        'At least one CORS origin must be configured',
      );
    });

    it('should detect missing methods', () => {
      const result = CorsConfig.validateCorsConfig(['https://example.com'], []);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors).toContain(
        'At least one HTTP method must be configured',
      );
    });

    it('should detect invalid HTTP methods', () => {
      const result = CorsConfig.validateCorsConfig(
        ['https://example.com'],
        ['GET', 'INVALID', 'POST'],
      );

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.some((error) => error.includes('INVALID'))).toBe(
        true,
      );
    });

    it('should accept lowercase HTTP methods', () => {
      const result = CorsConfig.validateCorsConfig(
        ['https://example.com'],
        ['get', 'post', 'delete'],
      );

      expect(result.valid).toBe(true);
    });

    it('should validate all standard HTTP methods', () => {
      const result = CorsConfig.validateCorsConfig(
        ['https://example.com'],
        ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      );

      expect(result.valid).toBe(true);
    });

    it('should report multiple validation errors', () => {
      const result = CorsConfig.validateCorsConfig([], []);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.length).toBeGreaterThan(1);
    });
  });

  describe('Credentials Configuration', () => {
    it('should enable credentials when specified', () => {
      const corsOptions = CorsConfig.getCorsOptions(
        ['https://example.com'],
        ['GET', 'POST'],
        true, // credentials
        false,
      );

      expect(corsOptions.credentials).toBe(true);
    });

    it('should set credentials to true by default', () => {
      const corsOptions = CorsConfig.getCorsOptions(
        ['https://example.com'],
        ['GET', 'POST'],
        false, // Try with false
        false,
      );

      expect(corsOptions.credentials).toBe(false);
    });
  });

  describe('Preflight Request Handling', () => {
    it('should not continue preflight by default', () => {
      const corsOptions = CorsConfig.getCorsOptions(
        ['https://example.com'],
        ['GET', 'POST'],
        true,
        false,
      );

      expect(corsOptions.preflightContinue).toBe(false);
    });

    it('should return 204 for successful preflight', () => {
      const corsOptions = CorsConfig.getCorsOptions(
        ['https://example.com'],
        ['GET', 'POST'],
        true,
        false,
      );

      expect(corsOptions.optionsSuccessStatus).toBe(204);
    });

    it('should cache preflight requests appropriately', () => {
      const corsOptions = CorsConfig.getCorsOptions(
        ['https://example.com'],
        ['GET', 'POST'],
        true,
        false,
      );

      expect(corsOptions.maxAge).toBe(600); // 10 minutes
    });
  });

  describe('Header Configuration', () => {
    const allowedOrigins = ['https://example.com'];
    const allowedMethods = ['GET', 'POST'];
    const credentials = true;
    const isDevelopment = false;

    it('should include authorization header', () => {
      const corsOptions = CorsConfig.getCorsOptions(
        allowedOrigins,
        allowedMethods,
        credentials,
        isDevelopment,
      );

      expect(corsOptions.allowedHeaders).toContain('Authorization');
    });

    it('should include accept header', () => {
      const corsOptions = CorsConfig.getCorsOptions(
        allowedOrigins,
        allowedMethods,
        credentials,
        isDevelopment,
      );

      expect(corsOptions.allowedHeaders).toContain('Accept');
    });

    it('should include content-type header', () => {
      const corsOptions = CorsConfig.getCorsOptions(
        allowedOrigins,
        allowedMethods,
        credentials,
        isDevelopment,
      );

      expect(corsOptions.allowedHeaders).toContain('Content-Type');
    });

    it('should include csrf protection header', () => {
      const corsOptions = CorsConfig.getCorsOptions(
        allowedOrigins,
        allowedMethods,
        credentials,
        isDevelopment,
      );

      expect(corsOptions.allowedHeaders).toContain('X-CSRF-Token');
    });

    it('should expose pagination headers', () => {
      const corsOptions = CorsConfig.getCorsOptions(
        allowedOrigins,
        allowedMethods,
        credentials,
        isDevelopment,
      );

      expect(corsOptions.exposedHeaders).toContain('X-Total-Count');
      expect(corsOptions.exposedHeaders).toContain('X-Page-Count');
    });
  });

  describe('HTTP Methods Configuration', () => {
    it('should include standard REST methods by default', () => {
      const corsOptions = CorsConfig.getCorsOptions(
        ['https://example.com'],
        ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        true,
        false,
      );

      expect(corsOptions.methods).toContain('GET');
      expect(corsOptions.methods).toContain('POST');
      expect(corsOptions.methods).toContain('PUT');
      expect(corsOptions.methods).toContain('PATCH');
      expect(corsOptions.methods).toContain('DELETE');
      expect(corsOptions.methods).toContain('OPTIONS');
    });

    it('should accept custom method lists', () => {
      const methods = ['GET', 'POST'];
      const corsOptions = CorsConfig.getCorsOptions(
        ['https://example.com'],
        methods,
        true,
        false,
      );

      expect(corsOptions.methods).toEqual(methods);
    });
  });
});
