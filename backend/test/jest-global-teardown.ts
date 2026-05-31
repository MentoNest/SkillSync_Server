// test/jest-global-teardown.ts
// Runs once after ALL test suites — cleans up leftover test data.

import { Client } from 'pg';

export default async function globalTeardown(): Promise<void> {
  const client = new Client({
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 5432),
    user: process.env.DB_USER ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres',
    database: process.env.DB_NAME ?? 'skillsync_test',
  });

  try {
    await client.connect();
    await client.query(`DELETE FROM users WHERE email LIKE '%@test.com'`);
    console.log('[E2E] Test teardown complete.');
  } catch (err) {
    // Non-fatal — table may not exist in some failure scenarios
    console.warn('[E2E] Teardown warning:', (err as Error).message);
  } finally {
    await client.end();
  }
}