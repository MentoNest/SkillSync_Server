use soroban_sdk::{contracttype, Address, Bytes, Env};

use crate::events;

use crate::{events, fee};

/// Escrow session lifecycle (BE refund function).
///
/// This module owns its own storage key space (`SessionDataKey`) and status
/// type, independent of the top-level `storage`/`errors` modules, since the
/// broader session/escrow feature set (lock_funds, approve, dispute) is
/// still being built out across several issues. `lock_funds` here is the
/// minimal creation path needed to make `refund_session` real and testable;
/// it is not the final lock_funds implementation (no token transfer is
/// wired yet — that lands with the escrow-funding issue).

#[contracttype]
#[derive(Clone, PartialEq, Debug)]
pub enum SessionStatus {
    Locked,
    Completed,
    Approved,
    Refunded,
}

#[contracttype]
#[derive(Clone)]
pub struct Session {
    pub buyer: Address,
    pub seller: Address,
    pub amount: i128,
    pub status: SessionStatus,
    pub created_at: u32,
}

#[contracttype]
#[derive(Clone)]
enum SessionDataKey {
    Session(Bytes),
}

fn get_session(env: &Env, session_id: &Bytes) -> Session {
    env.storage()
        .persistent()
        .get(&SessionDataKey::Session(session_id.clone()))
        .expect("session not found")
}

fn save_session(env: &Env, session_id: Bytes, session: &Session) {
    env.storage()
        .persistent()
        .set(&SessionDataKey::Session(session_id), session);
}

/// Minimal session creation: locks `amount` between `buyer` and `seller`.
/// Reverts if a session already exists under `session_id`.
/// Emits `FundsLocked` (see [`events::emit_funds_locked`]).
pub fn lock_funds(env: &Env, session_id: Bytes, buyer: Address, seller: Address, amount: i128) {
    assert!(amount > 0, "amount must be > 0");
    assert!(
        !env.storage()
            .persistent()
            .has(&SessionDataKey::Session(session_id.clone())),
        "DuplicateSessionId"
    );

    buyer.require_auth();

    let session = Session {
        buyer,
        seller,
        amount,
        status: SessionStatus::Locked,
        created_at: env.ledger().sequence(),
    };
    save_session(env, session_id.clone(), &session);

    events::emit_funds_locked(env, &session_id, &session.buyer, &session.seller, amount);
}

/// Read-only accessor for a session, for callers/tests that need to inspect
/// state without going through a mutating entry point.
pub fn get(env: &Env, session_id: Bytes) -> Session {
    get_session(env, &session_id)
}

/// Buyer approves a completed session, releasing funds to the seller minus
/// the platform fee (see [`fee::apply_platform_fee`]).
///
/// # Reverts
/// - `"session not found"` if `session_id` doesn't exist.
/// - `"InvalidSessionState"` unless the session is currently `Completed`.
///
/// # Events
/// Emits `SessionApproved` (see [`events::emit_session_approved`]).
pub fn approve_session(env: &Env, session_id: Bytes) {
    let mut session = get_session(env, &session_id);

    assert!(
        session.status == SessionStatus::Completed,
        "InvalidSessionState"
    );

    session.buyer.require_auth();

    session.status = SessionStatus::Approved;
    save_session(env, session_id.clone(), &session);

    let (_net, fee) = fee::apply_platform_fee(env, session.amount);
    events::emit_session_approved(
        env,
        &session_id,
        &session.buyer,
        &session.seller,
        session.amount,
        fee,
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
    use soroban_sdk::{symbol_short, IntoVal, TryFromVal};

    fn setup() -> (Env, Address, Address, Bytes) {
        let env = Env::default();
        env.mock_all_auths();
        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        let session_id = Bytes::from_slice(&env, &[1u8; 32]);
        (env, buyer, seller, session_id)
    }

    #[test]
    fn approve_session_emits_session_approved_event_with_fee() {
        let (env, buyer, seller, session_id) = setup();
        env.ledger().set_timestamp(1_700_000_000);
        let contract_id = env.register(SkillSyncContract, ());
        let client = SkillSyncContractClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin, &Address::generate(&env));
        client.set_platform_fee(&admin, &250); // 2.5%
        client.lock_funds(&session_id, &buyer, &seller, &1_000);
        env.as_contract(&contract_id, || {
            let mut session = get(&env, session_id.clone());
            session.status = SessionStatus::Completed;
            save_session(&env, session_id.clone(), &session);
        });

        client.approve_session(&session_id);

        let events = env.events().all();
        assert_eq!(events.len(), 1);
        let (emitter, topics, data) = events.last().unwrap();
        assert_eq!(emitter, contract_id);
        assert_eq!(topics, (symbol_short!("sess_appr"),).into_val(&env));
        let data = <(Bytes, Address, Address, i128, i128, u64)>::try_from_val(&env, &data).unwrap();
        // gross 1_000, fee 25, so the seller nets 975.
        assert_eq!(
            data,
            (session_id.clone(), buyer, seller, 1_000, 25, 1_700_000_000)
        );

        let session = env.as_contract(&contract_id, || get(&env, session_id));
        assert_eq!(session.status, SessionStatus::Approved);
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
        assert_eq!(events.len(), 1);
        let (emitter, topics, data) = events.last().unwrap();
        assert_eq!(emitter, contract_id);
        assert_eq!(topics, (symbol_short!("sess_ref"),).into_val(&env));
        let data = <(Bytes, Address, i128, u64)>::try_from_val(&env, &data).unwrap();
        assert_eq!(data, (session_id, buyer, 1_000, 1_700_000_000));
    }

    #[test]
    #[should_panic(expected = "InvalidSessionState")]
    fn refund_reverts_if_already_completed() {
        let (env, buyer, seller, session_id) = setup();
        lock_funds(&env, session_id.clone(), buyer, seller, 1_000);

        let mut session = get(&env, session_id.clone());
        session.status = SessionStatus::Completed;
        save_session(&env, session_id.clone(), &session);

        refund_session(&env, session_id);
    }

    #[test]
    #[should_panic(expected = "InvalidSessionState")]
    fn refund_reverts_if_already_approved() {
        let (env, buyer, seller, session_id) = setup();
        lock_funds(&env, session_id.clone(), buyer, seller, 1_000);

        let mut session = get(&env, session_id.clone());
        session.status = SessionStatus::Approved;
        save_session(&env, session_id.clone(), &session);

        refund_session(&env, session_id);
    }

    #[test]
    #[should_panic(expected = "session not found")]
    fn refund_reverts_if_session_missing() {
        let env = Env::default();
        env.mock_all_auths();
        refund_session(&env, Bytes::from_slice(&env, &[9u8; 32]));
    }
}
