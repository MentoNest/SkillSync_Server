import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, OpenAPIObject } from '@nestjs/swagger';

export const SWAGGER_PATH = 'api-docs';

export function buildSwaggerDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('SkillSync API')
    .setDescription(
      'SkillSync backend API – Stellar wallet-based authentication and platform services',
    )
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'JWT',
    )
    .addTag('auth', 'Authentication endpoints')
    .addTag('health', 'Health and readiness checks')
    .build();

  return SwaggerModule.createDocument(app, config);
}

export function setupSwagger(app: INestApplication): void {
  const document = buildSwaggerDocument(app);
  // In production, require basic auth to access the docs when configured.
  if (process.env.NODE_ENV === 'production') {
    const user = process.env.SWAGGER_USER;
    const pass = process.env.SWAGGER_PASS;
    if (!user || !pass) {
      // Do not expose docs in production without credentials
      return;
    }

    // Simple Basic Auth middleware for the swagger path
    app.use(`/${SWAGGER_PATH}`, (req, res, next) => {
      const auth = req.headers.authorization as string | undefined;
      if (!auth || !auth.startsWith('Basic ')) {
        res.setHeader('WWW-Authenticate', 'Basic realm="API Docs"');
        return res.status(401).send('Authentication required');
      }
      try {
        const creds = Buffer.from(auth.split(' ')[1], 'base64').toString();
        const [u, p] = creds.split(':');
        if (u === user && p === pass) return next();
      } catch (e) {
        // fallthrough to deny
      }
      return res.status(403).send('Forbidden');
    });
  }

  SwaggerModule.setup(SWAGGER_PATH, app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });
}
