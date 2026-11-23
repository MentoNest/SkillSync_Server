import { Keypair } from '@stellar/stellar-sdk';
import { normalizeWalletAddress } from '../common/utils/wallet.utils';

export const DEMO_WALLET_FACTORY = 'DEMO_WALLET_FACTORY';

export type DemoWalletFactory = () => string;

export const createDemoWallet: DemoWalletFactory = () =>
  normalizeWalletAddress(Keypair.random().publicKey());
