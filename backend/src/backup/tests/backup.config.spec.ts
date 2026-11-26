import {
  buildBackupConfig,
  DEFAULT_BACKUP_DIR,
  DEFAULT_MAX_AGE_HOURS,
  DEFAULT_RETENTION_DAYS,
  DEFAULT_S3_PREFIX,
  DEFAULT_S3_REGION,
  DEFAULT_SCHEDULE_CRON,
} from '../backup.config';

const from = (values: Record<string, string>) => (key: string) => values[key];

describe('buildBackupConfig', () => {
  it('applies the documented defaults when nothing is set', () => {
    const config = buildBackupConfig(() => undefined);

    expect(config.backupDir).toBe(DEFAULT_BACKUP_DIR);
    expect(config.statusFile).toBe(`${DEFAULT_BACKUP_DIR}/backup-status.json`);
    expect(config.retentionDays).toBe(DEFAULT_RETENTION_DAYS);
    expect(config.maxAgeHours).toBe(DEFAULT_MAX_AGE_HOURS);
    expect(config.s3Prefix).toBe(DEFAULT_S3_PREFIX);
    expect(config.s3Region).toBe(DEFAULT_S3_REGION);
    expect(config.scheduleCron).toBe(DEFAULT_SCHEDULE_CRON);
    expect(config.encryptionEnabled).toBe(true);
    expect(config.pointInTimeRecoveryEnabled).toBe(true);
    expect(config.s3Bucket).toBeUndefined();
  });

  it('reads overrides from the environment', () => {
    const config = buildBackupConfig(
      from({
        BACKUP_DIR: '/data/backups',
        BACKUP_RETENTION_DAYS: '14',
        BACKUP_MAX_AGE_HOURS: '30',
        BACKUP_S3_BUCKET: 'skillsync-backups',
        BACKUP_S3_PREFIX: 'pg',
        BACKUP_S3_REGION: 'eu-west-1',
        BACKUP_ENCRYPTION_ENABLED: 'false',
        BACKUP_PITR_ENABLED: 'false',
        BACKUP_SCHEDULE_CRON: '15 3 * * *',
      }),
    );

    expect(config.statusFile).toBe('/data/backups/backup-status.json');
    expect(config.retentionDays).toBe(14);
    expect(config.maxAgeHours).toBe(30);
    expect(config.s3Bucket).toBe('skillsync-backups');
    expect(config.s3Prefix).toBe('pg');
    expect(config.s3Region).toBe('eu-west-1');
    expect(config.encryptionEnabled).toBe(false);
    expect(config.pointInTimeRecoveryEnabled).toBe(false);
    expect(config.scheduleCron).toBe('15 3 * * *');
  });

  it('honours an explicit status file path', () => {
    const config = buildBackupConfig(
      from({ BACKUP_STATUS_FILE: '/tmp/status.json' }),
    );
    expect(config.statusFile).toBe('/tmp/status.json');
  });

  it('treats a blank bucket as local-only storage', () => {
    const config = buildBackupConfig(from({ BACKUP_S3_BUCKET: '  ' }));
    expect(config.s3Bucket).toBeUndefined();
  });

  it('rejects a non-positive retention window', () => {
    expect(() =>
      buildBackupConfig(from({ BACKUP_RETENTION_DAYS: '0' })),
    ).toThrow('BACKUP_RETENTION_DAYS must be a positive integer');
  });
});
