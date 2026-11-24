import { DocumentBuilder } from '@nestjs/swagger';
import { MenteeProfile } from './profile/mentee-profile.entity';
import { MentorProfile } from './profile/mentor-profile.entity';

/** Semantic version of the public API surface. See docs/api-versioning.md. */
export const API_VERSION = '1.0';

/**
 * Models that are only referenced through `$ref` in response DTOs (e.g. the
 * `oneOf` in `CreateProfileResponseDto`) are not discovered automatically by
 * `@nestjs/swagger`. Registering them here guarantees the referenced schemas
 * exist in the generated document.
 */
export const SWAGGER_EXTRA_MODELS = [MentorProfile, MenteeProfile];

/**
 * Builds the OpenAPI document metadata shared by the running server (Swagger UI) and the
 * code-generated spec (`scripts/generate-openapi.ts`). Keeping this in one place guarantees
 * the committed `openapi/openapi.json` stays identical to what the server would serve.
 */
export function buildSwaggerConfig() {
  return new DocumentBuilder()
    .setTitle('SkillSync API')
    .setDescription(
      'REST API for the SkillSync platform. ' +
        'Authentication is wallet-based (Stellar ED25519): request a nonce, sign it, exchange the signature for JWT tokens.',
    )
    .setVersion(API_VERSION)
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
      },
      'BearerAuth',
    )
    .build();
}
