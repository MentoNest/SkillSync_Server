import { readFile } from 'node:fs/promises';
import { BackupConfig } from '../backup.config';
import { BackupService } from '../backup.service';

jest.mock('node:fs/promises', () => ({ readFile: jest.fn() }));

const mockedReadFile = readFile as jest.MockedFunction<typeof readFile>;

const config: BackupConfig = {
  statusFile: '/var/lib/skillsync/backups/backup-status.json',
  backupDir: '/var/lib/skillsync/backups',
  s3Bucket: 'skillsync-backups',
  s3Prefix: 'postgres',
  s3Region: 'us-east-1',
  maxAgeHours: 26,
  retentionDays: 30,
  encryptionEnabled: true,
  pointInTimeRecoveryEnabled: true,
  scheduleCron: '0 2 * * *',
};

const service = (overrides: Partial<BackupConfig> = {}) =>
  new BackupService({ ...config, ...overrides });

const run = (overrides: Record<string, unknown> = {}) => ({
  status: 'success',
  startedAt: '2026-11-23T02:00:00.000Z',
  finishedAt: '2026-11-23T02:03:12.000Z',
  durationMs: 192_000,
  sizeBytes: 12_345_678,
  encrypted: true,
  uploadedToS3: true,
  location: 's3://skillsync-backups/postgres/skillsync-2026-11-23.dump.gpg',
  checksum: 'sha256:9f2c',
  error: null,
  ...overrides,
});

const now = new Date('2026-11-23T04:00:00.000Z');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('BackupService.getStatus', () => {
  it('reports not_configured when the status file is missing', async () => {
    mockedReadFile.mockRejectedValue(Object.assign(new Error('missing'), { code: 'ENOENT' }));

    const status = await service().getStatus(now);

    expect(status.health).toBe('not_configured');
    expect(status.lastBackup).toBeNull();
    expect(status.lastBackupAgeHours).toBeNull();
    expect(status.checkedAt).toBe(now.toISOString());
  });

  it('reports healthy for a fresh successful run', async () => {
    mockedReadFile.mockResolvedValue(JSON.stringify(run()));

    const status = await service().getStatus(now);

    expect(status.health).toBe('healthy');
    expect(status.lastBackup).toMatchObject({
      status: 'success',
      encrypted: true,
      uploadedToS3: true,
      checksum: 'sha256:9f2c',
    });
    expect(status.lastBackupAgeHours).toBeCloseTo(1.95, 2);
  });

  it('reports stale when the last run is older than maxAgeHours', async () => {
    mockedReadFile.mockResolvedValue(
      JSON.stringify(run({ finishedAt: '2026-11-21T02:00:00.000Z' })),
    );

    const status = await service().getStatus(now);

    expect(status.health).toBe('stale');
    expect(status.lastBackupAgeHours).toBeGreaterThan(26);
  });

  it('reports failing when the latest run failed', async () => {
    mockedReadFile.mockResolvedValue(
      JSON.stringify(run({ status: 'failed', finishedAt: null, error: 'pg_dump exited 1' })),
    );

    const status = await service().getStatus(now);

    expect(status.health).toBe('failing');
    expect(status.lastBackup?.error).toBe('pg_dump exited 1');
  });

  it('reports not_configured for malformed JSON', async () => {
    mockedReadFile.mockResolvedValue('{ not json');

    const status = await service().getStatus(now);

    expect(status.health).toBe('not_configured');
    expect(status.lastBackup).toBeNull();
  });

  it('reports not_configured when the payload has no usable timestamp', async () => {
    mockedReadFile.mockResolvedValue(JSON.stringify({ status: 'success' }));

    const status = await service().getStatus(now);

    expect(status.health).toBe('not_configured');
    expect(status.lastBackup).toBeNull();
  });

  it('normalizes a partial payload with safe defaults', async () => {
    mockedReadFile.mockResolvedValue(
      JSON.stringify({ status: 'running', startedAt: '2026-11-23T03:55:00.000Z' }),
    );

    const status = await service().getStatus(now);

    expect(status.health).toBe('healthy');
    expect(status.lastBackup).toMatchObject({
      status: 'running',
      finishedAt: null,
      encrypted: false,
      uploadedToS3: false,
      location: null,
      checksum: null,
      error: null,
    });
  });

  it('exposes the retention, encryption, PITR and storage metadata', async () => {
    mockedReadFile.mockResolvedValue(JSON.stringify(run()));

    const status = await service().getStatus(now);

    expect(status.retentionDays).toBe(30);
    expect(status.encryptionEnabled).toBe(true);
    expect(status.pointInTimeRecoveryEnabled).toBe(true);
    expect(status.scheduleCron).toBe('0 2 * * *');
    expect(status.storage).toEqual({
      provider: 's3',
      bucket: 'skillsync-backups',
      prefix: 'postgres',
      region: 'us-east-1',
    });
  });

  it('reports local storage when no bucket is configured', async () => {
    mockedReadFile.mockResolvedValue(JSON.stringify(run({ uploadedToS3: false })));

    const status = await service({ s3Bucket: undefined }).getStatus(now);

    expect(status.storage.provider).toBe('local');
    expect(status.storage.bucket).toBeNull();
  });
});
