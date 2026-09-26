use soroban_sdk::{contracttype, Address, Bytes, Env};

use crate::events;
use crate::fee;
use crate::storage;

/// Escrow session lifecycle.
///
/// This module owns the canonical `Session` record and the storage key space
/// every other session-aware module (`dispute`, and the batch/vesting/token
/// modules layered on top of it) reads and writes. There is exactly one
/// session type in the contract: modules must not declare private copies of
/// it, or they will drift from the record the escrow paths actually settle.

/// Lifecycle states of an escrow session.
///
/// `Disputed` and `Resolved` bracket the dispute flow; the happy path is
/// `Locked` -> `Completed` -> `Approved`, with `Refunded` reachable from
/// `Locked` (early refund) or after an auto-refund.
#[contracttype]
#[derive(Clone, PartialEq, Debug)]
pub enum SessionStatus {
    /// Funds escrowed, work not yet delivered.
    Locked,
    /// Seller delivered; buyer may approve or the dispute window may run out.
    Completed,
    /// A dispute is open; settlement is blocked pending resolution.
    Disputed,
    /// Buyer approved; funds moved to the seller net of the platform fee.
    Approved,
    /// Escrow returned to the buyer.
    Refunded,
    /// A dispute was resolved by the admin; `seller_payout`/`platform_fee`
    /// hold the final split.
    Resolved,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct Session {
    pub buyer: Address,
    pub seller: Address,
    pub amount: i128,
    pub status: SessionStatus,
    pub created_at: u64,
    pub completed_at: Option<u64>,
    pub dispute_opened_at: Option<u64>,
    pub seller_payout: i128,
    pub platform_fee: i128,
}

/// Persistent storage keys for a session record.
///
/// Public so that sibling modules address the *same* records rather than
/// shadowing them under a private key type.
#[contracttype]
#[derive(Clone)]
pub enum SessionDataKey {
    Session(Bytes),
}

/// Load a session, or panic with `"session not found"` if it does not exist.
///
/// # Panics
/// Panics if no record is stored under `session_id`.
pub /// Load a session, or panic with `"session not found"` if it does not exist.
///
/// # Panics
/// Panics if no record is stored under `session_id`.
pub fn get_session(env: &Env, session_id: &Bytes) -> Session {
    try_get_session(env, session_id).expect("session not found")
}

/// Load a session if it exists.
///
/// The fallible counterpart to [`get_session`], for modules that want to
/// report a missing session as an error rather than aborting. Both live here
/// so that there is still exactly one place that knows how a session is keyed.
pub fn try_get_session(env: &Env, session_id: &Bytes) -> Option<Session> {
    env.storage()
        .persistent()
        .get(&SessionDataKey::Session(session_id.clone()))
}

/// Persist a session record.
pub fn save_session(env: &Env, session_id: Bytes, session: &Session) {
    env.storage()
        .persistent()
        .set(&SessionDataKey::Session(session_id), session);
}

/// Whether a session record exists for `session_id`.
pub fn session_exists(env: &Env, session_id: &Bytes) -> bool {
    env.storage()
        .persistent()
        .has(&SessionDataKey::Session(session_id.clone()))
}

/// Read-only accessor for a session, for callers/tests that need to inspect
/// state without going through a mutating entry point.
///
/// # Panics
/// Panics if no record is stored under `session_id`.
pub fn get(env: &Env, session_id: Bytes) -> Session {
    get_session(env, &session_id)
}

/// Escrows `amount` between `buyer` and `seller`, creating a `Locked` session.
///
/// Reverts if `amount` is not positive or a session already exists under
/// `session_id`.
///
/// # Authorization
/// The `buyer` must sign, enforced by `buyer.require_auth()`.
///
/// # Events
/// Emits `FundsLocked` (see [`events::emit_funds_locked`]).
pub fn lock_funds(env: &Env, session_id: Bytes, buyer: Address, seller: Address, amount: i128) {
    assert!(amount > 0, "amount must be > 0");
    assert!(
        !session_exists(env, &session_id),
        "DuplicateSessionId"
    );

    buyer.require_auth();

    let session = Session {
        buyer,
        seller,
        amount,
        status: SessionStatus::Locked,
        created_at: env.ledger().sequence(),
        completed_at: None,
        dispute_opened_at: None,
        seller_payout: 0,
        platform_fee: 0,
    };
    save_session(env, session_id.clone(), &session);

    events::emit_funds_locked(env, &session_id, &session.buyer, &session.seller, amount);
}

/// Seller marks delivery of goods/services as complete, which starts the
/// completion phase and opens the dispute window.
///
/// # Reverts
/// - `"session not found"` if `session_id` doesn't exist.
/// - `"InvalidSessionState"` unless the session is currently `Locked`
///   (i.e. it reverts if already `Completed`, `Approved`, or `Refunded`).
///
/// # Events
/// Emits `SessionCompleted` (see [`events::emit_session_completed`]).
///
/// # Authorization
/// Only the session's stored `seller` can call this, enforced by
/// `seller.require_auth()`.
pub fn complete_session(env: &Env, session_id: Bytes) {
    let mut session = get_session(env, &session_id);

    assert!(
        session.status == SessionStatus::Locked,
        "InvalidSessionState"
    );

    session.seller.require_auth();

    session.status = SessionStatus::Completed;
    session.completed_at = Some(env.ledger().sequence());
    save_session(env, session_id.clone(), &session);

    events::emit_session_completed(
        env,
        &session_id,
        &session.seller,
        session.completed_at.unwrap_or_default(),
    );
}

/// Buyer approves a completed session, which settles it in the seller's
/// favour: the seller receives the escrowed amount minus the platform fee,
/// and the fee is routed to the treasury.
///
/// The fee split is computed with [`crate::fee::apply_platform_fee`] and
/// recorded on the session. No tokens are moved here — the contract has no
/// token transfer wired up yet — so the payout and fee are stored and emitted
/// for the settlement layer to act on, and the treasury is reported in the
/// event as the intended fee destination.
///
/// # Reverts
/// - `"session not found"` if `session_id` doesn't exist.
/// - `"InvalidSessionState"` unless the session is currently `Completed`.
///
/// # Events
/// Emits `SessionApproved` (see [`events::emit_session_approved`]).
///
/// # Authorization
/// Only the session's stored `buyer` can call this, enforced by
/// `buyer.require_auth()`.
pub fn approve_session(env: &Env, session_id: Bytes) {
    let mut session = get_session(env, &session_id);

    assert!(
        session.status == SessionStatus::Completed,
        "InvalidSessionState"
    );

    session.buyer.require_auth();

    let (payout, fee_amount) = fee::apply_platform_fee(env, session.amount);
    let treasury = storage::get_treasury(env);

    session.seller_payout = payout;
    session.platform_fee = fee_amount;
    session.status = SessionStatus::Approved;
    save_session(env, session_id.clone(), &session);

    events::emit_session_approved(
        env,
        &session_id,
        &session.seller,
        payout,
        fee_amount,
        treasury,
    );
}

/// Allows the buyer to request an early refund before the session is
/// completed. The full escrowed amount is returned to the buyer with no
/// fee deducted, per this issue's "no fee for early refund" requirement
/// (see `crate::fee::apply_fee`, which this simply never calls).
///
/// # Reverts
/// - `"session not found"` if `session_id` doesn't exist.
/// - `"InvalidSessionState"` unless the session is currently `Locked`
///   (i.e. it reverts if already `Completed`, `Approved`, or `Refunded`).
///
/// # Events
/// Emits `SessionRefunded` (see [`events::emit_session_refunded`]).
///
/// # Authorization
/// Only the session's stored `buyer` can call this — enforced by
/// `buyer.require_auth()`, which fails unless the transaction carries a
/// valid auth entry for that specific address.
pub fn refund_session(env: &Env, session_id: Bytes) {
    let mut session = get_session(env, &session_id);

    assert!(session.status == SessionStatus::Locked, "InvalidSessionState");

    session.buyer.require_auth();

    session.status = SessionStatus::Refunded;
    save_session(env, session_id.clone(), &session);

    events::emit_session_refunded(env, &session_id, &session.buyer, session.amount);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{SkillSyncContract, SkillSyncContractClient};
    use soroban_sdk::testutils::{Address as _, Events, Ledger};
    use soroban_sdk::{symbol_short, IntoVal};

    fn setup() -> (Env, Address, Address, Bytes) {
        let env = Env::default();
        env.mock_all_auths();
        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        let session_id = Bytes::from_slice(&env, &[1u8; 32]);
        (env, buyer, seller, session_id)
    }

    #[test]
    fn lock_funds_creates_a_locked_session() {
        let (env, buyer, seller, session_id) = setup();
        lock_funds(&env, session_id.clone(), buyer.clone(), seller.clone(), 1_000);

        let session = get(&env, session_id);
        assert_eq!(session.status, SessionStatus::Locked);
        assert_eq!(session.buyer, buyer);
        assert_eq!(session.seller, seller);
        assert_eq!(session.amount, 1_000);
        assert_eq!(session.completed_at, None);
        assert_eq!(session.dispute_opened_at, None);
    }

    #[test]
    #[should_panic(expected = "DuplicateSessionId")]
    fn lock_funds_rejects_duplicate_session_id() {
        let (env, buyer, seller, session_id) = setup();
        lock_funds(&env, session_id.clone(), buyer.clone(), seller.clone(), 1_000);
        lock_funds(&env, session_id, buyer, seller, 1_000);
    }

    #[test]
    #[should_panic(expected = "amount must be > 0")]
    fn lock_funds_rejects_non_positive_amount() {
        let (env, buyer, seller, session_id) = setup();
        lock_funds(&env, session_id, buyer, seller, 0);
    }

    #[test]
    fn refund_before_completion_returns_full_amount_no_fee() {
        let (env, buyer, seller, session_id) = setup();
        lock_funds(&env, session_id.clone(), buyer.clone(), seller, 1_000);

        refund_session(&env, session_id.clone());

        let session = get(&env, session_id);
        assert_eq!(session.status, SessionStatus::Refunded);
        assert_eq!(session.amount, 1_000); // full amount, no fee deducted
    }

    #[test]
    fn refund_emits_session_refunded_event() {
        let (env, buyer, seller, session_id) = setup();
        env.ledger().set_timestamp(1_700_000_000);
        let contract_id = env.register(SkillSyncContract, ());
        let client = SkillSyncContractClient::new(&env, &contract_id);
        client.lock_funds(&session_id, &buyer, &seller, &1_000);

        client.refund_session(&session_id);

        let events = env.events().all();
        let (emitter, topics, data) = events.last().unwrap();
        assert_eq!(emitter, contract_id);
        assert_eq!(
            topics,
            (symbol_short!("sess_ref"), session_id.clone()).into_val(&env)
        );
        let data: (Address, i128, u64) = data.into_val(&env);
        assert_eq!(data, (buyer, 1_000, 1_700_000_000));
    }

    #[test]
    #[should_panic(expected = "InvalidSessionState")]
    fn refund_reverts_if_already_completed() {
        let (env, buyer, seller, session_id) = setup();
        lock_funds(&env, session_id.clone(), buyer, seller, 1_000);

        complete_session(&env, session_id.clone());
        refund_session(&env, session_id);
    }

    #[test]
    #[should_panic(expected = "InvalidSessionState")]
    fn refund_reverts_if_already_approved() {
        let (env, buyer, seller, session_id) = setup();
        lock_funds(&env, session_id.clone(), buyer, seller, 1_000);

        complete_session(&env, session_id.clone());
        approve_session(&env, session_id.clone());
        refund_session(&env, session_id);
    }

    #[test]
    #[should_panic(expected = "session not found")]
    fn refund_reverts_if_session_missing() {
        let env = Env::default();
        env.mock_all_auths();
        refund_session(&env, Bytes::from_slice(&env, &[9u8; 32]));
    }

    #[test]
    fn approve_session_splits_payout_and_fee() {
        let (env, buyer, seller, session_id) = setup();
        let contract_id = env.register(SkillSyncContract, ());
        let client = SkillSyncContractClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin, &Address::generate(&env));
        client.set_platform_fee(&admin, &250); // 2.5%

        client.lock_funds(&session_id, &buyer, &seller, &1_000);
        client.complete_session(&session_id);
        client.approve_session(&session_id);

        let session = get(&env, session_id);
        assert_eq!(session.status, SessionStatus::Approved);
        // gross 1_000, fee 25, so the seller nets 975.
        assert_eq!(session.seller_payout, 975);
        assert_eq!(session.platform_fee, 25);
    }

    #[test]
    #[should_panic]
    fn approve_session_reverts_if_not_completed() {
        let (env, buyer, seller, session_id) = setup();
        let contract_id = env.register(SkillSyncContract, ());
        let client = SkillSyncContractClient::new(&env, &contract_id);
        client.lock_funds(&session_id, &buyer, &seller, &1_000);

        client.approve_session(&session_id);
    }
}
