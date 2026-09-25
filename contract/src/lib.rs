#![no_std]

mod errors;
mod events;
mod storage;
mod admin;
mod fee;
mod session;

#[cfg(test)]
mod tests;

pub use admin::initialize;
pub use fee::{set_platform_fee, get_platform_fee};

use soroban_sdk::{contract, contractimpl, Address, Bytes, Env};

use errors::ContractError;

/// SkillSync escrow contract.
///
/// Provides:
/// - One-time initialization with admin and treasury addresses.
/// - Platform fee management (basis points, 0–1000).
#[contract]
pub struct SkillSyncContract;

#[contractimpl]
impl SkillSyncContract {
    /// Initialize the contract. Can only be called once by the deployer.
    ///
    /// # Arguments
    /// * `admin`    - The admin address that will govern the contract.
    /// * `treasury` - The treasury address that receives platform fees.
    ///
    /// # Errors
    /// Returns [`ContractError::AlreadyInitialized`] if called more than once.
    pub fn initialize(env: Env, admin: Address, treasury: Address) -> Result<(), ContractError> {
        admin::initialize(&env, admin, treasury)
    }

    /// Set the platform fee in basis points (admin only).
    ///
    /// # Arguments
    /// * `caller`  - Must be the stored admin address.
    /// * `new_fee_bps` - Fee in basis points (0–1000, i.e. 0%–10%).
    ///
    /// # Errors
    /// - [`ContractError::Unauthorized`] if caller is not the admin.
    /// - [`ContractError::InvalidFee`] if `new_fee_bps` > 1000.
    pub fn set_platform_fee(
        env: Env,
        caller: Address,
        new_fee_bps: u32,
    ) -> Result<(), ContractError> {
        fee::set_platform_fee(&env, caller, new_fee_bps)
    }

    /// Return the current platform fee in basis points.
    pub fn get_platform_fee(env: Env) -> u32 {
        fee::get_platform_fee(&env)
    }

    /// Lock funds into a new escrow session between `buyer` and `seller`.
    /// Minimal creation path for `refund_session` — see `session` module.
    pub fn lock_funds(env: Env, session_id: Bytes, buyer: Address, seller: Address, amount: i128) {
        session::lock_funds(&env, session_id, buyer, seller, amount)
    }

    /// Buyer approves a completed session, releasing funds to the seller
    /// minus the platform fee.
    pub fn approve_session(env: Env, session_id: Bytes) {
        session::approve_session(&env, session_id)
    }

    /// Allows the buyer to request a refund before the session is
    /// completed. Full amount returned, no fee deducted.
    pub fn refund_session(env: Env, session_id: Bytes) {
        session::refund_session(&env, session_id)
    }
}
