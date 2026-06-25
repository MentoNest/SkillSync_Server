import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { SeedService } from './seed.service';
import * as adminSeedModule from './admin.seed';

describe('SeedService', () => {
  let service: SeedService;
  let mockDataSource: Partial<DataSource>;
  let seedAdminSpy: jest.SpyInstance;

  beforeEach(async () => {
    mockDataSource = {};

    seedAdminSpy = jest
      .spyOn(adminSeedModule, 'seedAdmin')
      .mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SeedService,
        { provide: getDataSourceToken(), useValue: mockDataSource },
      ],
    }).compile();

    service = module.get<SeedService>(SeedService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should call seedAdmin with the injected DataSource on bootstrap', async () => {
    await service.onApplicationBootstrap();

    expect(seedAdminSpy).toHaveBeenCalledTimes(1);
    expect(seedAdminSpy).toHaveBeenCalledWith(mockDataSource);
  });

  it('should not throw if seedAdmin rejects — server must still start', async () => {
    seedAdminSpy.mockRejectedValueOnce(new Error('seed failed'));

    await expect(service.onApplicationBootstrap()).resolves.not.toThrow();
  });
});
