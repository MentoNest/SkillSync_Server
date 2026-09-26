use soroban_sdk::{Address, Env};

use crate::admin::require_admin;
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
    // ── Admin-only authorization (initialization + role + auth) ─────────
    require_admin(env, &caller)?;

    // ── Fee range validation ─────────────────────────────────────────────
    if new_fee_bps > MAX_FEE_BPS {
        return Err(ContractError::FeeTooHigh);
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

/// Basis-point denominator (1 bps = 1/10_000).
const BPS_DENOMINATOR: i128 = 10_000;

/// Deduct a fee (in basis points) from `amount`, returning
/// `(amount_after_fee, fee_amount)`.
///
/// This is the single fee-calculation primitive settlement paths
/// (approvals, dispute resolutions) should call before releasing funds —
/// see BE settlement fee deduction issue. Early refunds should skip the
/// fee entirely by not calling this function (or by calling it with
/// `fee_bps: 0`), per that issue's "fee skipped for early refunds"
/// requirement.
///
/// Rounds the fee down to the nearest whole unit (truncating division),
/// so `after_fee + fee_amount` always equals `amount` exactly and the fee
/// never exceeds the amount.
///
/// # Errors
/// - [`ContractError::FeeTooHigh`] if `fee_bps` exceeds [`MAX_FEE_BPS`].
/// - [`ContractError::Overflow`] if `amount * fee_bps` overflows `i128`.
///
/// The multiplication is done with `checked_mul`/`checked_sub` rather than
/// the operators so that an absurd amount produces a typed error instead of
/// aborting the whole transaction. Release builds enable `overflow-checks`,
/// where the unchecked version would panic.
pub fn apply_fee(amount: i128, fee_bps: u32) -> Result<(i128, i128), ContractError> {
    if fee_bps > MAX_FEE_BPS {
        return Err(ContractError::FeeTooHigh);
    }

    if amount <= 0 || fee_bps == 0 {
        return Ok((amount, 0));
    }

    let scaled = amount
        .checked_mul(fee_bps as i128)
        .ok_or(ContractError::Overflow)?;
    let fee_amount = scaled / BPS_DENOMINATOR;
    let after_fee = amount
        .checked_sub(fee_amount)
        .ok_or(ContractError::Overflow)?;

    Ok((after_fee, fee_amount))
}

/// Convenience wrapper: applies the contract's currently-configured
/// platform fee (see [`get_platform_fee`]) to `amount`.
///
/// # Errors
/// Propagates whatever [`apply_fee`] returns.
pub fn apply_platform_fee(env: &Env, amount: i128) -> Result<(i128, i128), ContractError> {
    apply_fee(amount, get_platform_fee(env))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn zero_fee_returns_full_amount() {
        let (after_fee, fee) = apply_fee(1_000, 0).unwrap();
        assert_eq!(after_fee, 1_000);
        assert_eq!(fee, 0);
    }

    #[test]
    fn max_fee_takes_ten_percent() {
        // MAX_FEE_BPS is 1000 (10%).
        let (after_fee, fee) = apply_fee(1_000, 1_000).unwrap();
        assert_eq!(fee, 100);
        assert_eq!(after_fee, 900);
    }

    #[test]
    fn fee_rounds_down_on_odd_amounts() {
        // 1234 * 123 / 10_000 = 15.1782 -> truncates to 15.
        let (after_fee, fee) = apply_fee(1_234, 123).unwrap();
        assert_eq!(fee, 15);
        assert_eq!(after_fee, 1_219);
    }

    #[test]
    fn fee_never_exceeds_amount() {
        let (after_fee, fee) = apply_fee(1, 1_000).unwrap(); // 1 * 1000 / 10_000 = 0.1 -> 0
        assert_eq!(fee, 0);
        assert_eq!(after_fee, 1);
        assert!(fee <= 1);
    }

    #[test]
    fn after_fee_plus_fee_equals_amount() {
        for amount in [1_i128, 7, 1_234, 999_999] {
            for bps in [0_u32, 1, 123, 500, 1_000] {
                let (after_fee, fee) = apply_fee(amount, bps).unwrap();
                assert_eq!(after_fee + fee, amount);
            }
        }
    }

    #[test]
    fn zero_or_negative_amount_yields_no_fee() {
        assert_eq!(apply_fee(0, 500).unwrap(), (0, 0));
        assert_eq!(apply_fee(-100, 500).unwrap(), (-100, 0));
    }

    #[test]
    fn fee_above_the_maximum_is_rejected() {
        assert_eq!(
            apply_fee(1_000, MAX_FEE_BPS + 1).unwrap_err(),
            ContractError::FeeTooHigh
        );
    }

    #[test]
    fn overflowing_amount_reports_overflow_instead_of_aborting() {
        // i128::MAX * 1000 does not fit in an i128; release builds enable
        // overflow-checks, so this must be a typed error, not a panic.
        let err = apply_fee(i128::MAX, 1_000).unwrap_err();
        assert_eq!(err, ContractError::Overflow);
    }
}
