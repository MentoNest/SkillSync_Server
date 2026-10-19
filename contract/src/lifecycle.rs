use soroban_sdk::{contractimpl, BytesN, Env};

use crate::errors::ContractError;
use crate::types::{Session, SessionStatus};
use crate::{events, fees, payments, storage};
use crate::{SkillSyncEscrow, SkillSyncEscrowArgs, SkillSyncEscrowClient};

pub(crate) fn load(env: &Env, id: &BytesN<32>) -> Result<Session, ContractError> {
    storage::get_session(env, id).ok_or(ContractError::SessionNotFound)
}

pub(crate) fn require_status(session: &Session, expected: SessionStatus) -> Result<(), ContractError> {
    if session.status == expected {
        Ok(())
    } else {
        Err(ContractError::InvalidStatus)
    }
}

#[contractimpl]
impl SkillSyncEscrow {
    /// The seller marks the session delivered. Locked -> Completed.
    pub fn complete_session(env: Env, session_id: BytesN<32>) -> Result<(), ContractError> {
        let mut session = load(&env, &session_id)?;
        session.seller.require_auth();
        require_status(&session, SessionStatus::Locked)?;

        session.status = SessionStatus::Completed;
        session.completed_at = env.ledger().sequence() as u64;
        storage::save_session(&env, &session_id, &session);

        events::emit_session_completed(&env, &session_id, &session.seller);
        Ok(())
    }

    /// The buyer approves a completed session: the seller is paid
    /// `amount - fee` and the treasury receives the platform fee.
    /// Completed -> Approved.
    pub fn approve_session(env: Env, session_id: BytesN<32>) -> Result<(), ContractError> {
        let mut session = load(&env, &session_id)?;
        session.buyer.require_auth();
        require_status(&session, SessionStatus::Completed)?;

        // State first, transfers after: a failing transfer reverts everything.
        session.status = SessionStatus::Approved;
        storage::save_session(&env, &session_id, &session);

        let (payout, fee) = fees::settle_with_fee(&env, &session.seller, session.amount)?;

        events::emit_session_approved(&env, &session_id, payout, fee);
        Ok(())
    }

    /// The buyer cancels before the seller completed the session and gets
    /// the full amount back (no fee for an early refund). Locked -> Refunded.
    pub fn refund_session(env: Env, session_id: BytesN<32>) -> Result<(), ContractError> {
        let mut session = load(&env, &session_id)?;
        session.buyer.require_auth();
        require_status(&session, SessionStatus::Locked)?;

        session.status = SessionStatus::Refunded;
        storage::save_session(&env, &session_id, &session);

        payments::pay_out(&env, &session.buyer, session.amount)?;

        events::emit_session_refunded(&env, &session_id, session.amount);
        Ok(())
    }

