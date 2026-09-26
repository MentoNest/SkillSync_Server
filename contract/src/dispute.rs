use soroban_sdk::{Address, Bytes, BytesN, Env, String};

use crate::errors::ContractError;
use crate::events;
use crate::fee;
use crate::session::{self, Session, SessionStatus};

/// Dispute open/resolve logic.
///
/// Disputes operate on the *canonical* [`session::Session`] record rather
/// than a private copy: a session that is `Disputed` here is the same record
/// that `lock_funds`/`complete_session`/`approve_session` created, so
/// "is this session disputed?" is answerable from one source of truth.

/// Reinterpret an arbitrary-length session id as the 32-byte id used in event
/// topics.
///
/// Panics with `"InvalidSessionId"` if the id is the wrong width. A malformed
/// id cannot be expressed as one of the session-band error codes, and no
/// caller can recover from it by retrying with different arguments, so it
/// fails loudly rather than being folded into a `Result` a client would
/// happily retry forever.
fn event_session_id(session_id: &Bytes) -> BytesN<32> {
    session_id.clone().try_into().expect("InvalidSessionId")
}

/// Allows the buyer or seller to open a dispute on a `Completed` or
/// `Locked` session. Only the admin may resolve it afterward
/// (see [`resolve_dispute`]).
///
/// # Errors
/// - [`ContractError::SessionNotFound`] if `session_id` doesn't exist.
/// - [`ContractError::Unauthorized`] if `caller` is neither the buyer nor the
///   seller. A stranger to the session is not a wrong-role buyer or seller,
///   so this is the generic code rather than `NotBuyer`/`NotSeller`.
/// - [`ContractError::DisputeAlreadyOpen`] if the session is already
///   `Disputed`.
/// - [`ContractError::InvalidSessionState`] for any other state (already
///   approved, refunded, or resolved).
/// - Panics with `"InvalidSessionId"` if `session_id` is not 32 bytes.
///
/// # Events
/// Emits `DisputeOpened` (see [`events::emit_dispute_opened`]).
pub fn open_dispute(
    env: &Env,
    session_id: Bytes,
    caller: Address,
    reason: String,
) -> Result<(), ContractError> {
    let mut s = session::get_session(env, &session_id)?;

    if caller != s.buyer && caller != s.seller {
        return Err(ContractError::Unauthorized);
    }
    caller.require_auth();

    match s.status {
        SessionStatus::Completed | SessionStatus::Locked => {}
        SessionStatus::Disputed => return Err(ContractError::DisputeAlreadyOpen),
        _ => return Err(ContractError::InvalidSessionState),
    }

    let event_id: BytesN<32> = event_session_id(&session_id);

    s.status = SessionStatus::Disputed;
    s.dispute_opened_at = Some(env.ledger().sequence());
    session::save_session(env, session_id, &s);

    events::emit_dispute_opened(
        env,
        &event_id,
        &caller,
        &reason,
        env.ledger().timestamp(),
    );

    Ok(())
}

