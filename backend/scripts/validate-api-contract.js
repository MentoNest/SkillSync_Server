#!/usr/bin/env node
/**
 * API Contract Validation Script (#517)
 *
 * Validates that the running API matches the OpenAPI specification.
 * Designed to run in CI/CD pipeline after backend changes.
 *
 * Usage:
 *   node scripts/validate-api-contract.js
 *
 * Environment:
 *   API_URL - Base URL of the running API (default: http://localhost:3000)
 */

const API_URL = process.env.API_URL || 'http://localhost:3000';

async function checkEndpoint(path, method = 'GET', expectedStatus = 200) {
  try {
    const response = await fetch(`${API_URL}${path}`, { method });
    const statusMatch = response.status === expectedStatus;
    console.log(
      `  ${statusMatch ? '✓' : '✗'} ${method} ${path} → ${response.status} (expected ${expectedStatus})`,
    );
    return statusMatch;
  } catch (error) {
    console.log(`  ✗ ${method} ${path} → ERROR: ${error.message}`);
    return false;
  }
}

async function validateContract() {
  console.log('\n📋 API Contract Validation');
  console.log('========================\n');

  const checks = [
    checkEndpoint('/api/v1/health'),
    checkEndpoint('/api/v1/users?page=1&limit=10'),
    checkEndpoint('/api/v1/availability/slots'),
  ];

  // Auth endpoints (expected to fail without credentials)
  checks.push(
    checkEndpoint('/api/v1/auth/me', 'GET', 401),
    checkEndpoint('/api/v1/users/me', 'GET', 401),
  );

  const results = await Promise.all(checks);
  const passed = results.filter(Boolean).length;
  const failed = results.filter((r) => !r).length;

  console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);

  // Exit with error code if any checks failed (for CI integration)
  process.exit(failed > 0 ? 1 : 0);
}

validateContract().catch((err) => {
  console.error('Contract validation failed:', err);
  process.exit(1);
});
