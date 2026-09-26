use soroban_sdk::{contracttype, symbol_short, Address, Bytes, BytesN, Env, String};

use crate::{events, fee};

/// Dispute open/resolve logic (BE dispute open + resolve functions).
///
/// This module owns its own storage key space (`DisputeDataKey`) and
/// session-status type, independent of the broader escrow session module
/// (lock_funds/refund_session), since that module lives in a separate,
/// concurrently-developed file. `open_session_for_dispute` here is the
/// minimal creation path needed to make `open_dispute`/`resolve_dispute`
/// real and testable; once the escrow session module and this one are
/// merged, they should converge on a single shared `Session` type.

#[contracttype]
#[derive(Clone, PartialEq, Debug)]
pub enum DisputeSessionStatus {
    Locked,
    Completed,
    Disputed,
    Resolved,
}

#[contracttype]
#[derive(Clone)]
pub struct DisputeSession {
    pub buyer: Address,
    pub seller: Address,
    pub amount: i128,
    pub status: DisputeSessionStatus,
    pub dispute_opened_at: u32,
}

#[contracttype]
#[derive(Clone)]
enum DisputeDataKey {
    Session(Bytes),
}

fn get_session(env: &Env, session_id: &Bytes) -> DisputeSession {
    env.storage()
        .persistent()
        .get(&DisputeDataKey::Session(session_id.clone()))
        .expect("session not found")
}

fn save_session(env: &Env, session_id: Bytes, session: &DisputeSession) {
    env.storage()
        .persistent()
        .set(&DisputeDataKey::Session(session_id), session);
}

/// Minimal session creation for testing open_dispute/resolve_dispute in
/// isolation. Reverts if a session already exists under `session_id`.
pub fn open_session_for_dispute(
    env: &Env,
    session_id: Bytes,
    buyer: Address,
    seller: Address,
    amount: i128,
    status: DisputeSessionStatus,
) {
    assert!(amount > 0, "amount must be > 0");
    assert!(
        !env.storage()
            .persistent()
            .has(&DisputeDataKey::Session(session_id.clone())),
        "DuplicateSessionId"
    );
    save_session(
        env,
        session_id,
        &DisputeSession { buyer, seller, amount, status, dispute_opened_at: 0 },
    );
}

/// Allows the buyer or seller to open a dispute on a `Completed` or
/// `Locked` session (issue #1252). Only the admin may resolve it
/// afterward (see [`resolve_dispute`]).
///
/// # Reverts
/// - `"session not found"` if `session_id` doesn't exist.
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
    let mut session = get_session(env, &session_id);

    assert!(
        session.buyer == caller || session.seller == caller,
        "Unauthorized"
    );
    caller.require_auth();

    assert!(
        session.status == DisputeSessionStatus::Completed
            || session.status == DisputeSessionStatus::Locked,
        "InvalidSessionState"
    );

    let event_session_id: BytesN<32> = session_id.clone().try_into().expect("InvalidSessionId");

    session.status = DisputeSessionStatus::Disputed;
    session.dispute_opened_at = env.ledger().sequence();
    save_session(env, session_id, &session);

    events::emit_dispute_opened(
        env,
        &event_session_id,
        &caller,
        &reason,
        env.ledger().timestamp(),
    );
}

/// Admin resolves a dispute by splitting the escrowed amount between buyer
/// and seller (issue #1253). `buyer_share + seller_share` must equal the
/// session's original `amount` exactly. The platform fee (see
/// [`crate::fee::apply_fee`]) is deducted from each non-zero share before
/// it's considered "paid out" — this function returns the post-fee amounts
/// so a caller with token-transfer wiring can act on them; it does not
/// move tokens itself (no token transfer exists anywhere in this contract
/// yet).
///
/// # Reverts
/// - `"session not found"` if `session_id` doesn't exist.
/// - `"InvalidSessionState"` unless the session is currently `Disputed`.
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

    let mut session = get_session(env, &session_id);

    assert!(session.status == DisputeSessionStatus::Disputed, "InvalidSessionState");
    assert!(buyer_share >= 0 && seller_share >= 0, "InvalidShare");
    assert!(buyer_share + seller_share == session.amount, "SharesMismatch");

    let event_session_id: BytesN<32> = session_id.clone().try_into().expect("InvalidSessionId");

    let (buyer_payout, buyer_fee) = fee::apply_fee(buyer_share, fee_bps);
    let (seller_payout, seller_fee) = fee::apply_fee(seller_share, fee_bps);
    let total_fee = buyer_fee + seller_fee;

    session.status = DisputeSessionStatus::Resolved;
    save_session(env, session_id, &session);

    events::emit_dispute_resolved(
        env,
        &event_session_id,
        &admin,
        buyer_payout,
        seller_payout,
        total_fee,
        env.ledger().timestamp(),
    );

    (buyer_payout, seller_payout, total_fee)
}

