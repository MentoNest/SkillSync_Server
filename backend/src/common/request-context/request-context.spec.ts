import {
  getRequestId,
  isSafeRequestId,
  requestIdLogPrefix,
  runWithRequestContext,
  setLocalRequestId,
  withRequestIdComment,
} from './request-context';

describe('request context', () => {
  it('exposes the request id inside the run, including after awaits', async () => {
    await runWithRequestContext({ requestId: 'abcd1234-aaaa' }, async () => {
      await Promise.resolve();
      expect(getRequestId()).toBe('abcd1234-aaaa');
      expect(requestIdLogPrefix()).toBe('[abcd1234-aaaa] ');
    });
    expect(getRequestId()).toBeUndefined();
    expect(requestIdLogPrefix()).toBe('');
  });

  it('keeps concurrent requests isolated', async () => {
    const seen: string[] = [];
    await Promise.all(
      ['aaaaaaaa-1', 'bbbbbbbb-2'].map((requestId) =>
        runWithRequestContext({ requestId }, async () => {
          await new Promise((r) => setTimeout(r, 5));
          seen.push(getRequestId()!);
        }),
      ),
    );
    expect(seen.sort()).toEqual(['aaaaaaaa-1', 'bbbbbbbb-2']);
  });

  it('rejects unsafe ids', () => {
    expect(isSafeRequestId('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    expect(isSafeRequestId('x*/ DROP TABLE')).toBe(false);
    expect(isSafeRequestId('')).toBe(false);
    expect(isSafeRequestId('a'.repeat(65))).toBe(false);
  });

  it('adds the request id to SQL as a comment only when safe', () => {
    runWithRequestContext({ requestId: 'abcd1234-aaaa' }, () => {
      expect(withRequestIdComment('SELECT 1')).toBe('SELECT 1 /* request_id=abcd1234-aaaa */');
    });
    runWithRequestContext({ requestId: '*/ evil' }, () => {
      expect(withRequestIdComment('SELECT 1')).toBe('SELECT 1');
    });
    expect(withRequestIdComment('SELECT 1')).toBe('SELECT 1');
  });

  it('sets the id as a transaction-local setting', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    await runWithRequestContext({ requestId: 'abcd1234-aaaa' }, () => setLocalRequestId({ query }));
    expect(query).toHaveBeenCalledWith(expect.stringContaining('set_config'), ['abcd1234-aaaa']);
  });
});
