import { SwaggerModule } from '@nestjs/swagger';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { buildSwaggerConfig, SWAGGER_EXTRA_MODELS } from '../src/swagger.config';
import { createContractApp } from '../test/contract/support/contract-app';

const OUTPUT = join(__dirname, '..', 'openapi', 'openapi.json');

const serialize = (document: unknown): string => JSON.stringify(document, null, 2) + '\n';

/**
 * Generates `openapi/openapi.json` from the NestJS controllers (via `@nestjs/swagger`).
 * Pass `--check` to assert the committed spec is up to date without writing (used in CI to
 * catch undocumented API changes).
 */
async function main(): Promise<void> {
  const check = process.argv.includes('--check');

  const app = await createContractApp();
  const document = SwaggerModule.createDocument(app, buildSwaggerConfig(), {
    extraModels: SWAGGER_EXTRA_MODELS,
  });
  await app.close();

  const next = serialize(document);

  if (check) {
    if (!existsSync(OUTPUT)) {
      console.error(`OpenAPI spec is missing at ${OUTPUT}. Run "npm run openapi:generate" and commit it.`);
      process.exit(1);
    }
    if (readFileSync(OUTPUT, 'utf8') !== next) {
      console.error(
        'OpenAPI spec is out of date. Run "npm run openapi:generate" and commit the result ' +
          '(or update the API version per docs/api-versioning.md).',
      );
      process.exit(1);
    }
    console.log('OpenAPI spec is up to date.');
    return;
  }

  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, next);
  console.log(`Wrote OpenAPI spec to ${OUTPUT}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
