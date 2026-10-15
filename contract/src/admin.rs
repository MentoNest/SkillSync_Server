use soroban_sdk::{Address, Env};

use crate::errors::ContractError;
use crate::events;
use crate::storage;

/// The `only_once` guard — the contract's take on an `only_once` modifier.
///
/// Runs before any state is written: the first call proceeds, every later
/// call reverts with [`ContractError::AlreadyInitialized`] *before* touching
/// storage, so a re-initialization can never overwrite the original admin
/// or treasury.
fn only_once(env: &Env) -> Result<(), ContractError> {
    if storage::is_initialized(env) {
        return Err(ContractError::AlreadyInitialized);
    }
    Ok(())
}

/// Initialize the contract state.
///
/// Callable exactly once, by the deployer: `admin.require_auth()` means the
/// address claiming the admin role must have signed the invocation, so an
/// arbitrary third party cannot initialize the contract with itself as admin.
///
/// On success:
/// - Stores `admin` and `treasury` in instance storage.
/// - Sets the `Initialized` flag (the only-once latch).
/// - Emits `Initialized(admin, treasury)`.
///
/// # Errors
/// - [`ContractError::AlreadyInitialized`] — any call after the first.
pub fn initialize(
    env: &Env,
    admin: Address,
    treasury: Address,
) -> Result<(), ContractError> {
    // ── only_once modifier ──────────────────────────────────────────────
    only_once(env)?;

    // ── deployer authorization ──────────────────────────────────────────
    admin.require_auth();

    // ── persistent state ────────────────────────────────────────────────
    storage::set_admin(env, &admin);
    storage::set_treasury(env, &treasury);
    storage::set_initialized(env);

    // ── event ───────────────────────────────────────────────────────────
    events::emit_initialized(env, &admin, &treasury);

    Ok(())
}

/// Read the stored admin, failing when the contract is not initialized.
///
/// The entry point future admin-gated functions build on: one place decides
/// what "the contract is live" means.
pub fn require_admin(env: &Env) -> Result<Address, ContractError> {
    storage::get_admin(env).ok_or(ContractError::NotInitialized)
}

/// Read the stored treasury, failing when the contract is not initialized.
pub fn require_treasury(env: &Env) -> Result<Address, ContractError> {
    storage::get_treasury(env).ok_or(ContractError::NotInitialized)
}
