export const NONCE_TTL_SECONDS = 60 * 5;

export const NONCE_RATE_LIMIT = {
  ttl: 60,
  limit: 5,
};

export const LOGIN_RATE_LIMIT = {
  ttl: 60 * 15,
  limit: 10,
};

export const NONCE_KEY_PREFIX = 'nonce:';
export const LOGIN_RATE_KEY_PREFIX = 'login-rate:';

export enum StellarNetwork {
  MAINNET = 'mainnet',
  TESTNET = 'testnet',
}

export const STELLAR_NETWORK = process.env.STELLAR_NETWORK || StellarNetwork.TESTNET;