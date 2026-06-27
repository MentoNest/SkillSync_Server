import { validate } from 'class-validator';
import { IsStellarAddress } from './is-stellar-address.validator';

class TestDto {
  @IsStellarAddress()
  wallet: string;
}

describe('IsStellarAddress', () => {
  async function runValidation(wallet: string) {
    const dto = Object.assign(new TestDto(), { wallet });
    return validate(dto);
  }

  it('accepts a valid Stellar ED25519 public key', async () => {
    // Valid testnet/mainnet public key (56 chars, starts with G)
    const errors = await runValidation('GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN');
    expect(errors).toHaveLength(0);
  });

  it('rejects an empty string', async () => {
    const errors = await runValidation('');
    expect(errors).toHaveLength(1);
    expect(errors[0].constraints?.IsStellarAddress).toContain('wallet');
  });

  it('rejects a key that is too short', async () => {
    const errors = await runValidation('GAAZI4TCR3TY5OJHCTJC');
    expect(errors).toHaveLength(1);
  });

  it('rejects a non-G prefixed string', async () => {
    const errors = await runValidation('BAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN');
    expect(errors).toHaveLength(1);
  });

  it('rejects a random string', async () => {
    const errors = await runValidation('not-a-stellar-address');
    expect(errors).toHaveLength(1);
  });

  it('rejects non-string values', async () => {
    const errors = await runValidation(123 as any);
    expect(errors).toHaveLength(1);
  });

  it('includes a descriptive error message', async () => {
    const errors = await runValidation('invalid');
    expect(errors[0].constraints?.IsStellarAddress).toMatch(/Stellar ED25519/);
  });
});
