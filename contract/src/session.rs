use soroban_sdk::{contracttype, Address, Bytes, Env};

use crate::errors::ContractError;
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
///
/// Every fallible operation returns `Result<_, ContractError>` and propagates
/// with `?`. Nothing in this module panics on bad input, so a caller (and an
/// off-chain indexer reading the reverted transaction) always learns *which*
/// rule it broke rather than a bare string.

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

/// Load a session.
///
/// # Errors
/// [`ContractError::SessionNotFound`] if no record is stored under
/// `session_id`.
pub fn get_session(env: &Env, session_id: &Bytes) -> Result<Session, ContractError> {
    env.storage()
        .persistent()
        .get(&SessionDataKey::Session(session_id.clone()))
        .ok_or(ContractError::SessionNotFound)
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
/// # Errors
/// [`ContractError::SessionNotFound`] if no record is stored under
/// `session_id`.
pub fn get(env: &Env, session_id: Bytes) -> Result<Session, ContractError> {
    get_session(env, &session_id)
}

/// Map a "wrong state for this operation" situation onto the most specific
/// error the taxonomy has, rather than one blanket `InvalidSessionState`.
///
/// A caller that retries on `InvalidSessionState` and gets it back after
/// approving a session learns nothing; getting `SessionAlreadyApproved` tells
/// it the retry will never succeed. Anything genuinely unclassified still
/// falls back to `InvalidSessionState`.
fn status_error(status: &SessionStatus, terminal: &SessionStatus) -> ContractError {
    match status {
        SessionStatus::Disputed => ContractError::SessionInDispute,
        other if other == terminal => match terminal {
            SessionStatus::Completed => ContractError::SessionAlreadyCompleted,
            SessionStatus::Approved => ContractError::SessionAlreadyApproved,
            SessionStatus::Refunded => ContractError::SessionAlreadyRefunded,
            _ => ContractError::InvalidSessionState,
        },
        _ => ContractError::InvalidSessionState,
    }
}

/// Assert that `caller` is `expected`, returning `NotBuyer` or `NotSeller`.
///
/// The role check is explicit *and* `require_auth` is still called: the
/// comparison is what produces a specific error code, and `require_auth` is
/// what actually proves the caller signed. Either alone is insufficient.
fn require_role(
    env: &Env,
    caller: &Address,
    expected: &Address,
    is_buyer: bool,
) -> Result<(), ContractError> {
    if caller != expected {
        return Err(if is_buyer {
            ContractError::NotBuyer
        } else {
            ContractError::NotSeller
        });
    }
    caller.require_auth();
    Ok(())
}

/// Escrows `amount` between `buyer` and `seller`, creating a `Locked` session.
///
/// # Errors
/// - [`ContractError::InvalidAmount`] if `amount` is not positive.
/// - [`ContractError::DuplicateSessionId`] if a session already exists under
///   `session_id`.
///
/// # Authorization
/// The `buyer` must sign, enforced by `buyer.require_auth()`.
///
/// # Events
/// Emits `FundsLocked` (see [`events::emit_funds_locked`]).
pub fn lock_funds(
    env: &Env,
    session_id: Bytes,
    buyer: Address,
    seller: Address,
    amount: i128,
) -> Result<(), ContractError> {
    if amount <= 0 {
        return Err(ContractError::InvalidAmount);
    }
    if session_exists(env, &session_id) {
        return Err(ContractError::DuplicateSessionId);
    }

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

    Ok(())
}

/// Seller marks delivery of goods/services as complete, which starts the
/// completion phase and opens the dispute window.
///
/// # Errors
/// - [`ContractError::SessionNotFound`] if `session_id` doesn't exist.
/// - [`ContractError::NotSeller`] if `caller` is not the session's seller.
/// - [`ContractError::SessionAlreadyCompleted`] if it is already `Completed`.
/// - [`ContractError::SessionInDispute`] if a dispute is open.
/// - [`ContractError::InvalidSessionState`] for any other state.
///
/// # Events
/// Emits `SessionCompleted` (see [`events::emit_session_completed`]).
pub fn complete_session(
    env: &Env,
    session_id: Bytes,
    caller: Address,
) -> Result<(), ContractError> {
    let mut session = get_session(env, &session_id)?;

    if session.status != SessionStatus::Locked {
        return Err(status_error(&session.status, &SessionStatus::Completed));
    }

    require_role(env, &caller, &session.seller, false)?;

    session.status = SessionStatus::Completed;
    session.completed_at = Some(env.ledger().sequence());
    save_session(env, session_id.clone(), &session);

    events::emit_session_completed(
        env,
        &session_id,
        &session.seller,
        session.completed_at.unwrap_or_default(),
    );

    Ok(())
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
/// # Errors
/// - [`ContractError::SessionNotFound`] if `session_id` doesn't exist.
/// - [`ContractError::NotBuyer`] if `caller` is not the session's buyer.
/// - [`ContractError::SessionAlreadyApproved`] if it is already `Approved`.
/// - [`ContractError::SessionInDispute`] if a dispute is open.
/// - [`ContractError::InvalidSessionState`] for any other state.
///
/// # Events
/// Emits `SessionApproved` (see [`events::emit_session_approved`]).
pub fn approve_session(
    env: &Env,
    session_id: Bytes,
    caller: Address,
) -> Result<(), ContractError> {
    let mut session = get_session(env, &session_id)?;

    if session.status != SessionStatus::Completed {
        return Err(status_error(&session.status, &SessionStatus::Approved));
    }

    require_role(env, &caller, &session.buyer, true)?;

    let (payout, fee_amount) = fee::apply_platform_fee(env, session.amount)?;
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

    Ok(())
}

/// Allows the buyer to request an early refund before the session is
/// completed. The full escrowed amount is returned to the buyer with no
/// fee deducted, per this issue's "no fee for early refund" requirement
/// (see `crate::fee::apply_fee`, which this simply never calls).
///
/// # Errors
/// - [`ContractError::SessionNotFound`] if `session_id` doesn't exist.
/// - [`ContractError::NotBuyer`] if `caller` is not the session's buyer.
/// - [`ContractError::SessionAlreadyRefunded`] if it is already `Refunded`.
/// - [`ContractError::SessionInDispute`] if a dispute is open.
/// - [`ContractError::InvalidSessionState`] for any other state.
///
/// # Events
/// Emits `SessionRefunded` (see [`events::emit_session_refunded`]).
pub fn refund_session(
    env: &Env,
    session_id: Bytes,
    caller: Address,
) -> Result<(), ContractError> {
    let mut session = get_session(env, &session_id)?;

    if session.status != SessionStatus::Locked {
        return Err(status_error(&session.status, &SessionStatus::Refunded));
    }

    require_role(env, &caller, &session.buyer, true)?;

    session.status = SessionStatus::Refunded;
    save_session(env, session_id.clone(), &session);

    events::emit_session_refunded(env, &session_id, &session.buyer, session.amount);

    Ok(())
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
        lock_funds(&env, session_id.clone(), buyer.clone(), seller.clone(), 1_000).unwrap();

        let session = get(&env, session_id).unwrap();
        assert_eq!(session.status, SessionStatus::Locked);
        assert_eq!(session.buyer, buyer);
        assert_eq!(session.seller, seller);
        assert_eq!(session.amount, 1_000);
        assert_eq!(session.completed_at, None);
        assert_eq!(session.dispute_opened_at, None);
    }

    #[test]
    fn lock_funds_rejects_duplicate_session_id() {
        let (env, buyer, seller, session_id) = setup();
        lock_funds(&env, session_id.clone(), buyer.clone(), seller.clone(), 1_000).unwrap();

        let err = lock_funds(&env, session_id, buyer, seller, 1_000).unwrap_err();
        assert_eq!(err, ContractError::DuplicateSessionId);
    }

    #[test]
    fn lock_funds_rejects_non_positive_amount() {
        let (env, buyer, seller, session_id) = setup();
        assert_eq!(
            lock_funds(&env, session_id.clone(), buyer.clone(), seller.clone(), 0).unwrap_err(),
            ContractError::InvalidAmount
        );
        assert_eq!(
            lock_funds(&env, session_id, buyer, seller, -1).unwrap_err(),
            ContractError::InvalidAmount
        );
    }

    #[test]
    fn every_session_accessor_reports_not_found_rather_than_panicking() {
        let env = Env::default();
        let missing = Bytes::from_slice(&env, &[9u8; 32]);
        assert_eq!(get_session(&env, &missing).unwrap_err(), ContractError::SessionNotFound);
        assert_eq!(get(&env, missing).unwrap_err(), ContractError::SessionNotFound);
    }

    #[test]
    fn refund_before_completion_returns_full_amount_no_fee() {
        let (env, buyer, seller, session_id) = setup();
        lock_funds(&env, session_id.clone(), buyer.clone(), seller.clone(), 1_000).unwrap();

        refund_session(&env, session_id.clone(), buyer).unwrap();

        let session = get(&env, session_id).unwrap();
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
        client.refund_session(&session_id, &buyer);

        let (emitter, topics, data) = env.events().all().last().unwrap();
        assert_eq!(emitter, contract_id);
        assert_eq!(
            topics,
            (symbol_short!("sess_ref"), session_id.clone()).into_val(&env)
        );
        let data: (Address, i128, u64) = data.into_val(&env);
        assert_eq!(data, (buyer, 1_000, 1_700_000_000));
    }

    #[test]
    fn refund_rejects_a_completed_session() {
        let (env, buyer, seller, session_id) = setup();
        lock_funds(&env, session_id.clone(), buyer.clone(), seller.clone(), 1_000).unwrap();
        complete_session(&env, session_id.clone(), seller).unwrap();

        assert_eq!(
            refund_session(&env, session_id, buyer).unwrap_err(),
            ContractError::SessionAlreadyCompleted
        );
    }

    #[test]
    fn refund_rejects_an_already_refunded_session() {
        let (env, buyer, seller, session_id) = setup();
        lock_funds(&env, session_id.clone(), buyer.clone(), seller.clone(), 1_000).unwrap();
        refund_session(&env, session_id.clone(), buyer.clone()).unwrap();

        assert_eq!(
            refund_session(&env, session_id, buyer).unwrap_err(),
            ContractError::SessionAlreadyRefunded
        );
    }

    #[test]
    fn refund_rejects_a_non_buyer() {
        let (env, buyer, seller, session_id) = setup();
        lock_funds(&env, session_id.clone(), buyer, seller.clone(), 1_000).unwrap();

        assert_eq!(
            refund_session(&env, session_id, seller).unwrap_err(),
            ContractError::NotBuyer
        );
    }

    #[test]
    fn complete_rejects_a_non_seller() {
        let (env, buyer, seller, session_id) = setup();
        lock_funds(&env, session_id.clone(), buyer.clone(), seller.clone(), 1_000).unwrap();

        assert_eq!(
            complete_session(&env, session_id, buyer).unwrap_err(),
            ContractError::NotSeller
        );
    }

    #[test]
    fn complete_rejects_an_already_completed_session() {
        let (env, buyer, seller, session_id) = setup();
        lock_funds(&env, session_id.clone(), buyer, seller.clone(), 1_000).unwrap();
        complete_session(&env, session_id.clone(), seller.clone()).unwrap();

        assert_eq!(
            complete_session(&env, session_id, seller).unwrap_err(),
            ContractError::SessionAlreadyCompleted
        );
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
        client.complete_session(&session_id, &seller);
        client.approve_session(&session_id, &buyer);

        let session = get(&env, session_id).unwrap();
        assert_eq!(session.status, SessionStatus::Approved);
        // gross 1_000, fee 25, so the seller nets 975.
        assert_eq!(session.seller_payout, 975);
        assert_eq!(session.platform_fee, 25);
    }

    #[test]
    fn approve_rejects_a_session_that_is_not_completed() {
        let (env, buyer, seller, session_id) = setup();
        let contract_id = env.register(SkillSyncContract, ());
        let client = SkillSyncContractClient::new(&env, &contract_id);
        client.lock_funds(&session_id, &buyer, &seller, &1_000);

        assert_eq!(
            client.try_approve_session(&session_id, &buyer).unwrap().unwrap_err(),
            ContractError::InvalidSessionState
        );
    }

    #[test]
    fn approve_rejects_a_non_buyer() {
        let (env, buyer, seller, session_id) = setup();
        let contract_id = env.register(SkillSyncContract, ());
        let client = SkillSyncContractClient::new(&env, &contract_id);
        client.lock_funds(&session_id, &buyer, &seller, &1_000);
        client.complete_session(&session_id, &seller);

        assert_eq!(
            client.try_approve_session(&session_id, &seller).unwrap().unwrap_err(),
            ContractError::NotBuyer
        );
    }
}
