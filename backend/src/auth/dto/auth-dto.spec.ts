import { validate } from 'class-validator';
import { LoginDto } from './login.dto';
import { NonceRequestDto } from './nonce.dto';
import { RefreshDto } from './refresh.dto';
import { LoginDto as BarrelLoginDto, NonceRequestDto as BarrelNonceDto, RefreshDto as BarrelRefreshDto } from './auth.dto';

const WALLET = 'G' + 'A'.repeat(55);

function assign<T extends object>(dto: T, values: Partial<T>): T {
  return Object.assign(dto, values);
}

describe('auth DTOs', () => {
  it('re-exports the split DTO classes from the barrel', () => {
    expect(BarrelLoginDto).toBe(LoginDto);
    expect(BarrelNonceDto).toBe(NonceRequestDto);
    expect(BarrelRefreshDto).toBe(RefreshDto);
  });

  it('accepts a valid nonce request in either casing', async () => {
    const lower = assign(new NonceRequestDto(), { walletAddress: WALLET.toLowerCase() });
    await expect(validate(lower)).resolves.toEqual([]);
    const upper = assign(new NonceRequestDto(), { walletAddress: WALLET });
    await expect(validate(upper)).resolves.toEqual([]);
  });

  it('rejects an invalid wallet address in a nonce request', async () => {
    const dto = assign(new NonceRequestDto(), { walletAddress: 'nope' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('walletAddress');
  });

  it('rejects a short nonce and missing signature in a login', async () => {
    const dto = assign(new LoginDto(), {
      walletAddress: WALLET,
      nonce: 'short',
      signature: '',
    });
    const errors = await validate(dto);
    const properties = errors.map((error) => error.property).sort();
    expect(properties).toEqual(['nonce', 'signature']);
  });

  it('accepts a well-formed login payload', async () => {
    const dto = assign(new LoginDto(), {
      walletAddress: WALLET,
      nonce: 'n'.repeat(64),
      signature: 'c2ln',
    });
    await expect(validate(dto)).resolves.toEqual([]);
  });

  it('requires a refresh token', async () => {
    const errors = await validate(new RefreshDto());
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('refreshToken');
  });
});
