import {
  BusinessRuleException,
  DuplicateResourceException,
} from '../../common/errors/app-exceptions';
import { PortfolioPlatform } from '../portfolio-link.entity';
import { PortfolioLinksService } from '../portfolio-links.service';

function makeRepo(rows: any[] = []) {
  return {
    find: jest.fn(async ({ where }: any) =>
      rows.filter((r) => r.walletAddress === where.walletAddress),
    ),
    count: jest.fn(
      async ({ where }: any) =>
        rows.filter((r) => r.walletAddress === where.walletAddress).length,
    ),
    findOne: jest.fn(
      async ({ where }: any) =>
        rows.find(
          (r) =>
            (!where.id || r.id === where.id) &&
            (!where.walletAddress || r.walletAddress === where.walletAddress) &&
            (!where.url || r.url === where.url),
        ) ?? null,
    ),
    create: jest.fn((d: any) => ({
      id: `id-${rows.length + 1}`,
      createdAt: new Date(),
      ...d,
    })),
    save: jest.fn(async (e: any) => {
      rows.push(e);
      return e;
    }),
    remove: jest.fn(async (e: any) => {
      const i = rows.indexOf(e);
      if (i >= 0) rows.splice(i, 1);
    }),
  };
}

describe('PortfolioLinksService', () => {
  const wallet = 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37';
  const config = { get: jest.fn().mockReturnValue('false') };

  it('creates valid link and detects platform', async () => {
    const repo = makeRepo();
    const svc = new PortfolioLinksService(repo as any, config as any);
    const res = await svc.create(wallet, {
      url: 'https://github.com/alice',
      displayTitle: 'GitHub',
    });
    expect(res.platform).toBe(PortfolioPlatform.GITHUB);
  });

  it('rejects duplicate URL for same user', async () => {
    const repo = makeRepo([
      { id: '1', walletAddress: wallet, url: 'https://github.com/alice' },
    ]);
    const svc = new PortfolioLinksService(repo as any, config as any);
    await expect(
      svc.create(wallet, { url: 'https://github.com/alice' }),
    ).rejects.toBeInstanceOf(DuplicateResourceException);
  });

  it('enforces max 10 links', async () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({
      id: String(i),
      walletAddress: wallet,
      url: `https://example${i}.com`,
    }));
    const repo = makeRepo(rows);
    const svc = new PortfolioLinksService(repo as any, config as any);
    await expect(
      svc.create(wallet, { url: 'https://github.com/alice' }),
    ).rejects.toBeInstanceOf(BusinessRuleException);
  });

  it('rejects invalid protocol', async () => {
    const repo = makeRepo();
    const svc = new PortfolioLinksService(repo as any, config as any);
    await expect(
      svc.create(wallet, { url: 'http://github.com/alice' }),
    ).rejects.toBeInstanceOf(BusinessRuleException);
  });
});
