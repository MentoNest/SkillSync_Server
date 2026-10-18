#![no_std]

mod admin;
mod errors;
mod events;
mod payments;
mod storage;
mod types;
mod config;

#[cfg(test)]
mod test_utils;

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