/// Read-only accessor, for callers/tests that need to inspect state.
pub fn get(env: &Env, session_id: Bytes) -> DisputeSession {
    get_session(env, &session_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::{Address as _, Events, Ledger};
    use soroban_sdk::IntoVal;

    fn setup() -> (Env, Address, Address, Address, Bytes) {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        let session_id = Bytes::from_slice(&env, &[1u8; 32]);
        (env, admin, buyer, seller, session_id)
    }

    #[test]
    fn buyer_can_open_dispute_on_completed_session() {
        let (env, _admin, buyer, seller, session_id) = setup();
        open_session_for_dispute(
            &env,
            session_id.clone(),
            buyer.clone(),
            seller,
            1_000,
            DisputeSessionStatus::Completed,
        );

        open_dispute(&env, session_id.clone(), buyer, String::from_str(&env, "not delivered"));

        let session = get(&env, session_id);
        assert_eq!(session.status, DisputeSessionStatus::Disputed);
    }

    #[test]
    fn seller_can_open_dispute_on_locked_session() {
        let (env, _admin, buyer, seller, session_id) = setup();
        open_session_for_dispute(
            &env,
            session_id.clone(),
            buyer,
            seller.clone(),
            1_000,
            DisputeSessionStatus::Locked,
        );

        open_dispute(&env, session_id.clone(), seller, String::from_str(&env, "buyer unresponsive"));

        let session = get(&env, session_id);
        assert_eq!(session.status, DisputeSessionStatus::Disputed);
    }

    #[test]
    fn open_dispute_emits_dispute_opened_event() {
        let (env, _admin, buyer, seller, session_id) = setup();
        let contract_id = env.register(crate::SkillSyncContract, ());
        env.ledger().set_timestamp(12_345);
        let reason = String::from_str(&env, "not delivered");

        env.as_contract(&contract_id, || {
            open_session_for_dispute(
                &env,
                session_id.clone(),
                buyer.clone(),
                seller,
                1_000,
                DisputeSessionStatus::Completed,
            );
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
        let stranger = Address::generate(&env);
        open_session_for_dispute(
            &env,
            session_id.clone(),
            buyer,
            seller,
            1_000,
            DisputeSessionStatus::Locked,
        );

        open_dispute(&env, session_id, stranger, String::from_str(&env, "n/a"));
    }

    #[test]
    fn admin_resolves_split_dispute() {
        let (env, admin, buyer, seller, session_id) = setup();
        open_session_for_dispute(
            &env,
            session_id.clone(),
            buyer.clone(),
            seller,
            1_000,
            DisputeSessionStatus::Locked,
        );
        open_dispute(&env, session_id.clone(), buyer, String::from_str(&env, "reason"));

        let (buyer_payout, seller_payout, fee) =
            resolve_dispute(&env, session_id.clone(), admin, 600, 400, 0);

        assert_eq!(buyer_payout, 600);
        assert_eq!(seller_payout, 400);
        assert_eq!(fee, 0);
        assert_eq!(get(&env, session_id).status, DisputeSessionStatus::Resolved);
    }

    #[test]
    fn admin_resolves_full_to_buyer() {
        let (env, admin, buyer, seller, session_id) = setup();
        open_session_for_dispute(
            &env,
            session_id.clone(),
            buyer.clone(),
            seller,
            1_000,
            DisputeSessionStatus::Locked,
        );
        open_dispute(&env, session_id.clone(), buyer, String::from_str(&env, "reason"));

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
            open_session_for_dispute(
                &env,
                session_id.clone(),
                buyer.clone(),
                seller,
                1_000,
                DisputeSessionStatus::Locked,
            );
            open_dispute(
                &env,
                session_id.clone(),
                buyer,
                String::from_str(&env, "reason"),
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
        open_session_for_dispute(
            &env,
            session_id.clone(),
            buyer.clone(),
            seller,
            1_000,
            DisputeSessionStatus::Locked,
        );
        open_dispute(&env, session_id.clone(), buyer, String::from_str(&env, "reason"));

        resolve_dispute(&env, session_id, admin, 500, 400, 0); // 900 != 1000
    }

    #[test]
    #[should_panic(expected = "InvalidSessionState")]
    fn resolve_dispute_requires_disputed_status() {
        let (env, admin, buyer, seller, session_id) = setup();
        open_session_for_dispute(
            &env,
            session_id.clone(),
            buyer,
            seller,
            1_000,
            DisputeSessionStatus::Locked,
        );

        resolve_dispute(&env, session_id, admin, 1_000, 0, 0);
    }
}
