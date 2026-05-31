// test/jest-global-setup.ts
// Runs once before ALL test suites — creates a dedicated test DB schema.

import { Client } from 'pg';

export default async function globalSetup(): Promise<void> {
  // These should be set in .env.test or CI environment variables
  const client = new Client({
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 5432),
    user: process.env.DB_USER ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres',
    database: process.env.DB_NAME ?? 'skillsync_test',
  });

  try {
    await client.connect();

    // Ensure a clean slate — drop and recreate the test schema
    await client.query(`DROP SCHEMA IF EXISTS public CASCADE`);
    await client.query(`CREATE SCHEMA public`);
    await client.query(`GRANT ALL ON SCHEMA public TO public`);

    console.log('[E2E] Test schema reset successfully.');
  } finally {
    await client.end();
  }
}