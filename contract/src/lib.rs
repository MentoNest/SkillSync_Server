#![no_std]

mod admin;
mod batch;
mod dispute;
mod errors;
mod events;
mod fee;
mod metadata;
mod session;
mod storage;
mod vesting;
mod webhook;

#[cfg(test)]
mod session_modules_tests;
#[cfg(test)]
mod tests;

pub use admin::initialize;
pub use fee::{get_platform_fee, set_platform_fee};

use soroban_sdk::{contract, contractimpl, Address, Bytes, Env, String, Vec};

use errors::ContractError;

/// SkillSync escrow contract.
///
/// Provides:
/// - One-time initialization with admin and treasury addresses.
/// - Platform fee management (basis points, 0–1000).
/// - Escrow session lifecycle (lock, complete, approve, refund).
/// - Dispute opening and admin resolution.
/// - Off-chain metadata references per session.
/// - Linear vesting of a seller's payout.
/// - Batched lock/complete/approve/refund.
/// - Off-chain event relay configuration and payloads.
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
    /// session. Reverts if the ID is taken or the amount is not positive.
    pub fn lock_funds(env: Env, session_id: Bytes, buyer: Address, seller: Address, amount: i128) {
        session::lock_funds(&env, session_id, buyer, seller, amount);
    }

    /// Seller marks the session as complete, opening the dispute window.
    pub fn complete_session(env: Env, session_id: Bytes) {
        session::complete_session(&env, session_id);
    }

    /// Buyer approves a completed session, releasing funds to the seller
    /// minus the platform fee.
    pub fn approve_session(env: Env, session_id: Bytes) {
        session::approve_session(&env, session_id);
    }

    /// Allows the buyer to request a refund before the session is
    /// completed. Full amount returned, no fee deducted.
    pub fn refund_session(env: Env, session_id: Bytes) {
        session::refund_session(&env, session_id);
    }

    /// Opens a dispute on a Completed or Locked session. Callable by
    /// either the buyer or seller. See the `dispute` module.
    pub fn open_dispute(env: Env, session_id: Bytes, caller: Address, reason: String) {
        dispute::open_dispute(&env, session_id, caller, reason);
    }

    /// Admin splits the escrowed amount between buyer and seller to settle
    /// an open dispute. Returns `(buyer_payout, seller_payout, total_fee)`,
    /// each net of the platform fee.
    pub fn resolve_dispute(
        env: Env,
        session_id: Bytes,
        admin: Address,
        buyer_share: i128,
        seller_share: i128,
        fee_bps: u32,
    ) -> (i128, i128, i128) {
        dispute::resolve_dispute(
            &env,
            session_id,
            admin,
            buyer_share,
            seller_share,
            fee_bps,
        )
    }

    // ─────────────────────────────────────────────────────────────────────
    // Off-chain metadata
    // ─────────────────────────────────────────────────────────────────────

    /// Attach or replace the off-chain metadata URI for a session. Callable by
    /// the buyer or the seller.
    ///
    /// The URI is a reference — an IPFS CID or an HTTPS URL — never the
    /// document itself. Ledgers are not a document store: they are replicated
    /// to every validator, priced by state footprint, and permanent.
    ///
    /// # Errors
    /// - [`ContractError::SessionNotFound`] if the session does not exist.
    /// - [`ContractError::NotParticipant`] if `caller` is neither party.
    /// - [`ContractError::SessionNotSettled`] if the session is `Refunded`
    ///   or `Resolved`.
    /// - [`ContractError::InvalidMetadataUri`] if the URI is empty or over
    ///   256 characters.
    pub fn set_session_metadata(
        env: Env,
        session_id: Bytes,
        caller: Address,
        metadata_uri: String,
    ) -> Result<(), ContractError> {
        metadata::set_session_metadata(&env, session_id, caller, metadata_uri)
    }

    /// The metadata URI for a session, or `None` if none is set.
    pub fn get_session_metadata(env: Env, session_id: Bytes) -> Option<String> {
        metadata::get_session_metadata(&env, session_id)
    }

    /// Remove the metadata URI for a session. Callable by the buyer or seller.
    ///
    /// # Errors
    /// - [`ContractError::SessionNotFound`] if the session does not exist.
    /// - [`ContractError::NotParticipant`] if `caller` is neither party.
    /// - [`ContractError::SessionNotSettled`] if the session is `Refunded`
    ///   or `Resolved`.
    /// - [`ContractError::NoMetadata`] if no URI is currently set.
    pub fn clear_session_metadata(
        env: Env,
        session_id: Bytes,
        caller: Address,
    ) -> Result<(), ContractError> {
        metadata::clear_session_metadata(&env, session_id, caller)
    }

    // ─────────────────────────────────────────────────────────────────────
    // Vesting
    // ─────────────────────────────────────────────────────────────────────

    /// Escrow `amount` between a buyer and seller with a linear release
    /// schedule attached.
    ///
    /// Nothing is claimable during the cliff, then the seller's release
    /// unlocks linearly until fully vested at `cliff_ledgers +
    /// vesting_duration`.
    ///
    /// # Errors
    /// - [`ContractError::InvalidVestingSchedule`] if `vesting_duration` is
    ///   zero or `cliff_ledgers` exceeds it.
    /// - [`ContractError::InvalidAmount`] / [`ContractError::DuplicateSessionId`]
    ///   — as for a normal lock.
    pub fn lock_funds_with_vesting(
        env: Env,
        session_id: Bytes,
        buyer: Address,
        seller: Address,
        amount: i128,
        cliff_ledgers: u64,
        vesting_duration: u64,
    ) -> Result<(), ContractError> {
        vesting::lock_funds_with_vesting(
            &env,
            session_id,
            buyer,
            seller,
            amount,
            cliff_ledgers,
            vesting_duration,
        );
    }

    /// Claim everything vested so far on a session. Callable only by the
    /// session's seller.
    ///
    /// Claims are all-or-nothing per call rather than a caller-chosen amount:
    /// the only thing a caller can vary is *when*, and a partial-amount option
    /// would only add a way to make a mistake.
    ///
    /// # Errors
    /// - [`ContractError::NoVestingSchedule`] if the session has no schedule.
    /// - [`ContractError::NotSeller`] if `caller` is not the session's seller.
    /// - [`ContractError::NothingToClaim`] if the cliff has not passed, or
    ///   everything vested has already been claimed.
    /// - [`ContractError::SessionNotSettled`] if the session is `Refunded`
    ///   or `Resolved`.
    /// - [`ContractError::SessionInDispute`] if a dispute has already unwound
    ///   the schedule.
    pub fn claim_vested(
        env: Env,
        session_id: Bytes,
        caller: Address,
    ) -> Result<(), ContractError> {
        vesting::claim_vested(&env, session_id, caller)
    }

    /// The vesting schedule attached to a session, if any.
    pub fn get_vesting_schedule(env: Env, session_id: Bytes) -> Option<vesting::VestingSchedule> {
        vesting::get_schedule(&env, &session_id)
    }

    /// The amount still claimable on a session right now.
    ///
    /// # Errors
    /// [`ContractError::NoVestingSchedule`] if the session has no schedule,
    /// which is a different answer from "zero is claimable".
    pub fn claimable_vested(env: Env, session_id: Bytes) -> Result<i128, ContractError> {
        vesting::claimable(&env, &session_id)
    }

    /// The part of a session's escrow that has not vested yet — the amount at
    /// risk if the session is disputed.
    pub fn unvested_amount(env: Env, session_id: Bytes) -> i128 {
        match vesting::get_schedule(&env, &session_id) {
            Some(schedule) => vesting::unvested_amount(&schedule, env.ledger().sequence()),
            None => 0,
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // Event relay
    // ─────────────────────────────────────────────────────────────────────

    /// Point the deployment at an off-chain relay endpoint (admin only).
    ///
    /// This is configuration, not delivery: the contract has no network access
    /// and never makes the request. A relayer reads the event stream and posts
    /// the payloads this contract emits.
    ///
    /// # Errors
    /// - [`ContractError::NotAdmin`] if `caller` is not the admin.
    /// - [`ContractError::InvalidWebhookUrl`] if the URL is empty, over 256
    ///   characters, or does not start with `https://`.
    pub fn set_webhook(
        env: Env,
        caller: Address,
        url: String,
    ) -> Result<(), ContractError> {
        webhook::set_webhook(&env, caller, url)
    }

    /// Stop relaying to any endpoint (admin only). Escrows are unaffected.
    ///
    /// # Errors
    /// - [`ContractError::NotAdmin`] if `caller` is not the admin.
    pub fn clear_webhook(env: Env, caller: Address) -> Result<(), ContractError> {
        webhook::clear_webhook(&env, caller)
    }

    /// The configured relay endpoint, if any.
    pub fn get_webhook(env: Env) -> Option<String> {
        webhook::get_webhook(&env)
    }

    /// Whether relaying is configured.
    pub fn is_webhook_enabled(env: Env) -> bool {
        webhook::is_webhook_enabled(&env)
    }

    /// Assemble the relayer-ready payload for a session: session ID, event
    /// type, status, amount, both parties, and the metadata URI if one is set.
    ///
    /// Returns `None` for a session that does not exist, so a relayer can call
    /// this for every event it sees without special-casing stragglers.
    pub fn build_relay_payload(
        env: Env,
        session_id: Bytes,
        event_type: String,
    ) -> Option<webhook::RelayPayload> {
        webhook::build_payload(&env, session_id, event_type)
    }

    // ─────────────────────────────────────────────────────────────────────
    // Batched operations
    // ─────────────────────────────────────────────────────────────────────

    /// Escrow funds for several sessions in one transaction.
    ///
    /// Each item is `(session_id, seller, amount)`; `caller` is the buyer for
    /// all of them. The batch is atomic — if any session cannot be processed,
    /// none are.
    ///
    /// # Errors
    /// - [`ContractError::InvalidBatch`] if `sessions` is empty.
    /// - [`ContractError::BatchTooLarge`] if it holds more than 20 items.
    /// - [`ContractError::InvalidAmount`] if any amount is not positive.
    /// - [`ContractError::DuplicateInBatch`] if an ID repeats in the batch.
    /// - [`ContractError::DuplicateSessionId`] if an ID already exists.
    pub fn batch_lock_funds(
        env: Env,
        caller: Address,
        sessions: Vec<(Bytes, Address, i128)>,
    ) -> Result<(), ContractError> {
        batch::batch_lock_funds(&env, caller, sessions)
    }

    /// Approve several completed sessions in one transaction. `caller` must be
    /// the buyer of every session listed.
    ///
    /// # Errors
    /// - [`ContractError::InvalidBatch`] if `session_ids` is empty.
    /// - [`ContractError::BatchTooLarge`] if it holds more than 20 items.
    /// - [`ContractError::DuplicateInBatch`] if an ID repeats in the batch.
    pub fn batch_approve(
        env: Env,
        caller: Address,
        session_ids: Vec<Bytes>,
    ) -> Result<(), ContractError> {
        batch::batch_approve(&env, caller, session_ids)
    }

    /// Mark several sessions complete in one transaction. `caller` must be the
    /// seller of every session listed.
    ///
    /// # Errors
    /// - [`ContractError::InvalidBatch`] if `session_ids` is empty.
    /// - [`ContractError::BatchTooLarge`] if it holds more than 20 items.
    /// - [`ContractError::DuplicateInBatch`] if an ID repeats in the batch.
    pub fn batch_complete(
        env: Env,
        caller: Address,
        session_ids: Vec<Bytes>,
    ) -> Result<(), ContractError> {
        batch::batch_complete(&env, caller, session_ids)
    }

    /// Refund several locked sessions to the buyer in one transaction.
    /// `caller` must be the buyer of every session listed.
    ///
    /// # Errors
    /// - [`ContractError::InvalidBatch`] if `session_ids` is empty.
    /// - [`ContractError::BatchTooLarge`] if it holds more than 20 items.
    /// - [`ContractError::DuplicateInBatch`] if an ID repeats in the batch.
    pub fn batch_refund(
        env: Env,
        caller: Address,
        session_ids: Vec<Bytes>,
    ) -> Result<(), ContractError> {
        batch::batch_refund(&env, caller, session_ids)
    }
}
