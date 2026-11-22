import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { APP_CONFIG, AppConfig } from './config/app.config';
import { createCookieSecurityMiddleware } from './common/security/cookie-security.middleware';
import { createRateLimitMiddleware } from './common/security/rate-limit.middleware';
import { DatabaseHealthService } from './database/database-health.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Resolved after ConfigModule has loaded/validated `.env` and the environment.
  const config = app.get<AppConfig>(APP_CONFIG);

  // Correct client IPs in X-Forwarded-For when Nginx/Cloudflare/ALB is in front.
  app.getHttpAdapter().getInstance().set('trust proxy', config.trustProxy);

  // Security response headers (HSTS, nosniff, frameguard, referrer policy, ...).
  app.use(
    helmet({
      contentSecurityPolicy: false,
      hsts: config.isProduction
        ? { maxAge: 31_536_000, includeSubDomains: true }
        : false,
    }),
  );

  // Express-level hardening applied to every cookie written by the application.
  app.use(createCookieSecurityMiddleware(config.cookie));

  // Stricter, authenticated/unauthenticated thresholds in production.
  app.use(createRateLimitMiddleware(config.rateLimit));

  if (config.isProduction) {
    // No GraphQL server is registered; keep the playground from ever being exposed.
    app.use('/graphql', (_req, res) =>
      res.status(404).json({ statusCode: 404, message: 'Not Found' }),
    );
  }

  // Only exact, explicitly allowed browser origins may call the API with credentials.
  const allowedOrigins = new Set(config.corsAllowedOrigins);
  app.enableCors({
    origin: (origin, callback) => {
      // Same-origin/server-to-server requests have no Origin header.
      if (!origin || (!config.isProduction && allowedOrigins.size === 0)) {
        callback(null, true);
        return;
      }
      callback(null, allowedOrigins.has(origin));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Requested-With'],
    exposedHeaders: [
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset',
      'Retry-After',
    ],
    maxAge: 600,
  });

  // Swagger UI is available in development/test only, never in production.
  if (config.swaggerEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('SkillSync API')
      .setDescription(
        'REST API for the SkillSync platform. ' +
          'Authentication is wallet-based (Stellar ED25519): request a nonce, sign it, exchange the signature for JWT tokens.',
      )
      .setVersion('1.0')
      .addTag('Authentication', 'Wallet login and token lifecycle endpoints.')
      .addTag('Wallet', 'Nonce issuance for Stellar wallet sign-in.')
      .addTag('Session Management', 'Token refresh and revocation.')
      .addTag('Users', 'Username, display name, and public profile endpoints.')
      .addTag('Profiles', 'Mentor and mentee profile creation and management.')
      .addTag('Admin', 'Admin-only endpoints. Require the ADMIN role.')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description:
            'Paste the accessToken returned by POST /auth/login. ' +
            'Format: Bearer <token>',
          name: 'Authorization',
          in: 'header',
        },
        'Bearer Auth',
      )
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
        tagsSorter: 'alpha',
        operationsSorter: 'alpha',
      },
      customSiteTitle: 'SkillSync API Docs',
    });
  }

  // Refuse to start serving if the database does not answer.
  await app.get(DatabaseHealthService).verify();
  await app.listen(config.port);
}
void bootstrap();
