/**
 * Generates the OpenAPI document from the running code (@nestjs/swagger) and
 * writes it to docs/openapi.json (issue #1484).
 *
 *   npm run openapi:generate [-- <output-file>]
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { AppModule } from '../src/app.module';
import { createOpenApiDocument } from '../src/swagger';

async function main(): Promise<void> {
  const out = resolve(process.argv[2] ?? 'docs/openapi.json');
  const app = await NestFactory.create(AppModule, { logger: false });
  const document = createOpenApiDocument(app);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(document, null, 2)}\n`);
  await app.close();
  console.log(`OpenAPI document written to ${out}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
