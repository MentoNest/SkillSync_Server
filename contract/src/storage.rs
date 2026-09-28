use soroban_sdk::{contracttype, Address};

/// Persistent storage keys for the contract.
///
/// Using `contracttype` ensures the keys are serialized consistently
/// in the ledger and avoids raw string collisions.
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// Whether the contract has been initialized (bool).
    Initialized,
    /// The admin address.
    Admin,
    /// The treasury address.
    Treasury,
    /// The current platform fee in basis points (u32).
    PlatformFeeBps,
}

/// Typed wrappers around raw storage to keep business logic clean.
use soroban_sdk::Env;

pub fn is_initialized(env: &Env) -> bool {
    env.storage()
        .instance()
        .get::<DataKey, bool>(&DataKey::Initialized)
        .unwrap_or(false)
}

pub fn set_initialized(env: &Env) {
    env.storage()
        .instance()
        .set(&DataKey::Initialized, &true);
}

pub fn get_admin(env: &Env) -> Option<Address> {
    env.storage()
        .instance()
        .get::<DataKey, Address>(&DataKey::Admin)
}

pub fn set_admin(env: &Env, admin: &Address) {
    env.storage().instance().set(&DataKey::Admin, admin);
}

pub fn get_treasury(env: &Env) -> Option<Address> {
    env.storage()
        .instance()
        .get::<DataKey, Address>(&DataKey::Treasury)
}

pub fn set_treasury(env: &Env, treasury: &Address) {
    env.storage()
        .instance()
        .set(&DataKey::Treasury, treasury);
}

pub fn get_platform_fee_bps(env: &Env) -> u32 {
    env.storage()
        .instance()
        .get::<DataKey, u32>(&DataKey::PlatformFeeBps)
        .unwrap_or(0)
}

pub fn set_platform_fee_bps(env: &Env, fee_bps: u32) {
    env.storage()
        .instance()
        .set(&DataKey::PlatformFeeBps, &fee_bps);
}
