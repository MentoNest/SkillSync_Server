import { Keypair, StrKey } from '@stellar/stellar-sdk';
import { validateUsername } from '../../user/username.validator';
import { buildDemoAccounts, DEMO_MENTEES, DEMO_MENTORS } from '../demo-data';
import { createDemoWallet } from '../demo-wallet';

describe('demo account data', () => {
  it('defines deterministic, valid demo identities', () => {
    expect(DEMO_MENTORS).toHaveLength(5);
    expect(DEMO_MENTEES).toHaveLength(5);

    const accounts = [...DEMO_MENTORS, ...DEMO_MENTEES];
    expect(new Set(accounts.map((account) => account.email)).size).toBe(10);
    expect(new Set(accounts.map((account) => account.username)).size).toBe(10);

    for (const account of accounts) {
      expect(account.email).toBe(`${account.username}@example.com`);
      expect(validateUsername(account.username).valid).toBe(true);
      expect(account.displayName.length).toBeLessThanOrEqual(50);
      expect(account.education?.length).toBeGreaterThan(0);
    }
  });

  it('generates the same profile content on every build', () => {
    const reloaded = buildDemoAccounts();

    expect(reloaded.mentors).toEqual(DEMO_MENTORS);
    expect(reloaded.mentees).toEqual(DEMO_MENTEES);
  });

  it('generates normalized Stellar wallets', () => {
    for (let index = 0; index < 5; index += 1) {
      const wallet = createDemoWallet();
      expect(wallet).toBe(wallet.toLowerCase());
      expect(
        StrKey.isValidEd25519PublicKey(
          Keypair.fromPublicKey(wallet.toUpperCase()).publicKey(),
        ),
      ).toBe(true);
    }
  });
});
