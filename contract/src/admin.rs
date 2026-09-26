use soroban_sdk::{contracttype, symbol_short, Address, Env};

use crate::errors::ContractError;
use crate::events;
use crate::storage;

/// Default dispute resolution window, in ledgers (~1 hour on Stellar),
/// used until an admin configures a different value.
const DEFAULT_DISPUTE_WINDOW: u32 = 1000;

/// Storage keys owned by this module.
///
/// The dispute window has no accessor in `storage` yet, so it keeps its key
/// local rather than widening that module's `DataKey` enum. This mirrors how
/// `dispute` and `session` each own a private key type.
#[contracttype]
#[derive(Clone)]
enum ConfigKey {
    DisputeWindow,
}

/// Assert that `caller` is the stored admin, and that they authorized this
/// call. Shared by the admin-only setters in this module.
fn require_admin(env: &Env, caller: &Address) -> Result<(), ContractError> {
    if !storage::is_initialized(env) {
        return Err(ContractError::NotInitialized);
    }

    let admin = storage::get_admin(env).ok_or(ContractError::NotInitialized)?;
    if caller != &admin {
        return Err(ContractError::Unauthorized);
    }

    caller.require_auth();
    Ok(())
}

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

/// Update the treasury wallet that receives platform fees (admin only).
///
/// `new_treasury` is a `soroban_sdk::Address`, so it is guaranteed by the
/// SDK to be a valid contract address; no extra validation is needed.
///
/// # Events
/// Emits `TreasuryUpdated` with the new treasury address.
///
/// # Errors
/// - [`ContractError::NotInitialized`] if the contract is not initialized.
/// - [`ContractError::Unauthorized`] if `caller` is not the admin.
pub fn set_treasury(
    env: &Env,
    caller: Address,
    new_treasury: Address,
) -> Result<(), ContractError> {
    require_admin(env, &caller)?;

    storage::set_treasury(env, &new_treasury);
    env.events()
        .publish((symbol_short!("treasury"), new_treasury), ());

    Ok(())
}

/// Return the treasury wallet that receives platform fees.
///
/// `None` until [`initialize`] has run.
pub fn get_treasury(env: &Env) -> Option<Address> {
    storage::get_treasury(env)
}

/// Set the dispute resolution window, in ledgers (admin only).
///
/// The window is the number of ledgers after a session is marked complete
/// during which a dispute can still be opened.
///
/// # Events
/// Emits `DisputeWindowUpdated` with the new window.
///
/// # Errors
/// - [`ContractError::NotInitialized`] if the contract is not initialized.
/// - [`ContractError::Unauthorized`] if `caller` is not the admin.
pub fn set_dispute_window(
    env: &Env,
    caller: Address,
    window_ledgers: u32,
) -> Result<(), ContractError> {
    require_admin(env, &caller)?;

    env.storage()
        .instance()
        .set(&ConfigKey::DisputeWindow, &window_ledgers);
    env.events()
        .publish((symbol_short!("disp_win"), window_ledgers), ());

    Ok(())
}

/// Return the dispute resolution window in ledgers.
///
/// Falls back to [`DEFAULT_DISPUTE_WINDOW`] before an admin sets one.
pub fn get_dispute_window(env: &Env) -> u32 {
    env.storage()
        .instance()
        .get::<ConfigKey, u32>(&ConfigKey::DisputeWindow)
        .unwrap_or(DEFAULT_DISPUTE_WINDOW)
}
