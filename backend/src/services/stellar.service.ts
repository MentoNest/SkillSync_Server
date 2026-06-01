import { Transaction, Horizon } from 'stellar-sdk';

const server = new Horizon.Server('https://horizon-testnet.stellar.org');

/**
 * Simulates a Stellar transaction without submitting it to the network.
 *
 * @param transaction - The built Stellar transaction to simulate.
 * @returns A promise resolving to the simulation result from Horizon.
 * @throws {Error} If the transaction is malformed or the network is unreachable.
 */
export async function simulateTransaction(transaction: Transaction): Promise<unknown> {
  return server.operations().forTransaction(transaction.hash().toString('hex')).call();
}

/**
 * Estimates the base fee for the current network state.
 *
 * @returns A promise resolving to the recommended fee in stroops.
 * @throws {Error} If the fee stats endpoint is unreachable.
 */
export async function estimateFee(): Promise<number> {
  const feeStats = await server.feeStats();
  return parseInt(feeStats.fee_charged.mode, 10);
}

/**
 * Retrieves the current Stellar network status.
 *
 * @returns A promise resolving to the latest ledger info including sequence and base fee.
 * @throws {Error} If the network is unreachable.
 */
export async function getNetworkStatus(): Promise<unknown> {
  return server.ledgers().order('desc').limit(1).call();
}
