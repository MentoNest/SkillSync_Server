import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ProfileHistory } from './entities/profile-history.entity';
import { MIN_RETENTION_DAYS, ProfileHistoryService } from './profile-history.service';

describe('ProfileHistoryService', () => {
  let service: ProfileHistoryService;
  const history = { findAndCount: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProfileHistoryService,
        { provide: getRepositoryToken(ProfileHistory), useValue: history },
      ],
    }).compile();
    service = module.get(ProfileHistoryService);
  });

  it('returns history entries with pagination metadata', async () => {
    history.findAndCount.mockResolvedValue([[{ id: 'h1', fieldName: 'bio' }], 3]);
    const result = await service.listForUser('user-1', 2, 1);

    expect(result).toMatchObject({ total: 3, page: 2, limit: 1, totalPages: 3 });
    expect(history.findAndCount).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      order: { createdAt: 'DESC' },
      skip: 1,
      take: 1,
    });
  });

  it('reports zero pages for a user without history', async () => {
    history.findAndCount.mockResolvedValue([[], 0]);
    const result = await service.listForUser('user-1');
    expect(result.totalPages).toBe(0);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(50);
  });

  it('guarantees at least a one-year retention window', () => {
    expect(service.retentionDays).toBe(MIN_RETENTION_DAYS);
    expect(service.retentionDays).toBeGreaterThanOrEqual(365);
  });
});
