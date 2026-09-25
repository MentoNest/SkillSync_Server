use soroban_sdk::{Address, Env};

use crate::errors::ContractError;
use crate::events;
use crate::storage;

/// Initialize the contract state.
///
/// This function is protected by an "only_once" pattern: it checks whether
/// the `Initialized` flag is already set in persistent storage. If it is,
/// the call reverts with `ContractError::AlreadyInitialized`.
///
/// On success:
/// - Stores `admin` and `treasury` in persistent instance storage.
/// - Sets the `Initialized` flag.
/// - Emits an `Initialized` event carrying both addresses.
pub fn initialize(env: &Env, admin: Address, treasury: Address) -> Result<(), ContractError> {
    // ── Only-once guard ─────────────────────────────────────────────────
    if storage::is_initialized(env) {
        return Err(ContractError::AlreadyInitialized);
    }

    // ── Require deployer authorization ──────────────────────────────────
    // The admin must sign the transaction that calls initialize,
    // preventing arbitrary actors from claiming the admin role.
    admin.require_auth();

    // ── Persist state ───────────────────────────────────────────────────
    storage::set_admin(env, &admin);
    storage::set_treasury(env, &treasury);
    storage::set_initialized(env);

    // ── Emit event ──────────────────────────────────────────────────────
    events::emit_initialized(env, &admin, &treasury);

    Ok(())
}
