import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import { AuditService } from '../../audit/audit.service';
import { PortfolioLink, PortfolioPlatform } from './entities/portfolio-link.entity';
import { PortfolioLinksService } from './portfolio-links.service';

describe('PortfolioLinksService', () => {
  let service: PortfolioLinksService;
  const links = {
    findOne: jest.fn(),
    find: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
  };
  const audit = { record: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    links.create.mockImplementation((value: unknown) => value);
    links.save.mockImplementation((value: Record<string, unknown>) => Promise.resolve({ id: 'l1', ...value }));
    links.findOne.mockResolvedValue(null);
    links.count.mockResolvedValue(0);
    audit.record.mockResolvedValue(undefined);

    const moduleRef = await Test.createTestingModule({
      providers: [
        PortfolioLinksService,
        { provide: getRepositoryToken(PortfolioLink), useValue: links },
        { provide: AuditService, useValue: audit },
        { provide: ConfigService, useValue: { get: jest.fn(() => 'false') } },
      ],
    }).compile();
    service = moduleRef.get(PortfolioLinksService);
  });

  describe('validateUrl', () => {
    it('accepts absolute https urls', () => {
      expect(service.validateUrl('https://github.com/octocat').hostname).toBe('github.com');
    });

    it('rejects non-https and malformed urls', () => {
      expect(() => service.validateUrl('http://github.com/octocat')).toThrow(BadRequestException);
      expect(() => service.validateUrl('not a url')).toThrow(BadRequestException);
    });

    it('strips control characters and javascript schemes', () => {
      expect(service.sanitizeUrl('  javascript:alert(1)\u0000 ')).toBe('alert(1)');
    });
  });

  describe('detectPlatform', () => {
    it('detects known hosts, mapping x.com to twitter', () => {
      expect(service.detectPlatform(new URL('https://x.com/u'))).toBe(PortfolioPlatform.TWITTER);
      expect(service.detectPlatform(new URL('https://www.github.com/u'))).toBe(PortfolioPlatform.GITHUB);
      expect(service.detectPlatform(new URL('https://dev.to/u'))).toBe(PortfolioPlatform.DEVTO);
    });

    it('falls back to website and honours an explicit platform', () => {
      expect(service.detectPlatform(new URL('https://example.com'))).toBe(PortfolioPlatform.WEBSITE);
      expect(service.detectPlatform(new URL('https://example.com'), PortfolioPlatform.MEDIUM)).toBe(
        PortfolioPlatform.MEDIUM,
      );
    });
  });

  describe('add', () => {
    it('saves a valid link and records an audit event', async () => {
      const saved = await service.add('u1', { url: 'https://github.com/octocat' });
      expect(saved.platform).toBe(PortfolioPlatform.GITHUB);
      expect(links.save).toHaveBeenCalled();
      expect(audit.record).toHaveBeenCalled();
    });

    it('rejects duplicate urls for the same user', async () => {
      links.findOne.mockResolvedValue({ id: 'existing' });
      await expect(service.add('u1', { url: 'https://github.com/octocat' })).rejects.toBeInstanceOf(ConflictException);
    });

    it('enforces the ten link maximum', async () => {
      links.count.mockResolvedValue(10);
      await expect(service.add('u1', { url: 'https://github.com/octocat' })).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('remove', () => {
    it('prevents a user from removing someone else link', async () => {
      links.findOne.mockResolvedValue({ id: 'l1', userId: 'someone' });
      await expect(service.remove('u1', 'l1')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('lets an admin remove any link', async () => {
      links.findOne.mockResolvedValue({ id: 'l1', userId: 'someone' });
      await service.remove('admin', 'l1', true);
      expect(links.delete).toHaveBeenCalledWith({ id: 'l1' });
    });

    it('throws when the link does not exist', async () => {
      links.findOne.mockResolvedValue(null);
      await expect(service.remove('u1', 'missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
