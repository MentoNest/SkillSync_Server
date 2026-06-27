import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LoginDto } from './login.dto';

const VALID_WALLET = 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN';

function make(overrides?: Partial<LoginDto>) {
  return plainToInstance(LoginDto, {
    wallet: VALID_WALLET,
    nonce: 'abc123nonce',
    signature: 'base64signature==',
    network: 'testnet',
    ...overrides,
  });
}

describe('LoginDto', () => {
  it('passes with all valid fields', async () => {
    const errors = await validate(make());
    expect(errors).toHaveLength(0);
  });

  it('fails with an invalid Stellar wallet address', async () => {
    const errors = await validate(make({ wallet: 'not-a-stellar-address' }));
    const walletErrors = errors.find((e) => e.property === 'wallet');
    expect(walletErrors).toBeDefined();
    expect(walletErrors!.constraints?.IsStellarAddress).toMatch(/Stellar ED25519/);
  });

  it('fails when wallet is empty', async () => {
    const errors = await validate(make({ wallet: '' }));
    expect(errors.find((e) => e.property === 'wallet')).toBeDefined();
  });

  it('fails when nonce is empty', async () => {
    const errors = await validate(make({ nonce: '' }));
    expect(errors.find((e) => e.property === 'nonce')).toBeDefined();
  });

  it('fails when signature is empty', async () => {
    const errors = await validate(make({ signature: '' }));
    expect(errors.find((e) => e.property === 'signature')).toBeDefined();
  });

  it('fails when network is not mainnet or testnet', async () => {
    const errors = await validate(make({ network: 'devnet' }));
    const networkErrors = errors.find((e) => e.property === 'network');
    expect(networkErrors).toBeDefined();
    expect(networkErrors!.constraints?.isIn).toMatch(/mainnet.*testnet|testnet.*mainnet/i);
  });

  it('accepts mainnet as valid network', async () => {
    const errors = await validate(make({ network: 'mainnet' }));
    expect(errors).toHaveLength(0);
  });

  it('strips extra unknown properties (whitelist)', async () => {
    const dto = plainToInstance(LoginDto, {
      wallet: VALID_WALLET,
      nonce: 'abc',
      signature: 'sig',
      network: 'testnet',
      maliciousField: 'hacked',
    });
    expect((dto as any).maliciousField).toBeUndefined();
  });
});
