use soroban_sdk::{Address, Env};

use crate::errors::ContractError;
use crate::events;
use crate::storage;

/// Maximum allowed platform fee: 1000 bps = 10%.
const MAX_FEE_BPS: u32 = 1000;

/// Set a new platform fee (admin only).
///
/// # Authorization
/// Requires that `caller` is the stored admin address and that they have
/// signed the transaction (`require_auth()`).
///
/// # Validation
/// `new_fee_bps` must be in the range 0–1000 (0%–10%).
///
/// # Events
/// Emits `PlatformFeeUpdated` with the new fee value.
pub fn set_platform_fee(env: &Env, caller: Address, new_fee_bps: u32) -> Result<(), ContractError> {
    // ── Contract must be initialized ────────────────────────────────────
    if !storage::is_initialized(env) {
        return Err(ContractError::NotInitialized);
    }

    // ── Admin-only authorization ─────────────────────────────────────────
    let admin = storage::get_admin(env).ok_or(ContractError::NotInitialized)?;

    if caller != admin {
        return Err(ContractError::Unauthorized);
    }

    // Require the admin to have signed this transaction
    caller.require_auth();

    // ── Fee range validation ─────────────────────────────────────────────
    if new_fee_bps > MAX_FEE_BPS {
        return Err(ContractError::InvalidFee);
    }

    // ── Persist and emit ─────────────────────────────────────────────────
    storage::set_platform_fee_bps(env, new_fee_bps);
    events::emit_platform_fee_updated(env, new_fee_bps);

    Ok(())
}

/// Return the current platform fee in basis points.
///
/// Defaults to 0 if not explicitly set (safe default before first admin call).
pub fn get_platform_fee(env: &Env) -> u32 {
    storage::get_platform_fee_bps(env)
}
