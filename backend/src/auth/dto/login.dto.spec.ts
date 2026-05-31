import { validate } from 'class-validator';
import { LoginDto } from './login.dto';

describe('LoginDto', () => {
  it('should validate a correct login request', async () => {
    const dto = new LoginDto();
    dto.walletAddress = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVW';
    dto.signature = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/' +
                    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/' +
                    'AB==';
    dto.nonce = 'random-nonce-string';

    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should reject invalid Stellar address', async () => {
    const dto = new LoginDto();
    dto.walletAddress = 'invalid-address';
    dto.signature = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/' +
                    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/' +
                    'AB==';
    dto.nonce = 'random-nonce-string';

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.property === 'walletAddress')).toBe(true);
  });

  it('should reject invalid signature', async () => {
    const dto = new LoginDto();
    dto.walletAddress = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVW';
    dto.signature = 'invalid-signature';
    dto.nonce = 'random-nonce-string';

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.property === 'signature')).toBe(true);
  });

  it('should reject missing wallet address', async () => {
    const dto = new LoginDto();
    dto.walletAddress = '';
    dto.signature = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/' +
                    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/' +
                    'AB==';
    dto.nonce = 'random-nonce-string';

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject missing nonce', async () => {
    const dto = new LoginDto();
    dto.walletAddress = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVW';
    dto.signature = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/' +
                    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/' +
                    'AB==';
    dto.nonce = '';

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});
