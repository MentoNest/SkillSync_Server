import { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { isDemoSeedEnabled } from '../demo-seed.flag';
import { runDemoSeed } from '../run-demo-seed';

describe('SEED_DEMO_DATA', () => {
  const original = process.env.SEED_DEMO_DATA;

  afterEach(() => {
    if (original === undefined) delete process.env.SEED_DEMO_DATA;
    else process.env.SEED_DEMO_DATA = original;
    jest.restoreAllMocks();
  });

  it.each(['false', '0', ' FALSE ', ' 0 '])(
    'treats %p as disabled',
    (value) => {
      expect(isDemoSeedEnabled(value)).toBe(false);
    },
  );

  it.each(['true', '1', '', undefined])('treats %p as enabled', (value) => {
    expect(isDemoSeedEnabled(value)).toBe(true);
  });

  it('does not create the application context when disabled', async () => {
    process.env.SEED_DEMO_DATA = '0';
    const create = jest
      .spyOn(NestFactory, 'createApplicationContext')
      .mockImplementation(() => {
        throw new Error('application context must not be created');
      });

    await expect(runDemoSeed()).resolves.toBeNull();
    expect(create).not.toHaveBeenCalled();
  });

  it('runs the seed when enabled and closes the application context', async () => {
    process.env.SEED_DEMO_DATA = 'true';
    const seed = jest
      .fn()
      .mockResolvedValue({ mentorsCreated: 5, menteesCreated: 5, skipped: 0 });
    const close = jest.fn().mockResolvedValue(undefined);
    const app = {
      get: jest.fn().mockReturnValue({ seed }),
      close,
    } as unknown as INestApplicationContext;
    const create = jest
      .spyOn(NestFactory, 'createApplicationContext')
      .mockResolvedValue(app);

    const result = await runDemoSeed();

    expect(create).toHaveBeenCalledTimes(1);
    expect(seed).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      mentorsCreated: 5,
      menteesCreated: 5,
      skipped: 0,
    });
  });
});
