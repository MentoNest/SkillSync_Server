use soroban_sdk::{contractimpl, Address, BytesN, Env};

use crate::errors::ContractError;
use crate::types::{Session, SessionStatus};
use crate::{admin, events, payments, storage};
use crate::{SkillSyncEscrow, SkillSyncEscrowArgs, SkillSyncEscrowClient};

#[contractimpl]
impl SkillSyncEscrow {
    /// Sets the token used for escrow payments (the native asset's token
    /// contract on the target network). Admin only.
    pub fn set_token(env: Env, token: Address) -> Result<(), ContractError> {
        let admin = admin::require_admin(&env)?;
        admin.require_auth();
        storage::set_token(&env, &token);
        Ok(())
    }

    /// The buyer deposits `amount` into a new escrow session.
    ///
    /// Reverts with `DuplicateSessionId` when the id exists - ids are never
    /// reused, even after a session was completed, refunded or resolved,
    /// because finished sessions stay in storage.
    pub fn lock_funds(
        env: Env,
        session_id: BytesN<32>,
        buyer: Address,
        seller: Address,
        amount: i128,
    ) -> Result<(), ContractError> {
        if amount <= 0 {
            return Err(ContractError::InvalidAmount);
        }
        buyer.require_auth();

        if storage::has_session(&env, &session_id) {
            return Err(ContractError::DuplicateSessionId);
        }

        payments::pull_in(&env, &buyer, amount)?;

        let session = Session {
            buyer: buyer.clone(),
            seller: seller.clone(),
            amount,
            status: SessionStatus::Locked,
            created_at: env.ledger().sequence() as u64,
            completed_at: 0,
            dispute_opened_at: 0,
            dispute_resolved_at: 0,
        };
        storage::save_session(&env, &session_id, &session);

        events::emit_funds_locked(&env, &session_id, &buyer, &seller, amount);
        Ok(())
    }

    /// Reads a session by id.
    pub fn get_session(env: Env, session_id: BytesN<32>) -> Result<Session, ContractError> {
        storage::get_session(&env, &session_id).ok_or(ContractError::SessionNotFound)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_utils::{balance, session_id, setup};
    use soroban_sdk::testutils::Address as _;

    #[test]
    fn lock_funds_stores_a_locked_session_and_moves_tokens() {
        let f = setup();
        let id = session_id(&f.env, 1);
        f.client.lock_funds(&id, &f.buyer, &f.seller, &500);

        let session = f.client.get_session(&id);
        assert_eq!(session.status, SessionStatus::Locked);
        assert_eq!(session.amount, 500);
        assert_eq!(session.buyer, f.buyer);
        assert_eq!(session.seller, f.seller);
        assert_eq!(balance(&f, &f.contract_id), 500);
        assert_eq!(balance(&f, &f.buyer), 1_000_000 - 500);
    }

    #[test]
    fn lock_funds_rejects_non_positive_amounts() {
        let f = setup();
        let id = session_id(&f.env, 2);
        assert_eq!(
            f.client.try_lock_funds(&id, &f.buyer, &f.seller, &0),
            Err(Ok(ContractError::InvalidAmount))
        );
        assert_eq!(
            f.client.try_lock_funds(&id, &f.buyer, &f.seller, &-5),
            Err(Ok(ContractError::InvalidAmount))
        );
    }

    #[test]
    fn duplicate_session_ids_are_rejected() {
        let f = setup();
        let id = session_id(&f.env, 3);
        f.client.lock_funds(&id, &f.buyer, &f.seller, &100);
        assert_eq!(
            f.client.try_lock_funds(&id, &f.buyer, &f.seller, &100),
            Err(Ok(ContractError::DuplicateSessionId))
        );
    }

    #[test]
    fn finalized_session_ids_cannot_be_reused() {
        let f = setup();
        let id = session_id(&f.env, 4);
        crate::test_utils::seed_session(&f, &id, SessionStatus::Refunded, 100, 0);
        assert_eq!(
            f.client.try_lock_funds(&id, &f.buyer, &f.seller, &100),
            Err(Ok(ContractError::DuplicateSessionId))
        );
    }

    #[test]
    fn lock_funds_requires_a_configured_token() {
        let env = Env::default();
        env.mock_all_auths();
        let id = env.register(SkillSyncEscrow, ());
        let client = SkillSyncEscrowClient::new(&env, &id);
        let admin = Address::generate(&env);
        client.initialize(&admin, &Address::generate(&env));
        let sid = BytesN::from_array(&env, &[9u8; 32]);
        assert_eq!(
            client.try_lock_funds(&sid, &Address::generate(&env), &Address::generate(&env), &10),
            Err(Ok(ContractError::TokenNotConfigured))
        );
    }

    #[test]
    fn unknown_sessions_are_not_found() {
        let f = setup();
        let id = session_id(&f.env, 5);
        assert_eq!(f.client.try_get_session(&id), Err(Ok(ContractError::SessionNotFound)));
    }

    #[test]
    fn save_and_get_roundtrip_through_storage_helpers() {
        let f = setup();
        let id = session_id(&f.env, 6);
        let session = Session {
            buyer: f.buyer.clone(),
            seller: f.seller.clone(),
            amount: 42,
            status: SessionStatus::Disputed,
            created_at: 1,
            completed_at: 2,
            dispute_opened_at: 3,
            dispute_resolved_at: 4,
        };
        f.env.as_contract(&f.contract_id, || {
            storage::save_session(&f.env, &id, &session);
            assert_eq!(storage::get_session(&f.env, &id), Some(session.clone()));
        });
    }

    #[test]
    fn only_the_admin_sets_the_token() {
        let f = setup();
        f.env.mock_auths(&[]);
        assert!(f.client.try_set_token(&f.token).is_err());
    }
}
