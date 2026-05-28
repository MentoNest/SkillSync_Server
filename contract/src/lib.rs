#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, vec, Env, String, Symbol, Vec};

/// Basis-point denominator. 10_000 bps == 100%.
const BPS_DENOMINATOR: i128 = 10_000;

/// Storage key for the accumulated treasury balance.
const TREASURY_KEY: Symbol = symbol_short!("TREASURY");

/// Result of splitting a session payment into seller and treasury portions.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FeeSplit {
    pub seller_amount: i128,
    pub treasury_amount: i128,
}

#[contract]
pub struct Contract;

#[contractimpl]
impl Contract {
    pub fn hello(env: Env, to: String) -> Vec<String> {
        vec![&env, String::from_str(&env, "Hello"), to]
    }

    /// Pure fee calculation. Splits `amount` between seller and treasury using
    /// `fee_bps` (basis points; 10_000 bps == 100%).
    ///
    /// The treasury share is rounded DOWN to the smallest unit, so the seller
    /// always receives any remainder. The treasury share can therefore never
    /// exceed `amount` for valid inputs (`fee_bps <= 10_000`).
    pub fn calculate_fee(amount: i128, fee_bps: u32) -> FeeSplit {
        if amount < 0 {
            panic!("amount must be non-negative");
        }
        if (fee_bps as i128) > BPS_DENOMINATOR {
            panic!("fee_bps must not exceed 10000");
        }

        let treasury_amount = amount
            .checked_mul(fee_bps as i128)
            .expect("fee multiplication overflow")
            / BPS_DENOMINATOR;
        let seller_amount = amount - treasury_amount;

        FeeSplit {
            seller_amount,
            treasury_amount,
        }
    }

    /// Settles a single session payment: computes the split and adds the
    /// treasury portion to the cumulative treasury balance held in instance
    /// storage. Returns the resulting `FeeSplit`.
    pub fn settle_session(env: Env, amount: i128, fee_bps: u32) -> FeeSplit {
        let split = Self::calculate_fee(amount, fee_bps);
        let current: i128 = env
            .storage()
            .instance()
            .get(&TREASURY_KEY)
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&TREASURY_KEY, &(current + split.treasury_amount));
        split
    }

    /// Returns the cumulative treasury balance accumulated across all
    /// `settle_session` calls for this contract instance.
    pub fn treasury_balance(env: Env) -> i128 {
        env.storage().instance().get(&TREASURY_KEY).unwrap_or(0)
    }
}

#[cfg(test)]
mod test;
