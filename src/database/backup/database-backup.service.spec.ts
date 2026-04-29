import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository, DataSource } from 'typeorm';
import { DatabaseBackupService } from './database-backup.service';
import { DatabaseBackup, BackupStatus, BackupType } from './entities/database-backup.entity';

describe('DatabaseBackupService', () => {
  let service: DatabaseBackupService;
  let backupRepository: Repository<DatabaseBackup>;
  let configService: ConfigService;
  let dataSource: DataSource;

  const mockBackupRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    count: jest.fn(),
    remove: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config: Record<string, any> = {
        BACKUP_DIRECTORY: './test-backups',
        WAL_ARCHIVE_DIRECTORY: './test-wal-archive',
        BACKUP_ENCRYPTION_ENABLED: false,
        BACKUP_ENCRYPTION_KEY: '',
        BACKUP_RETENTION_DAYS: 30,
        BACKUP_S3_ENABLED: false,
        BACKUP_S3_BUCKET: '',
        BACKUP_S3_REGION: 'us-east-1',
        BACKUP_S3_ACCESS_KEY: '',
        BACKUP_S3_SECRET_KEY: '',
        BACKUP_ALERT_EMAIL: '',
        DATABASE_HOST: 'localhost',
        DATABASE_PORT: 5432,
        DATABASE_USERNAME: 'postgres',
        DATABASE_PASSWORD: 'password',
        DATABASE_NAME: 'skillsync_test',
      };
      return config[key];
    }),
  };

  const mockDataSource = {
    createQueryRunner: jest.fn().mockReturnValue({
      query: jest.fn(),
      release: jest.fn(),
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DatabaseBackupService,
        {
          provide: getRepositoryToken(DatabaseBackup),
          useValue: mockBackupRepository,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
      ],
    }).compile();

    service = module.get<DatabaseBackupService>(DatabaseBackupService);
    backupRepository = module.get<Repository<DatabaseBackup>>(getRepositoryToken(DatabaseBackup));
    configService = module.get<ConfigService>(ConfigService);
    dataSource = module.get<DataSource>(DataSource);

    // Mock fs module
    jest.mock('fs', () => ({
      existsSync: jest.fn().mockReturnValue(false),
      mkdirSync: jest.fn(),
      statSync: jest.fn().mockReturnValue({ size: 1024 }),
    }));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onModuleInit', () => {
    it('should initialize backup directories', async () => {
      await service.onModuleInit();
      expect(configService.get).toHaveBeenCalledWith('BACKUP_DIRECTORY');
      expect(configService.get).toHaveBeenCalledWith('WAL_ARCHIVE_DIRECTORY');
    });
  });

  describe('listBackups', () => {
    it('should return list of backups ordered by createdAt', async () => {
      const mockBackups: DatabaseBackup[] = [
        {
          id: '1',
          fileName: 'backup_1.sql.gz',
          filePath: './backups/backup_1.sql.gz',
          fileSize: 1024,
          type: BackupType.AUTOMATED,
          status: BackupStatus.COMPLETED,
          createdAt: new Date('2024-04-29'),
          updatedAt: new Date('2024-04-29'),
        } as DatabaseBackup,
      ];

      mockBackupRepository.find.mockResolvedValue(mockBackups);

      const result = await service.listBackups();

      expect(result).toEqual(mockBackups);
      expect(mockBackupRepository.find).toHaveBeenCalledWith({
        order: { createdAt: 'DESC' },
      });
    });
  });

  describe('getBackup', () => {
    it('should return a backup by id', async () => {
      const mockBackup: DatabaseBackup = {
        id: '1',
        fileName: 'backup_1.sql.gz',
        filePath: './backups/backup_1.sql.gz',
        fileSize: 1024,
        type: BackupType.AUTOMATED,
        status: BackupStatus.COMPLETED,
        createdAt: new Date('2024-04-29'),
        updatedAt: new Date('2024-04-29'),
      } as DatabaseBackup;

      mockBackupRepository.findOne.mockResolvedValue(mockBackup);

      const result = await service.getBackup('1');

      expect(result).toEqual(mockBackup);
      expect(mockBackupRepository.findOne).toHaveBeenCalledWith({
        where: { id: '1' },
      });
    });

    it('should return null if backup not found', async () => {
      mockBackupRepository.findOne.mockResolvedValue(null);

      const result = await service.getBackup('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('getBackupStatus', () => {
    it('should return backup status summary', async () => {
      mockBackupRepository.count.mockResolvedValue(5);
      mockBackupRepository.find.mockResolvedValue([
        { fileSize: 1024 } as DatabaseBackup,
        { fileSize: 2048 } as DatabaseBackup,
      ]);
      mockBackupRepository.findOne.mockResolvedValue(null);

      const result = await service.getBackupStatus();

      expect(result).toHaveProperty('totalBackups', 5);
      expect(result).toHaveProperty('totalSize');
      expect(result).toHaveProperty('latestBackup');
      expect(result).toHaveProperty('nextScheduledBackup');
      expect(result).toHaveProperty('retentionDays', 30);
      expect(result).toHaveProperty('walArchivingEnabled', true);
      expect(result).toHaveProperty('encryptionEnabled', false);
    });
  });

  describe('deleteBackup', () => {
    it('should delete a backup', async () => {
      const mockBackup: DatabaseBackup = {
        id: '1',
        fileName: 'backup_1.sql.gz',
        filePath: './backups/backup_1.sql.gz',
        fileSize: 1024,
        type: BackupType.AUTOMATED,
        status: BackupStatus.COMPLETED,
        createdAt: new Date('2024-04-29'),
        updatedAt: new Date('2024-04-29'),
      } as DatabaseBackup;

      mockBackupRepository.findOne.mockResolvedValue(mockBackup);
      mockBackupRepository.remove.mockResolvedValue(mockBackup);

      await service.deleteBackup('1');

      expect(mockBackupRepository.findOne).toHaveBeenCalledWith({
        where: { id: '1' },
      });
      expect(mockBackupRepository.remove).toHaveBeenCalledWith(mockBackup);
    });

    it('should throw error if backup not found', async () => {
      mockBackupRepository.findOne.mockResolvedValue(null);

      await expect(service.deleteBackup('nonexistent')).rejects.toThrow('Backup not found');
    });
  });

  describe('verifyBackup', () => {
    it('should throw error if backup not found', async () => {
      mockBackupRepository.findOne.mockResolvedValue(null);

      await expect(service.verifyBackup('nonexistent')).rejects.toThrow('Backup not found');
    });
  });

  describe('restoreBackup', () => {
    it('should throw error if backup not found', async () => {
      mockBackupRepository.findOne.mockResolvedValue(null);

      await expect(service.restoreBackup('nonexistent')).rejects.toThrow('Backup not found');
    });

    it('should throw error if backup is not in restorable state', async () => {
      const mockBackup: DatabaseBackup = {
        id: '1',
        fileName: 'backup_1.sql.gz',
        filePath: './backups/backup_1.sql.gz',
        status: BackupStatus.FAILED,
        createdAt: new Date('2024-04-29'),
        updatedAt: new Date('2024-04-29'),
      } as DatabaseBackup;

      mockBackupRepository.findOne.mockResolvedValue(mockBackup);

      await expect(service.restoreBackup('1')).rejects.toThrow(
        'Backup is not in a restorable state',
      );
    });
  });
});
