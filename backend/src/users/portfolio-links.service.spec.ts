import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';

import { CreatePortfolioLinkDto } from './dto/create-portfolio-link.dto';
import { PortfolioLink } from './entities/portfolio-link.entity';
import { PortfolioLinksService } from './portfolio-links.service';

type RepoMock = {
  count: jest.Mock;
  findOne: jest.Mock;
  create: jest.Mock;
  save: jest.Mock;
  remove: jest.Mock;
  find: jest.Mock;
};
type EntityManagerStub = {
  query: jest.Mock;
  getRepository: jest.Mock;
};

describe('PortfolioLinksService', () => {
  let service: PortfolioLinksService;
  let repoMock: RepoMock;

  const userId = '11111111-1111-1111-1111-111111111111';
  const otherUserId = '22222222-2222-2222-2222-222222222222';

  const dto: CreatePortfolioLinkDto = {
    title: 'GitHub',
    url: 'https://github.com/john-doe',
  };

  beforeEach(async () => {
    repoMock = {
      count: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((input: Partial<PortfolioLink>) => ({
        id: 'pending',
        ...input,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
      save: jest.fn((input: PortfolioLink) => Promise.resolve(input)),
      remove: jest.fn(),
      find: jest.fn(),
    };

    // Minimal EntityManager stub: the pg_advisory_xact_lock query is no-op
    // (returns undefined), and getRepository hands back the same repoMock
    // that's already wired via @InjectRepository.
    const stubEntityManager: EntityManagerStub = {
      query: jest.fn().mockResolvedValue(undefined),
      getRepository: jest.fn(() => repoMock),
    };

    // Minimal DataSource stub: transaction() invokes the callback with the
    // stub entity manager. No actual isolation level is needed for tests.
    const mockDataSource = {
      transaction: jest.fn(
        async (cb: (mgr: EntityManagerStub) => Promise<unknown>) =>
          await cb(stubEntityManager),
      ),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        PortfolioLinksService,
        {
          provide: getRepositoryToken(PortfolioLink),
          useValue: repoMock,
        },
        {
          provide: getDataSourceToken(),
          useValue: mockDataSource,
        },
      ],
    }).compile();

    service = moduleRef.get<PortfolioLinksService>(PortfolioLinksService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('listForUser', () => {
    it('returns the ordered list for a user', async () => {
      const items = [{ id: 'a' } as unknown as PortfolioLink];
      repoMock.find.mockResolvedValue(items);

      const result = await service.listForUser(userId);

      expect(result).toBe(items);
      expect(repoMock.find).toHaveBeenCalledWith({
        where: { userId },
        order: { createdAt: 'ASC' },
      });
    });
  });

  describe('add', () => {
    it('creates a link when the user is below the cap and the URL is new', async () => {
      repoMock.count.mockResolvedValue(3);
      repoMock.findOne.mockResolvedValue(null);

      const result = await service.add(userId, dto);

      expect(result.userId).toBe(userId);
      expect(result.title).toBe(dto.title);
      expect(result.url).toBe(dto.url);
      expect(repoMock.save).toHaveBeenCalled();
    });

    it('rejects when the user already has the maximum number of links', async () => {
      repoMock.count.mockResolvedValue(10);

      await expect(service.add(userId, dto)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(repoMock.save).not.toHaveBeenCalled();
    });

    it('rejects when the URL is already in the user list', async () => {
      repoMock.count.mockResolvedValue(0);
      repoMock.findOne.mockResolvedValue({ id: 'existing' });

      await expect(service.add(userId, dto)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(repoMock.save).not.toHaveBeenCalled();
    });

    it('converts a Postgres unique violation into a ConflictException', async () => {
      repoMock.count.mockResolvedValue(0);
      repoMock.findOne.mockResolvedValue(null);
      repoMock.save.mockRejectedValue({ code: '23505' });

      await expect(service.add(userId, dto)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('does not swallow unexpected save errors', async () => {
      repoMock.count.mockResolvedValue(0);
      repoMock.findOne.mockResolvedValue(null);
      const boom = new Error('disk full');
      repoMock.save.mockRejectedValue(boom);

      await expect(service.add(userId, dto)).rejects.toBe(boom);
    });
  });

  describe('remove', () => {
    it('removes a link owned by the current user', async () => {
      repoMock.findOne.mockResolvedValue({
        id: 'link-1',
        userId,
      });

      await service.remove(userId, 'link-1');

      expect(repoMock.remove).toHaveBeenCalledWith({
        id: 'link-1',
        userId,
      } as PortfolioLink);
    });

    it('throws NotFoundException when the link does not exist', async () => {
      repoMock.findOne.mockResolvedValue(null);

      await expect(service.remove(userId, 'missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(repoMock.remove).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the link is owned by another user', async () => {
      repoMock.findOne.mockResolvedValue({
        id: 'link-1',
        userId: otherUserId,
      });

      await expect(service.remove(userId, 'link-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(repoMock.remove).not.toHaveBeenCalled();
    });
  });
});
