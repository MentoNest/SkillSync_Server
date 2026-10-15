use soroban_sdk::{contracttype, Address, Env};

/// Persistent contract state keys.
///
/// Values live in *instance* storage: they are contract-wide configuration
/// (one admin, one treasury, one initialized flag) rather than per-key
/// records, and instance storage is the cheap, TTL-extending home for that.
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// `bool` — set once by `initialize`, never cleared.
    Initialized,
    /// `Address` — the governing admin.
    Admin,
    /// `Address` — the fee-receiving treasury.
    Treasury,
}

/// Whether `initialize` has already run.
pub fn is_initialized(env: &Env) -> bool {
    env.storage().instance().has(&DataKey::Initialized)
}

/// Flip the only-once flag. Called exclusively by `initialize`.
pub fn set_initialized(env: &Env) {
    env.storage().instance().set(&DataKey::Initialized, &true);
}

/// Store the admin address (persistent for the contract's lifetime).
pub fn set_admin(env: &Env, admin: &Address) {
    env.storage().instance().set(&DataKey::Admin, admin);
}

/// Read the stored admin, or `None` when the contract is uninitialized.
pub fn get_admin(env: &Env) -> Option<Address> {
    env.storage().instance().get(&DataKey::Admin)
}

/// Store the treasury address.
pub fn set_treasury(env: &Env, treasury: &Address) {
    env.storage().instance().set(&DataKey::Treasury, treasury);
}

/// Read the stored treasury, or `None` when the contract is uninitialized.
pub fn get_treasury(env: &Env) -> Option<Address> {
    env.storage().instance().get(&DataKey::Treasury)
}
