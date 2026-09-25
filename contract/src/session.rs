use soroban_sdk::{contracttype, symbol_short, Address, Bytes, Env};

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
    save_session(env, session_id, &session);
}

/// Read-only accessor for a session, for callers/tests that need to inspect
/// state without going through a mutating entry point.
pub fn get(env: &Env, session_id: Bytes) -> Session {
    get_session(env, &session_id)
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

    env.events().publish(
        (symbol_short!("sess_ref"),),
        (session_id, session.buyer, session.amount),
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::Address as _;

    fn setup() -> (Env, Address, Address, Bytes) {
        let env = Env::default();
        env.mock_all_auths();
        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        let session_id = Bytes::from_slice(&env, &[1u8; 32]);
        (env, buyer, seller, session_id)
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