    /// Anyone may refund the buyer once a Completed session has sat past the
    /// dispute window. No fee. Completed -> Refunded.
    pub fn auto_refund(env: Env, session_id: BytesN<32>) -> Result<(), ContractError> {
        let mut session = load(&env, &session_id)?;
        require_status(&session, SessionStatus::Completed)?;

        let window = storage::get_dispute_window(&env) as u64;
        let now = env.ledger().sequence() as u64;
        if now <= session.completed_at.saturating_add(window) {
            return Err(ContractError::DisputeWindowOpen);
        }

        session.status = SessionStatus::Refunded;
        storage::save_session(&env, &session_id, &session);

        payments::pay_out(&env, &session.buyer, session.amount)?;

        events::emit_auto_refund_executed(&env, &session_id, session.amount);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_utils::{balance, seed_session, session_id, setup};
    use soroban_sdk::testutils::Ledger;

    fn set_ledger(f: &crate::test_utils::Fixture, sequence: u32) {
        f.env.ledger().with_mut(|l| l.sequence_number = sequence);
    }

    #[test]
    fn complete_session_marks_completed_with_a_timestamp() {
        let f = setup();
        let id = session_id(&f.env, 1);
        seed_session(&f, &id, SessionStatus::Locked, 1_000, 0);
        set_ledger(&f, 50);

        f.client.complete_session(&id);

        let session = f.client.get_session(&id);
        assert_eq!(session.status, SessionStatus::Completed);
        assert_eq!(session.completed_at, 50);
    }

    #[test]
    fn complete_session_requires_locked_status_and_cannot_repeat() {
        let f = setup();
        let id = session_id(&f.env, 2);
        seed_session(&f, &id, SessionStatus::Locked, 1_000, 0);
        f.client.complete_session(&id);
        assert_eq!(f.client.try_complete_session(&id), Err(Ok(ContractError::InvalidStatus)));
    }

    #[test]
    fn only_the_seller_can_complete() {
        let f = setup();
        let id = session_id(&f.env, 3);
        seed_session(&f, &id, SessionStatus::Locked, 1_000, 0);
        f.env.mock_auths(&[]);
        assert!(f.client.try_complete_session(&id).is_err());
    }

    #[test]
    fn unknown_sessions_are_not_found() {
        let f = setup();
        let id = session_id(&f.env, 4);
        assert_eq!(f.client.try_complete_session(&id), Err(Ok(ContractError::SessionNotFound)));
        assert_eq!(f.client.try_approve_session(&id), Err(Ok(ContractError::SessionNotFound)));
        assert_eq!(f.client.try_refund_session(&id), Err(Ok(ContractError::SessionNotFound)));
        assert_eq!(f.client.try_auto_refund(&id), Err(Ok(ContractError::SessionNotFound)));
    }

    #[test]
    fn approve_pays_the_seller_minus_the_platform_fee() {
        let f = setup();
        f.env
            .as_contract(&f.contract_id, || storage::set_platform_fee(&f.env, 250)); // 2.5%
        let id = session_id(&f.env, 5);
        seed_session(&f, &id, SessionStatus::Completed, 10_000, 10);

        f.client.approve_session(&id);

        assert_eq!(balance(&f, &f.seller), 9_750);
        assert_eq!(balance(&f, &f.treasury), 250);
        assert_eq!(balance(&f, &f.contract_id), 0);
        assert_eq!(f.client.get_session(&id).status, SessionStatus::Approved);
    }

    #[test]
    fn approve_requires_completed_status() {
        let f = setup();
        let id = session_id(&f.env, 6);
        seed_session(&f, &id, SessionStatus::Locked, 1_000, 0);
        assert_eq!(f.client.try_approve_session(&id), Err(Ok(ContractError::InvalidStatus)));
    }

    #[test]
    fn approve_with_zero_fee_pays_everything_to_the_seller() {
        let f = setup();
        let id = session_id(&f.env, 7);
        seed_session(&f, &id, SessionStatus::Completed, 1_000, 10);
        f.client.approve_session(&id);
        assert_eq!(balance(&f, &f.seller), 1_000);
        assert_eq!(balance(&f, &f.treasury), 0);
    }

    #[test]
    fn refund_returns_the_full_amount_before_completion() {
        let f = setup();
        let id = session_id(&f.env, 8);
        seed_session(&f, &id, SessionStatus::Locked, 1_000, 0);
        let before = balance(&f, &f.buyer);

        f.client.refund_session(&id);

        assert_eq!(balance(&f, &f.buyer), before + 1_000);
        assert_eq!(f.client.get_session(&id).status, SessionStatus::Refunded);
    }

    #[test]
    fn refund_is_rejected_once_completed_or_already_refunded() {
        let f = setup();
        let completed = session_id(&f.env, 9);
        seed_session(&f, &completed, SessionStatus::Completed, 1_000, 10);
        assert_eq!(f.client.try_refund_session(&completed), Err(Ok(ContractError::InvalidStatus)));

        let locked = session_id(&f.env, 10);
        seed_session(&f, &locked, SessionStatus::Locked, 1_000, 0);
        f.client.refund_session(&locked);
        assert_eq!(f.client.try_refund_session(&locked), Err(Ok(ContractError::InvalidStatus)));
    }

    #[test]
    fn auto_refund_waits_for_the_dispute_window() {
        let f = setup();
        let id = session_id(&f.env, 11);
        seed_session(&f, &id, SessionStatus::Completed, 1_000, 100);

        set_ledger(&f, 1_100); // exactly completed_at + 1000: still open
        assert_eq!(f.client.try_auto_refund(&id), Err(Ok(ContractError::DisputeWindowOpen)));

        set_ledger(&f, 1_101);
        let before = balance(&f, &f.buyer);
        f.client.auto_refund(&id);
        assert_eq!(balance(&f, &f.buyer), before + 1_000);
        assert_eq!(f.client.get_session(&id).status, SessionStatus::Refunded);
        assert_eq!(balance(&f, &f.treasury), 0);
    }

    #[test]
    fn auto_refund_only_applies_to_completed_sessions() {
        let f = setup();
        let id = session_id(&f.env, 12);
        seed_session(&f, &id, SessionStatus::Locked, 1_000, 0);
        set_ledger(&f, 100_000);
        assert_eq!(f.client.try_auto_refund(&id), Err(Ok(ContractError::InvalidStatus)));
    }
}
