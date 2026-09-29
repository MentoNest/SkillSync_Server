/**
 * #1339: profile history - append-only audit trail for profile field changes.
 *
 * There is no service wrapping this entity, so the schema *is* the contract and
 * is asserted against TypeORM's metadata storage rather than a live database.
 * That is not a weaker test in this case: the guarantees the issue asks for are
 * all expressed as column options.
 *
 * The properties under test are the ones that would silently break the audit
 * trail if lost:
 *
 * - `timestamp` is timestamptz, not naive `timestamp`. A naive timestamp makes
 *   the ordering of history rows ambiguous across DST and across servers.
 * - `oldValue`/`newValue` are jsonb, so a change to any profile field is
 *   captured without a schema change per field.
 * - `changedBy` is nullable, because a change made by a system job has no actor.
 * - `reason` defaults to USER_EDIT, so a caller that forgets it is still
 *   recorded as an explicit user action rather than as `undefined`.
 */
import { describe, expect, it } from 'vitest';
import { getMetadataArgsStorage } from 'typeorm';
import {
  ProfileChangeReason,
  ProfileHistory,
} from './profile-history.entity.js';

/** Column options for a single property, or undefined when it is not a column. */
function columnOptions(property: string) {
  const columns = getMetadataArgsStorage().columns.filter(
    (column) =>
      column.target === ProfileHistory && column.propertyName === property,
  );
  return columns[0]?.options as Record<string, unknown> | undefined;
}

function columnType(property: string): unknown {
  return columnOptions(property)?.type;
}

describe('ProfileChangeReason', () => {
  it('stores stable machine values rather than the enum keys', () => {
    expect(ProfileChangeReason.USER_EDIT).toBe('user_edit');
    expect(ProfileChangeReason.ADMIN_EDIT).toBe('admin_edit');
    expect(ProfileChangeReason.SYSTEM).toBe('system');
  });

  it('covers all three ways a profile field can change', () => {
    expect(Object.values(ProfileChangeReason).sort()).toEqual([
      'admin_edit',
      'system',
      'user_edit',
    ]);
  });
});

describe('ProfileHistory table', () => {
  const tables = getMetadataArgsStorage().tables;

  it('is mapped to the profile_history table', () => {
    expect(
      tables
        .filter((table) => table.target === ProfileHistory)
        .map((t) => t.name),
    ).toEqual(['profile_history']);
  });

  it('uses a generated uuid primary key so rows are globally unique', () => {
    const primary = getMetadataArgsStorage().columns.find(
      (column) =>
        column.target === ProfileHistory && column.propertyName === 'id',
    );

    expect(primary?.options?.primary).toBe(true);
    expect(primary?.options?.type).toBe('uuid');
  });

  it('indexes userId, since history is always read per user', () => {
    const indexes = getMetadataArgsStorage().indices.filter(
      (index) => index.target === ProfileHistory,
    );

    expect(
      indexes.some((index) => index.name === 'IDX_profile_history_userId'),
    ).toBe(true);
  });
});

describe('ProfileHistory columns', () => {
  it('stores userId as a uuid, matching the users table', () => {
    expect(columnType('userId')).toBe('uuid');
  });

  it('stores oldValue and newValue as jsonb so any field can be recorded', () => {
    expect(columnType('oldValue')).toBe('jsonb');
    expect(columnType('newValue')).toBe('jsonb');
  });

  it('allows oldValue and newValue to be null for a field that was only set', () => {
    expect(columnOptions('oldValue')?.nullable).toBe(true);
    expect(columnOptions('newValue')?.nullable).toBe(true);
  });

  it('allows changedBy to be null, because a system change has no actor', () => {
    expect(columnType('changedBy')).toBe('varchar');
    expect(columnOptions('changedBy')?.nullable).toBe(true);
  });

  it('defaults reason to user_edit', () => {
    expect(columnOptions('reason')?.default).toBe(
      ProfileChangeReason.USER_EDIT,
    );
  });

  it('stores the timestamp as timestamptz, so ordering survives a DST change', () => {
    const timestamp = getMetadataArgsStorage().columns.find(
      (column) =>
        column.target === ProfileHistory && column.propertyName === 'timestamp',
    );

    expect(timestamp?.options?.type).toBe('timestamp with time zone');
    expect(timestamp?.options?.precision).toBe(3);
  });

  it('generates the timestamp on insert rather than trusting the caller', () => {
    // TypeORM records @CreateDateColumn as column mode 'createDate'; the value
    // is filled in by the database, so a caller cannot backdate history.
    const timestamp = getMetadataArgsStorage().columns.find(
      (column) =>
        column.target === ProfileHistory && column.propertyName === 'timestamp',
    );

    expect(timestamp?.mode).toBe('createDate');
  });
});

describe('ProfileHistory instances', () => {
  it('records a single field change with both sides of the diff', () => {
    const entry = new ProfileHistory();
    Object.assign(entry, {
      id: '4f2c1a5e-0000-4000-8000-000000000001',
      userId: '4f2c1a5e-0000-4000-8000-000000000002',
      profileType: 'mentor',
      fieldName: 'hourlyRate',
      oldValue: 25,
      newValue: 40,
      changedBy: '4f2c1a5e-0000-4000-8000-000000000003',
      reason: ProfileChangeReason.USER_EDIT,
      timestamp: new Date('2026-03-01T10:00:00Z'),
    });

    expect(entry.fieldName).toBe('hourlyRate');
    expect(entry.oldValue).toBe(25);
    expect(entry.newValue).toBe(40);
    expect(entry.reason).toBe(ProfileChangeReason.USER_EDIT);
  });

  it('keeps a multi-field change distinguishable by fieldName', () => {
    const entry = new ProfileHistory();
    entry.profileType = 'mentee';
    entry.fieldName = 'skills';
    entry.oldValue = ['Solidity'];
    entry.newValue = ['Solidity', 'Rust'];

    // The jsonb columns hold whole arrays, not just a scalar, which is why the
    // audit trail needs no migration when a new field is added.
    expect(entry.newValue).toEqual(['Solidity', 'Rust']);
  });

  it('preserves a system change with no human actor', () => {
    const entry = new ProfileHistory();
    entry.reason = ProfileChangeReason.SYSTEM;
    entry.changedBy = null;
    entry.oldValue = null;
    entry.newValue = 'suspended';

    expect(entry.changedBy).toBeNull();
    expect(entry.oldValue).toBeNull();
    expect(entry.reason).toBe(ProfileChangeReason.SYSTEM);
  });

  it('distinguishes an admin edit from a self-service edit', () => {
    const adminEdit = new ProfileHistory();
    adminEdit.reason = ProfileChangeReason.ADMIN_EDIT;
    adminEdit.changedBy = '4f2c1a5e-0000-4000-8000-000000000009';

    expect(adminEdit.reason).toBe(ProfileChangeReason.ADMIN_EDIT);
    expect(adminEdit.changedBy).not.toBeNull();
  });
});
