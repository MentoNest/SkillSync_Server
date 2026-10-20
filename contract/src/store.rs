use soroban_sdk::{Address, Env};

use crate::errors::ContractError;
use crate::{admin, payments, storage};

/// Basis-point denominator: 10_000 bps = 100%.
pub const BPS_DENOMINATOR: i128 = 10_000;

/// Splits `amount` into `(after_fee, fee_amount)` at `fee_bps` basis points.
///
/// The fee rounds down, so any fractional remainder stays with the recipient
/// and `after_fee + fee_amount == amount` always holds.
pub fn split_fee(amount: i128, fee_bps: u32) -> Result<(i128, i128), ContractError> {
    if amount < 0 {
        return Err(ContractError::InvalidAmount);
    }
    if fee_bps as i128 > BPS_DENOMINATOR {
        return Err(ContractError::FeeTooHigh);
    }
    let fee = amount
        .checked_mul(fee_bps as i128)
        .ok_or(ContractError::Overflow)?
        / BPS_DENOMINATOR;
    Ok((amount - fee, fee))
}

/// Applies the configured platform fee to `amount`: `(after_fee, fee_amount)`.
pub fn apply_fee(env: &Env, amount: i128) -> Result<(i128, i128), ContractError> {
    split_fee(amount, storage::get_platform_fee(env))
}

/// Sends `fee` to the treasury wallet; a zero fee makes no transfer.
pub fn pay_fee(env: &Env, fee: i128) -> Result<(), ContractError> {
    if fee > 0 {
        let treasury = admin::require_treasury(env)?;
        payments::pay_out(env, &treasury, fee)?;
    }
    Ok(())
}

/// Settlement path for approvals and dispute resolutions: pays `to` the
/// amount after the platform fee and the treasury the fee.
/// Returns `(paid, fee)`. Refunds before completion skip this and use
/// [`payments::pay_out`] directly, so they carry no fee.
pub fn settle_with_fee(
    env: &Env,
    to: &Address,
    amount: i128,
) -> Result<(i128, i128), ContractError> {
    let (after_fee, fee) = apply_fee(env, amount)?;
    payments::pay_out(env, to, after_fee)?;
    pay_fee(env, fee)?;
    Ok((after_fee, fee))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::MAX_PLATFORM_FEE_BPS;
    use crate::test_utils::{balance, setup};

    #[test]
    fn zero_fee_keeps_the_whole_amount() {
        assert_eq!(split_fee(1_000, 0), Ok((1_000, 0)));
        assert_eq!(split_fee(0, 0), Ok((0, 0)));
    }

    #[test]
    fn max_platform_fee_takes_ten_percent() {
        assert_eq!(split_fee(10_000, MAX_PLATFORM_FEE_BPS), Ok((9_000, 1_000)));
    }

    #[test]
    fn fee_is_expressed_in_basis_points() {
        assert_eq!(split_fee(10_000, 1), Ok((9_999, 1)));
        assert_eq!(split_fee(10_000, 250), Ok((9_750, 250)));
        assert_eq!(split_fee(10_000, 10_000), Ok((0, 10_000)));
    }

    #[test]
    fn fee_rounds_down_in_favour_of_the_recipient() {
        // 2.5% of 99 = 2.475 -> 2
        assert_eq!(split_fee(99, 250), Ok((97, 2)));
        // 1 bps of 9_999 = 0.9999 -> 0
        assert_eq!(split_fee(9_999, 1), Ok((9_999, 0)));
        // amounts too small for any fee
        assert_eq!(split_fee(1, MAX_PLATFORM_FEE_BPS), Ok((1, 0)));
    }

    #[test]
    fn parts_always_add_up_to_the_amount() {
        for amount in [0i128, 1, 7, 99, 1_001, 123_456_789] {
            for bps in [0u32, 1, 33, 250, 999, 1_000] {
                let (after_fee, fee) = split_fee(amount, bps).unwrap();
                assert_eq!(after_fee + fee, amount);
                assert!(fee >= 0 && after_fee >= 0);
            }
        }
    }

    #[test]
    fn invalid_inputs_are_rejected() {
        assert_eq!(split_fee(-1, 100), Err(ContractError::InvalidAmount));
        assert_eq!(split_fee(100, 10_001), Err(ContractError::FeeTooHigh));
        assert_eq!(
            split_fee(i128::MAX, 2),
            Err(ContractError::Overflow)
        );
    }

    #[test]
    fn apply_fee_uses_the_configured_platform_fee() {
        let f = setup();
        f.env.as_contract(&f.contract_id, || {
            assert_eq!(apply_fee(&f.env, 1_000), Ok((1_000, 0)));
            storage::set_platform_fee(&f.env, 500);
            assert_eq!(apply_fee(&f.env, 1_000), Ok((950, 50)));
        });
    }

    #[test]
    fn settle_with_fee_sends_the_fee_to_the_treasury() {
        let f = setup();
        soroban_sdk::token::StellarAssetClient::new(&f.env, &f.token).mint(&f.contract_id, &2_000);
        f.env.as_contract(&f.contract_id, || {
            storage::set_platform_fee(&f.env, 1_000);
            assert_eq!(settle_with_fee(&f.env, &f.seller, 2_000), Ok((1_800, 200)));
        });
        assert_eq!(balance(&f, &f.seller), 1_800);
        assert_eq!(balance(&f, &f.treasury), 200);
        assert_eq!(balance(&f, &f.contract_id), 0);
    }
}