/// Admin resolves a dispute by splitting the escrowed amount between buyer
/// and seller. `buyer_share + seller_share` must equal the session's original
/// `amount` exactly. The platform fee (see [`crate::fee::apply_fee`]) is
/// deducted from each non-zero share before it's considered "paid out" —
/// this function returns the post-fee amounts so a caller with token-transfer
/// wiring can act on them; it does not move tokens itself (no token transfer
/// exists anywhere in this contract yet).
///
/// # Errors
/// - [`ContractError::SessionNotFound`] if `session_id` doesn't exist.
/// - [`ContractError::DisputeNotOpen`] if no dispute is open, or it has
///   already been resolved. Both cases mean "there is nothing to settle".
/// - [`ContractError::InvalidSplit`] if either share is negative, or unless
///   `buyer_share + seller_share == session.amount`.
/// - [`ContractError::Overflow`] if the split or the fee arithmetic overflows.
/// - Panics with `"InvalidSessionId"` if `session_id` is not 32 bytes.
///
/// # Events
/// Emits `DisputeResolved` (see [`events::emit_dispute_resolved`]).
///
/// # Authorization
/// Only `admin` may call this — enforced by `admin.require_auth()`. The
/// argument is taken as the admin; the caller is whoever signs.
///
/// # Returns
/// `(buyer_payout_after_fee, seller_payout_after_fee, total_fee)`.
pub fn resolve_dispute(
    env: &Env,
    session_id: Bytes,
    admin: Address,
    buyer_share: i128,
    seller_share: i128,
    fee_bps: u32,
) -> Result<(i128, i128, i128), ContractError> {
    admin.require_auth();

    let mut s = session::get_session(env, &session_id)?;

    if s.status != SessionStatus::Disputed {
        return Err(ContractError::DisputeNotOpen);
    }

    if buyer_share < 0 || seller_share < 0 {
        return Err(ContractError::InvalidSplit);
    }

    // `checked_add` rather than `+`: a split that overflows would otherwise
    // wrap to a negative total and be compared against `s.amount`, producing
    // a confusing InvalidSplit on what is really an arithmetic overflow.
    let total = buyer_share
        .checked_add(seller_share)
        .ok_or(ContractError::Overflow)?;
    if total != s.amount {
        return Err(ContractError::InvalidSplit);
    }

    let event_id: BytesN<32> = event_session_id(&session_id);

    let (buyer_payout, buyer_fee) = fee::apply_fee(buyer_share, fee_bps)?;
    let (seller_payout, seller_fee) = fee::apply_fee(seller_share, fee_bps)?;
    let total_fee = buyer_fee
        .checked_add(seller_fee)
        .ok_or(ContractError::Overflow)?;

    s.status = SessionStatus::Resolved;
    s.seller_payout = seller_payout;
    s.platform_fee = total_fee;
    session::save_session(env, session_id, &s);

    events::emit_dispute_resolved(
        env,
        &event_id,
        &admin,
        buyer_payout,
        seller_payout,
        total_fee,
        env.ledger().timestamp(),
    );

    Ok((buyer_payout, seller_payout, total_fee))
}

