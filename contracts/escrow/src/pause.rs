//! Emergency pause module for SkillSync Escrow
//!
//! Allows an address holding `DEFAULT_ADMIN_ROLE` to halt all state-changing
//! operations in case of a bug or active exploit, then resume them once the
//! situation is resolved.
//!
//! # Storage
//! A single `bool` is written to **persistent** storage under [`PAUSED_KEY`].
//! Persistent storage is used so the paused state survives ledger TTL expiry
//! and is never silently reset.
//!
//! # Usage
//! ```rust
//! // At the top of any state-changing function:
//! when_not_paused!(&env);
//!
//! // Or call the helper directly:
//! pause::assert_not_paused(&env);
//! ```
//!
//! View functions (getters) intentionally do **not** call `assert_not_paused`
//! so that off-chain tooling can always inspect contract state.

use soroban_sdk::{contracttype, Env, Symbol};

// ============================================================================
// Storage key
// ============================================================================

/// Persistent storage key for the paused flag.
#[contracttype]
#[derive(Clone)]
pub enum PauseKey {
    Paused,
}

// ============================================================================
// Core helpers
// ============================================================================

/// Returns `true` when the contract is currently paused.
pub fn is_paused(env: &Env) -> bool {
    env.storage()
        .persistent()
        .get::<PauseKey, bool>(&PauseKey::Paused)
        .unwrap_or(false)
}

/// Panics with `"ContractPaused"` if the contract is paused.
///
/// Call this at the top of every state-changing function.
pub fn assert_not_paused(env: &Env) {
    if is_paused(env) {
        panic!("ContractPaused");
    }
}

/// Pause the contract.
///
/// Caller must hold `DEFAULT_ADMIN_ROLE` (enforced by the caller via
/// `only_role!` before calling this function).
/// Emits a `Paused` event.
/// No-ops silently if already paused.
pub fn pause(env: &Env, admin: &soroban_sdk::Address) {
    if is_paused(env) {
        return;
    }
    env.storage()
        .persistent()
        .set(&PauseKey::Paused, &true);

    env.events()
        .publish((Symbol::new(env, "Paused"),), admin.clone());
}

/// Unpause the contract.
///
/// Caller must hold `DEFAULT_ADMIN_ROLE` (enforced by the caller via
/// `only_role!` before calling this function).
/// Emits an `Unpaused` event.
/// No-ops silently if not currently paused.
pub fn unpause(env: &Env, admin: &soroban_sdk::Address) {
    if !is_paused(env) {
        return;
    }
    env.storage()
        .persistent()
        .set(&PauseKey::Paused, &false);

    env.events()
        .publish((Symbol::new(env, "Unpaused"),), admin.clone());
}
