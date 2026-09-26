use soroban_sdk::{Address, Bytes, BytesN, Env, String};

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
/// topics, or panic with `"InvalidSessionId"` if it is the wrong width.
fn event_session_id(session_id: &Bytes) -> BytesN<32> {
    session_id.clone().try_into().expect("InvalidSessionId")
}

/// Allows the buyer or seller to open a dispute on a `Completed` or
/// `Locked` session. Only the admin may resolve it afterward
/// (see [`resolve_dispute`]).
///
/// # Reverts
/// - `"session not found"` if `session_id` doesn't exist.
/// - `"Unauthorized"` if `caller` is neither the buyer nor the seller.
/// - `"InvalidSessionState"` unless the session is `Completed` or `Locked`.
/// - `"InvalidSessionId"` if `session_id` is not 32 bytes.
///
/// # Events
/// Emits `DisputeOpened` (see [`events::emit_dispute_opened`]).
///
/// # Authorization
/// `caller` must be either the session's buyer or seller, enforced by
/// `caller.require_auth()`.
pub fn open_dispute(env: &Env, session_id: Bytes, caller: Address, reason: String) {
    let mut s = session::get_session(env, &session_id);

    assert!(
        s.buyer == caller || s.seller == caller,
        "Unauthorized"
    );
    caller.require_auth();

    assert!(
        s.status == SessionStatus::Completed || s.status == SessionStatus::Locked,
        "InvalidSessionState"
    );

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
}

/// Admin resolves a dispute by splitting the escrowed amount between buyer
/// and seller. `buyer_share + seller_share` must equal the session's original
/// `amount` exactly. The platform fee (see [`crate::fee::apply_fee`]) is
/// deducted from each non-zero share before it's considered "paid out" —
/// this function returns the post-fee amounts so a caller with token-transfer
/// wiring can act on them; it does not move tokens itself (no token transfer
/// exists anywhere in this contract yet).
///
/// # Reverts
/// - `"session not found"` if `session_id` doesn't exist.
/// - `"InvalidSessionState"` unless the session is currently `Disputed`.
/// - `"InvalidShare"` if either share is negative.
/// - `"SharesMismatch"` unless `buyer_share + seller_share == session.amount`.
/// - `"InvalidSessionId"` if `session_id` is not 32 bytes.
///
/// # Events
/// Emits `DisputeResolved` (see [`events::emit_dispute_resolved`]).
///
/// # Authorization
/// Only `admin` may call this — enforced by `admin.require_auth()`.
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
) -> (i128, i128, i128) {
    admin.require_auth();

    let mut s = session::get_session(env, &session_id);

    assert!(s.status == SessionStatus::Disputed, "InvalidSessionState");
    assert!(buyer_share >= 0 && seller_share >= 0, "InvalidShare");
    assert!(buyer_share + seller_share == s.amount, "SharesMismatch");

    let event_id: BytesN<32> = event_session_id(&session_id);

    let (buyer_payout, buyer_fee) = fee::apply_fee(buyer_share, fee_bps);
    let (seller_payout, seller_fee) = fee::apply_fee(seller_share, fee_bps);
    let total_fee = buyer_fee + seller_fee;

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

    (buyer_payout, seller_payout, total_fee)
}

