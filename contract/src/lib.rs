#![no_std]

/// The `no_std` crate has no `String`/`format!` in scope, which the error
/// `Display` tests need. `std` is only linked into test builds; the contract
/// WASM itself stays `no_std`.
#[cfg(test)]
extern crate std;

mod admin;
mod dispute;
mod errors;
mod events;
mod fee;
mod oracle;
mod session;
mod storage;
mod upgrade;

#[cfg(test)]
mod tests;

pub use admin::initialize;
pub use fee::{get_platform_fee, set_platform_fee};

use soroban_sdk::{contract, contractimpl, Address, Bytes, BytesN, Env, String};

use errors::ContractError;

/// SkillSync escrow contract.
///
/// Provides:
/// - One-time initialization with admin and treasury addresses.
/// - Platform fee management (basis points, 0–1000).
/// - Escrow session lifecycle (lock, complete, approve, refund).
/// - Dispute opening and admin resolution.
/// - Admin-scheduled WASM upgrades.
/// - Price oracle reads with an admin-published fallback.
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
    /// - [`ContractError::NotAdmin`] if caller is not the admin.
    /// - [`ContractError::FeeTooHigh`] if `new_fee_bps` > 1000.
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

    /// Escrow `amount` between a buyer and seller, creating a `Locked`
    /// session.
    ///
    /// # Errors
    /// - [`ContractError::InvalidAmount`] if `amount` is not positive.
    /// - [`ContractError::DuplicateSessionId`] if the ID is taken.
    pub fn lock_funds(
        env: Env,
        session_id: Bytes,
        buyer: Address,
        seller: Address,
        amount: i128,
    ) -> Result<(), ContractError> {
        session::lock_funds(&env, session_id, buyer, seller, amount)
    }

    /// Seller marks the session as complete, opening the dispute window.
    ///
    /// # Errors
    /// - [`ContractError::SessionNotFound`] if the session does not exist.
    /// - [`ContractError::NotSeller`] if `caller` is not the session's seller.
    /// - [`ContractError::SessionAlreadyCompleted`] if already completed.
    /// - [`ContractError::SessionInDispute`] if a dispute is open.
    /// - [`ContractError::InvalidSessionState`] for any other state.
    pub fn complete_session(
        env: Env,
        session_id: Bytes,
        caller: Address,
    ) -> Result<(), ContractError> {
        session::complete_session(&env, session_id, caller)
    }

    /// Buyer approves a completed session, releasing funds to the seller
    /// minus the platform fee.
    ///
    /// # Errors
    /// - [`ContractError::SessionNotFound`] if the session does not exist.
    /// - [`ContractError::NotBuyer`] if `caller` is not the session's buyer.
    /// - [`ContractError::SessionAlreadyApproved`] if already approved.
    /// - [`ContractError::SessionInDispute`] if a dispute is open.
    /// - [`ContractError::InvalidSessionState`] for any other state.
    pub fn approve_session(
        env: Env,
        session_id: Bytes,
        caller: Address,
    ) -> Result<(), ContractError> {
        session::approve_session(&env, session_id, caller)
    }

    /// Allows the buyer to request a refund before the session is
    /// completed. Full amount returned, no fee deducted.
    ///
    /// # Errors
    /// - [`ContractError::SessionNotFound`] if the session does not exist.
    /// - [`ContractError::NotBuyer`] if `caller` is not the session's buyer.
    /// - [`ContractError::SessionAlreadyRefunded`] if already refunded.
    /// - [`ContractError::SessionInDispute`] if a dispute is open.
    /// - [`ContractError::InvalidSessionState`] for any other state.
    pub fn refund_session(
        env: Env,
        session_id: Bytes,
        caller: Address,
    ) -> Result<(), ContractError> {
        session::refund_session(&env, session_id, caller)
    }

    /// Opens a dispute on a Completed or Locked session. Callable by
    /// either the buyer or seller. See the `dispute` module.
    ///
    /// # Errors
    /// - [`ContractError::SessionNotFound`] if the session does not exist.
    /// - [`ContractError::Unauthorized`] if `caller` is not a participant.
    /// - [`ContractError::DisputeAlreadyOpen`] if a dispute is already open.
    /// - [`ContractError::InvalidSessionState`] for any other state.
    pub fn open_dispute(
        env: Env,
        session_id: Bytes,
        caller: Address,
        reason: String,
    ) -> Result<(), ContractError> {
        dispute::open_dispute(&env, session_id, caller, reason)
    }

    /// Stage `new_hash` as the WASM to upgrade to on the next
    /// [`execute_upgrade`] call (admin only).
    ///
    /// # Errors
    /// - [`ContractError::NotAdmin`] if caller is not the admin.
    /// - [`ContractError::InvalidWasmHash`] if `new_hash` is all zeroes.
    pub fn stage_upgrade(
        env: Env,
        caller: Address,
        new_hash: BytesN<32>,
    ) -> Result<(), ContractError> {
        upgrade::stage_upgrade(&env, caller, new_hash)
    }

    /// Apply the hash staged by [`stage_upgrade`] to the running contract
    /// (admin only).
    ///
    /// # Errors
    /// - [`ContractError::NotAdmin`] if caller is not the admin.
    /// - [`ContractError::InvalidWasmHash`] if no hash has been staged.
    /// - [`ContractError::UpgradeFailed`] if the deployer rejects the upgrade.
    pub fn execute_upgrade(env: Env, caller: Address) -> Result<(), ContractError> {
        upgrade::execute_upgrade(&env, caller)
    }

    /// The WASM hash staged for the next upgrade, if any.
    pub fn get_staged_wasm_hash(env: Env) -> Option<BytesN<32>> {
        upgrade::get_staged_wasm_hash(&env)
    }

    /// Discard any staged WASM hash (admin only).
    ///
    /// # Errors
    /// - [`ContractError::NotAdmin`] if caller is not the admin.
    pub fn cancel_upgrade(env: Env, caller: Address) -> Result<(), ContractError> {
        upgrade::cancel_upgrade(&env, caller)
    }

    /// Point the contract at an oracle contract to read prices from
    /// (admin only).
    ///
    /// # Errors
    /// - [`ContractError::NotAdmin`] if caller is not the admin.
    pub fn set_oracle(env: Env, caller: Address, oracle_id: Address) -> Result<(), ContractError> {
        oracle::set_oracle(&env, caller, oracle_id)
    }

    /// Stop reading prices from an oracle (admin only).
    ///
    /// # Errors
    /// - [`ContractError::NotAdmin`] if caller is not the admin.
    pub fn clear_oracle(env: Env, caller: Address) -> Result<(), ContractError> {
        oracle::clear_oracle(&env, caller)
    }

    /// The configured oracle, if any.
    pub fn get_oracle(env: Env) -> Option<Address> {
        oracle::get_oracle(&env)
    }

    /// Publish an admin fallback price for `asset`, used whenever the oracle
    /// is unset, unreachable, or too stale to trust (admin only).
    ///
    /// # Errors
    /// - [`ContractError::NotAdmin`] if caller is not the admin.
    /// - [`ContractError::InvalidAmount`] if `price` is not positive.
    pub fn set_admin_price(
        env: Env,
        caller: Address,
        asset: BytesN<32>,
        price: i128,
    ) -> Result<(), ContractError> {
        oracle::set_admin_price(&env, caller, asset, price)
    }

    /// Remove the admin fallback price for `asset` (admin only).
    ///
    /// # Errors
    /// - [`ContractError::NotAdmin`] if caller is not the admin.
    pub fn clear_admin_price(
        env: Env,
        caller: Address,
        asset: BytesN<32>,
    ) -> Result<(), ContractError> {
        oracle::clear_admin_price(&env, caller, asset)
    }

    /// The admin fallback price for `asset`, if one is published.
    pub fn get_admin_price(env: Env, asset: BytesN<32>) -> Option<oracle::AdminPrice> {
        oracle::get_admin_price(&env, asset)
    }

    /// The price of one whole unit of `asset`, from the oracle when it is
    /// reachable and fresh enough, otherwise from the admin fallback.
    ///
    /// # Errors
    /// [`ContractError::PriceUnavailable`] when neither source has a usable
    /// price.
    pub fn get_price(env: Env, asset: BytesN<32>) -> Result<i128, ContractError> {
        oracle::get_price(&env, asset)
    }

    /// Convert `base_amount` of the settlement asset into `asset` units at
    /// the current price.
    ///
    /// # Errors
    /// - [`ContractError::InvalidAmount`] for a non-positive amount or price.
    /// - [`ContractError::PriceUnavailable`] when no usable price exists.
    /// - [`ContractError::Overflow`] if the multiplication overflows.
    pub fn quote(env: Env, asset: BytesN<32>, base_amount: i128) -> Result<i128, ContractError> {
        oracle::quote(&env, asset, base_amount)
    }

    /// Admin splits the escrowed amount between buyer and seller to settle
    /// an open dispute. Returns `(buyer_payout, seller_payout, total_fee)`,
    /// each net of the platform fee.
    ///
    /// # Errors
    /// - [`ContractError::SessionNotFound`] if the session does not exist.
    /// - [`ContractError::DisputeNotOpen`] if no dispute is open.
    /// - [`ContractError::InvalidSplit`] if the shares are negative or do not
    ///   sum to the session amount.
    /// - [`ContractError::FeeTooHigh`] if `fee_bps` exceeds 1000.
    /// - [`ContractError::Overflow`] if the split or fee arithmetic overflows.
    pub fn resolve_dispute(
        env: Env,
        session_id: Bytes,
        admin: Address,
        buyer_share: i128,
        seller_share: i128,
        fee_bps: u32,
    ) -> Result<(i128, i128, i128), ContractError> {
        dispute::resolve_dispute(
            &env,
            session_id,
            admin,
            buyer_share,
            seller_share,
            fee_bps,
        )
    }
}
