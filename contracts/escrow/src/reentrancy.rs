// ============================================================================
// reentrancy.rs — Issue: Non-Reentrant Guard (Error code 700)
//
// Soroban contracts are single-threaded and cross-contract calls are
// synchronous, so reentrancy CAN occur when this contract calls an external
// token contract that itself calls back into this contract.
//
// Pattern:
//   1. Set LOCK flag in instance storage BEFORE the external call.
//   2. Clear the flag AFTER the external call returns.
//   3. Any entry-point that finds the flag already set panics with code 700.
// ============================================================================

use soroban_sdk::{symbol_short, Env, Symbol};

/// Instance-storage key for the reentrancy lock.
const REENTRANT_KEY: Symbol = symbol_short!("RE_LOCK");

/// Error code emitted when a reentrant call is detected.
pub const REENTRANCY_ERROR_CODE: u32 = 700;

/// Acquire the reentrancy lock.
///
/// Panics with `ReentrancyDetected (700)` if the lock is already held,
/// indicating a reentrant call is in progress.
///
/// # Usage
/// ```rust
/// reentrancy::acquire(&env);
/// // ... perform token transfer ...
/// reentrancy::release(&env);
/// ```
pub fn acquire(env: &Env) {
    let locked: bool = env
        .storage()
        .instance()
        .get(&REENTRANT_KEY)
        .unwrap_or(false);

    if locked {
        // Error code 700 — ReentrancyDetected
        panic!("ReentrancyDetected: error code 700");
    }

    env.storage().instance().set(&REENTRANT_KEY, &true);
}

/// Release the reentrancy lock.
///
/// Must be called after every successful `acquire`. Failing to call this
/// will permanently lock the contract instance (storage is persistent across
/// ledgers for instance storage within a single invocation, but resets across
/// separate top-level invocations — however it is best practice to always
/// release explicitly).
pub fn release(env: &Env) {
    env.storage().instance().set(&REENTRANT_KEY, &false);
}

/// Convenience guard: acquires lock, runs `f`, then releases — even if `f`
/// panics (Soroban unwinds storage changes on panic, so the lock is
/// effectively released by the revert, but we release explicitly for clarity).
///
/// Example:
/// ```rust
/// reentrancy::guarded(&env, || {
///     token::Client::new(&env, &token_id)
///         .transfer(&env.current_contract_address(), &recipient, &amount);
/// });
/// ```
pub fn guarded<F: FnOnce()>(env: &Env, f: F) {
    acquire(env);
    f();
    release(env);
}