/// Read-only accessor, for callers/tests that need to inspect state.
///
/// # Errors
/// [`ContractError::SessionNotFound`] if `session_id` doesn't exist.
pub fn get(env: &Env, session_id: Bytes) -> Result<Session, ContractError> {
    session::get_session(env, &session_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::{Address as _, Events, Ledger};
    use soroban_sdk::{symbol_short, IntoVal};

    fn setup() -> (Env, Address, Address, Address, Bytes) {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        let session_id = Bytes::from_slice(&env, &[1u8; 32]);
        (env, admin, buyer, seller, session_id)
    }

    /// Create a session, optionally complete it, then dispute it, leaving it
    /// in `Disputed`.
    fn disputed_session(
        env: &Env,
        session_id: &Bytes,
        buyer: &Address,
        seller: &Address,
        amount: i128,
        complete: bool,
    ) {
        session::lock_funds(env, session_id.clone(), buyer.clone(), seller.clone(), amount).unwrap();
        if complete {
            session::complete_session(env, session_id.clone(), seller.clone()).unwrap();
        }
        open_dispute(
            env,
            session_id.clone(),
            buyer.clone(),
            String::from_str(env, "reason"),
        )
        .unwrap();
    }

    #[test]
    fn buyer_can_open_dispute_on_completed_session() {
        let (env, _admin, buyer, seller, session_id) = setup();
        disputed_session(&env, &session_id, &buyer, &seller, 1_000, true);

        let s = get(&env, session_id).unwrap();
        assert_eq!(s.status, SessionStatus::Disputed);
        assert!(s.dispute_opened_at.is_some());
    }

    #[test]
    fn seller_can_open_dispute_on_locked_session() {
        let (env, _admin, buyer, seller, session_id) = setup();
        session::lock_funds(&env, session_id.clone(), buyer, seller.clone(), 1_000).unwrap();

        open_dispute(
            &env,
            session_id.clone(),
            seller,
            String::from_str(&env, "buyer unresponsive"),
        )
        .unwrap();

        assert_eq!(get(&env, session_id).unwrap().status, SessionStatus::Disputed);
    }

    #[test]
    fn open_dispute_emits_dispute_opened_event() {
        let (env, _admin, buyer, seller, session_id) = setup();
        let contract_id = env.register(crate::SkillSyncContract, ());
        env.ledger().set_timestamp(12_345);
        let reason = String::from_str(&env, "not delivered");

        env.as_contract(&contract_id, || {
            session::lock_funds(
                &env,
                session_id.clone(),
                buyer.clone(),
                seller.clone(),
                1_000,
            )
            .unwrap();
            session::complete_session(&env, session_id.clone(), seller).unwrap();
            open_dispute(&env, session_id.clone(), buyer.clone(), reason.clone()).unwrap();
        });

        let (emitter, topics, data) = env.events().all().last().unwrap();
        assert_eq!(emitter, contract_id);
        let expected_id: BytesN<32> = session_id.try_into().unwrap();
        assert_eq!(
            topics,
            (symbol_short!("dis_open"), expected_id).into_val(&env)
        );
        let data: (Address, String, u64) = data.into_val(&env);
        assert_eq!(data, (buyer, reason, 12_345));
    }

    #[test]
    fn open_dispute_rejects_non_participant() {
        let (env, _admin, buyer, seller, session_id) = setup();
        session::lock_funds(&env, session_id.clone(), buyer, seller, 1_000).unwrap();
        let stranger = Address::generate(&env);

        assert_eq!(
            open_dispute(&env, session_id, stranger, String::from_str(&env, "n/a")).unwrap_err(),
            ContractError::Unauthorized
        );
    }

    #[test]
    fn open_dispute_reports_a_second_dispute_as_already_open() {
        let (env, _admin, buyer, seller, session_id) = setup();
        disputed_session(&env, &session_id, &buyer, &seller, 1_000, false);

        assert_eq!(
            open_dispute(
                &env,
                session_id,
                seller,
                String::from_str(&env, "again")
            )
            .unwrap_err(),
            ContractError::DisputeAlreadyOpen
        );
    }

    #[test]
    fn open_dispute_rejects_already_settled_session() {
        let (env, _admin, buyer, seller, session_id) = setup();
        session::lock_funds(&env, session_id.clone(), buyer.clone(), seller.clone(), 1_000).unwrap();
        session::complete_session(&env, session_id.clone(), seller).unwrap();
        session::approve_session(&env, session_id.clone(), buyer.clone()).unwrap();

        assert_eq!(
            open_dispute(&env, session_id, buyer, String::from_str(&env, "too late")).unwrap_err(),
            ContractError::InvalidSessionState
        );
    }

    #[test]
    fn open_dispute_on_a_missing_session_reports_not_found() {
        let env = Env::default();
        let missing = Bytes::from_slice(&env, &[7u8; 32]);
        let caller = Address::generate(&env);

        assert_eq!(
            open_dispute(&env, missing, caller, String::from_str(&env, "hi")).unwrap_err(),
            ContractError::SessionNotFound
        );
    }

    #[test]
    fn admin_resolves_split_dispute() {
        let (env, admin, buyer, seller, session_id) = setup();
        disputed_session(&env, &session_id, &buyer, &seller, 1_000, false);

        let (buyer_payout, seller_payout, fee) =
            resolve_dispute(&env, session_id.clone(), admin, 600, 400, 0).unwrap();

        assert_eq!(buyer_payout, 600);
        assert_eq!(seller_payout, 400);
        assert_eq!(fee, 0);
        let s = get(&env, session_id).unwrap();
        assert_eq!(s.status, SessionStatus::Resolved);
        assert_eq!(s.seller_payout, 400);
    }

    #[test]
    fn admin_resolves_full_to_buyer() {
        let (env, admin, buyer, seller, session_id) = setup();
        disputed_session(&env, &session_id, &buyer, &seller, 1_000, false);

        let (buyer_payout, seller_payout, _fee) =
            resolve_dispute(&env, session_id, admin, 1_000, 0, 0).unwrap();

        assert_eq!(buyer_payout, 1_000);
        assert_eq!(seller_payout, 0);
    }

    #[test]
    fn resolve_dispute_emits_dispute_resolved_event() {
        let (env, admin, buyer, seller, session_id) = setup();
        let contract_id = env.register(crate::SkillSyncContract, ());
        env.ledger().set_timestamp(12_345);

        env.as_contract(&contract_id, || {
            disputed_session(&env, &session_id, &buyer, &seller, 1_000, false);
            resolve_dispute(&env, session_id.clone(), admin.clone(), 600, 400, 1_000).unwrap();
        });

        let (emitter, topics, data) = env.events().all().last().unwrap();
        assert_eq!(emitter, contract_id);
        let expected_id: BytesN<32> = session_id.try_into().unwrap();
        assert_eq!(
            topics,
            (symbol_short!("dis_res"), expected_id).into_val(&env)
        );
        let data: (Address, i128, i128, i128, u64) = data.into_val(&env);
        assert_eq!(data, (admin, 540, 360, 100, 12_345));
    }

    #[test]
    fn resolve_dispute_rejects_mismatched_shares() {
        let (env, admin, buyer, seller, session_id) = setup();
        disputed_session(&env, &session_id, &buyer, &seller, 1_000, false);

        assert_eq!(
            resolve_dispute(&env, session_id, admin, 500, 400, 0).unwrap_err(), // 900 != 1000
            ContractError::InvalidSplit
        );
    }

    #[test]
    fn resolve_dispute_rejects_negative_share() {
        let (env, admin, buyer, seller, session_id) = setup();
        disputed_session(&env, &session_id, &buyer, &seller, 1_000, false);

        // A negative share that still sums to the amount would otherwise let
        // an admin mint a payout out of thin air.
        assert_eq!(
            resolve_dispute(&env, session_id, admin, 1_100, -100, 0).unwrap_err(),
            ContractError::InvalidSplit
        );
    }

    #[test]
    fn resolve_dispute_rejects_an_overflowing_split() {
        let (env, admin, buyer, seller, session_id) = setup();
        disputed_session(&env, &session_id, &buyer, &seller, 1_000, false);

        // i128::MAX + 1 wraps negative; `checked_add` turns that into a typed
        // Overflow instead of a confusing InvalidSplit.
        assert_eq!(
            resolve_dispute(&env, session_id, admin, i128::MAX, 1, 0).unwrap_err(),
            ContractError::Overflow
        );
    }

    #[test]
    fn resolve_dispute_requires_an_open_dispute() {
        let (env, admin, buyer, seller, session_id) = setup();
        session::lock_funds(&env, session_id.clone(), buyer, seller, 1_000).unwrap();

        assert_eq!(
            resolve_dispute(&env, session_id.clone(), admin.clone(), 1_000, 0, 0).unwrap_err(),
            ContractError::DisputeNotOpen
        );

        // ...and it stays un-resolvable once it has been resolved.
        disputed_session(&env, &session_id, &buyer, &seller, 1_000, false);
        resolve_dispute(&env, session_id.clone(), admin.clone(), 1_000, 0, 0).unwrap();
        assert_eq!(
            resolve_dispute(&env, session_id, admin, 1_000, 0, 0).unwrap_err(),
            ContractError::DisputeNotOpen
        );
    }

    #[test]
    fn resolve_dispute_propagates_a_fee_above_the_maximum() {
        let (env, admin, buyer, seller, session_id) = setup();
        disputed_session(&env, &session_id, &buyer, &seller, 1_000, false);

        assert_eq!(
            resolve_dispute(&env, session_id, admin, 1_000, 0, 1_001).unwrap_err(),
            ContractError::FeeTooHigh
        );
    }
}
