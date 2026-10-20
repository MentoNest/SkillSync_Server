#![no_std]

mod admin;
mod config;
mod disputes;
mod errors;
mod events;
mod fees;
mod insurance;
mod lifecycle;
mod payments;
mod sessions;
mod storage;
mod types;
mod upgrade;

#[cfg(test)]
mod test_utils;

pub use disputes::{RESOLUTION_PAY_SELLER, RESOLUTION_REFUND_BUYER, RESOLUTION_SPLIT};
pub use errors::ContractError;
pub use types::{Session, SessionStatus};

use soroban_sdk::{contract, contractimpl, Address, Env};

#[contract]
pub struct SkillSyncEscrow;

#[contractimpl]
impl SkillSyncEscrow {
    /// One-time setup: records the admin and the treasury that receives fees.
    pub fn initialize(
        env: Env,
        admin: Address,
        treasury: Address,
    ) -> Result<(), ContractError> {
        admin::initialize(&env, admin, treasury)
    }
}
