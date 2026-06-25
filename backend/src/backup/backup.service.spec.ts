import { Test, TestingModule } from '@nestjs/testing';
import { BackupService } from './backup.service';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';

jest.mock('fs');
jest.mock('fs/promises');

const mockExistsSync = fs.existsSync as jest.Mock;
const mockReadFile = fsPromises.readFile as jest.Mock;

describe('BackupService', () => {
  let service: BackupService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [BackupService],
    }).compile();

    service = module.get<BackupService>(BackupService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getStatus', () => {
    it('should return null lastBackup when status file does not exist', async () => {
      mockExistsSync.mockReturnValue(false);

      const result = await service.getStatus();

      expect(result.lastBackup).toBeNull();
      expect(result.statusFileReadAt).toBeNull();
      expect(result.retentionDays).toBe(30);
      expect(result.nextScheduledBackup).toBeDefined();
    });

    it('should return lastBackup data when status file exists and is valid', async () => {
      const fakeStatus = {
        lastBackup: {
          timestamp: '20260101T020000Z',
          database: 'skillsync',
          s3Key: 'backups/skillsync/20260101T020000Z/skillsync_20260101T020000Z.dump.enc',
          s3Bucket: 's3://skillsync-backups',
          status: 'success',
        },
        writtenAt: '2026-01-01T02:00:01Z',
      };
      mockExistsSync.mockReturnValue(true);
      mockReadFile.mockResolvedValue(JSON.stringify(fakeStatus));

      const result = await service.getStatus();

      expect(result.lastBackup).toEqual(fakeStatus.lastBackup);
      expect(result.statusFileReadAt).not.toBeNull();
    });

    it('should return null lastBackup when status file is corrupt JSON', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFile.mockResolvedValue('not-valid-json');

      const result = await service.getStatus();

      expect(result.lastBackup).toBeNull();
    });

    it('should return a future nextScheduledBackup timestamp', async () => {
      mockExistsSync.mockReturnValue(false);

      const result = await service.getStatus();

      expect(new Date(result.nextScheduledBackup!).getTime()).toBeGreaterThan(
        Date.now(),
      );
    });
  });
});