/// Read-only accessor, for callers/tests that need to inspect state.
pub fn get(env: &Env, session_id: Bytes) -> Session {
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

    /// Create a session in `status` and dispute it, leaving it `Disputed`.
    fn disputed_session(
        env: &Env,
        session_id: &Bytes,
        buyer: &Address,
        seller: &Address,
        amount: i128,
        status: SessionStatus,
    ) {
        session::lock_funds(env, session_id.clone(), buyer.clone(), seller.clone(), amount);
        if status == SessionStatus::Completed {
            session::complete_session(env, session_id.clone());
        }
        open_dispute(
            env,
            session_id.clone(),
            buyer.clone(),
            String::from_str(env, "reason"),
        );
    }

    #[test]
    fn buyer_can_open_dispute_on_completed_session() {
        let (env, _admin, buyer, seller, session_id) = setup();
        disputed_session(
            &env,
            &session_id,
            &buyer,
            &seller,
            1_000,
            SessionStatus::Completed,
        );

        let s = get(&env, session_id);
        assert_eq!(s.status, SessionStatus::Disputed);
        assert!(s.dispute_opened_at.is_some());
    }

    #[test]
    fn seller_can_open_dispute_on_locked_session() {
        let (env, _admin, buyer, seller, session_id) = setup();
        session::lock_funds(&env, session_id.clone(), buyer, seller.clone(), 1_000);

        open_dispute(
            &env,
            session_id.clone(),
            seller,
            String::from_str(&env, "buyer unresponsive"),
        );

        assert_eq!(get(&env, session_id).status, SessionStatus::Disputed);
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
                seller,
                1_000,
            );
            session::complete_session(&env, session_id.clone());
            open_dispute(&env, session_id.clone(), buyer.clone(), reason.clone());
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
    #[should_panic(expected = "Unauthorized")]
    fn open_dispute_rejects_non_participant() {
        let (env, _admin, buyer, seller, session_id) = setup();
        session::lock_funds(&env, session_id.clone(), buyer, seller, 1_000);
        let stranger = Address::generate(&env);

        open_dispute(&env, session_id, stranger, String::from_str(&env, "n/a"));
    }

    #[test]
    #[should_panic(expected = "InvalidSessionState")]
    fn open_dispute_rejects_already_settled_session() {
        let (env, _admin, buyer, seller, session_id) = setup();
        session::lock_funds(&env, session_id.clone(), buyer, seller, 1_000);
        session::complete_session(&env, session_id.clone());
        session::approve_session(&env, session_id.clone());

        open_dispute(
            &env,
            session_id,
            buyer,
            String::from_str(&env, "too late"),
        );
    }

    #[test]
    fn admin_resolves_split_dispute() {
        let (env, admin, buyer, seller, session_id) = setup();
        disputed_session(
            &env,
            &session_id,
            &buyer,
            &seller,
            1_000,
            SessionStatus::Locked,
        );

        let (buyer_payout, seller_payout, fee) =
            resolve_dispute(&env, session_id.clone(), admin, 600, 400, 0);

        assert_eq!(buyer_payout, 600);
        assert_eq!(seller_payout, 400);
        assert_eq!(fee, 0);
        let s = get(&env, session_id);
        assert_eq!(s.status, SessionStatus::Resolved);
        assert_eq!(s.seller_payout, 400);
    }

    #[test]
    fn admin_resolves_full_to_buyer() {
        let (env, admin, buyer, seller, session_id) = setup();
        disputed_session(
            &env,
            &session_id,
            &buyer,
            &seller,
            1_000,
            SessionStatus::Locked,
        );

        let (buyer_payout, seller_payout, _fee) =
            resolve_dispute(&env, session_id, admin, 1_000, 0, 0);

        assert_eq!(buyer_payout, 1_000);
        assert_eq!(seller_payout, 0);
    }

    #[test]
    fn resolve_dispute_emits_dispute_resolved_event() {
        let (env, admin, buyer, seller, session_id) = setup();
        let contract_id = env.register(crate::SkillSyncContract, ());
        env.ledger().set_timestamp(12_345);

        env.as_contract(&contract_id, || {
            disputed_session(
                &env,
                &session_id,
                &buyer,
                &seller,
                1_000,
                SessionStatus::Locked,
            );
            resolve_dispute(&env, session_id.clone(), admin.clone(), 600, 400, 1_000);
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
    #[should_panic(expected = "SharesMismatch")]
    fn resolve_dispute_rejects_mismatched_shares() {
        let (env, admin, buyer, seller, session_id) = setup();
        disputed_session(
            &env,
            &session_id,
            &buyer,
            &seller,
            1_000,
            SessionStatus::Locked,
        );

        resolve_dispute(&env, session_id, admin, 500, 400, 0); // 900 != 1000
    }

    #[test]
    #[should_panic(expected = "InvalidSessionState")]
    fn resolve_dispute_requires_disputed_status() {
        let (env, admin, buyer, seller, session_id) = setup();
        session::lock_funds(&env, session_id.clone(), buyer, seller, 1_000);

        resolve_dispute(&env, session_id, admin, 1_000, 0, 0);
    }
}
