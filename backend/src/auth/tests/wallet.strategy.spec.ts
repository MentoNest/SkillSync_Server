import { Keypair } from 'stellar-sdk';
import { WalletStrategy } from '../strategies/wallet.strategy';

const keypair = Keypair.random();
const wallet = keypair.publicKey();

function makeSignature(nonce: string, network: string): string {
  const message = Buffer.from(`${network}:${nonce}`, 'utf8');
  return keypair.sign(message).toString('base64');
}

const mockUser = { id: 'user-1', wallet };
const mockRedisGet = jest.fn();
const mockFindOrCreate = jest.fn().mockResolvedValue(mockUser);

const mockRedisService = { get: mockRedisGet };
const mockUserService = { findOrCreateByWallet: mockFindOrCreate };

function makeStrategy(): WalletStrategy {
  return new WalletStrategy(mockRedisService as any, mockUserService as any);
}

function makeRequest(body: Record<string, string>) {
  return { body } as any;
}

describe('WalletStrategy', () => {
  let strategy: WalletStrategy;
  let successSpy: jest.Mock;
  let failSpy: jest.Mock;
  let errorSpy: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    strategy = makeStrategy();
    successSpy = jest.fn();
    failSpy = jest.fn();
    errorSpy = jest.fn();
    (strategy as any).success = successSpy;
    (strategy as any).fail = failSpy;
    (strategy as any).error = errorSpy;
  });

  it('calls success with user on valid signature', async () => {
    const nonce = 'abc123nonce';
    mockRedisGet.mockResolvedValue(nonce);

    await strategy.authenticate(
      makeRequest({
        wallet,
        signature: makeSignature(nonce, 'testnet'),
        nonce,
        network: 'testnet',
      }),
    );

    expect(mockRedisGet).toHaveBeenCalledWith(wallet, 'nonce');
    expect(mockFindOrCreate).toHaveBeenCalledWith(wallet);
    expect(successSpy).toHaveBeenCalledWith(mockUser);
    expect(failSpy).not.toHaveBeenCalled();
  });

  it('fails with 400 when required fields are missing', async () => {
    await strategy.authenticate(makeRequest({ wallet }));

    expect(failSpy).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('required') }),
      400,
    );
    expect(successSpy).not.toHaveBeenCalled();
  });

  it('fails with 401 when stored nonce does not match', async () => {
    mockRedisGet.mockResolvedValue('different-nonce');

    await strategy.authenticate(
      makeRequest({ wallet, signature: 'sig', nonce: 'my-nonce', network: 'testnet' }),
    );

    expect(failSpy).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Nonce expired or invalid' }),
      401,
    );
  });

  it('fails with 401 when nonce not found in Redis', async () => {
    mockRedisGet.mockResolvedValue(null);

    await strategy.authenticate(
      makeRequest({ wallet, signature: 'sig', nonce: 'nonce', network: 'testnet' }),
    );

    expect(failSpy).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Nonce expired or invalid' }),
      401,
    );
  });

  it('fails with 401 when signature is invalid', async () => {
    const nonce = 'abc123';
    mockRedisGet.mockResolvedValue(nonce);

    await strategy.authenticate(
      makeRequest({ wallet, signature: 'badsignature==', nonce, network: 'testnet' }),
    );

    expect(failSpy).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Invalid wallet signature' }),
      401,
    );
    expect(successSpy).not.toHaveBeenCalled();
  });

  it('calls error when an unexpected exception occurs', async () => {
    const nonce = 'abc123';
    mockRedisGet.mockResolvedValue(nonce);
    mockFindOrCreate.mockRejectedValue(new Error('DB down'));

    await strategy.authenticate(
      makeRequest({
        wallet,
        signature: makeSignature(nonce, 'testnet'),
        nonce,
        network: 'testnet',
      }),
    );

    expect(errorSpy).toHaveBeenCalledWith(expect.any(Error));
  });
});
