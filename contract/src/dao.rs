//! Dispute resolution by DAO vote (#1650).
//!
//! Own storage keys (`DaoKey`) and error range 1020-1039.
//!
//! The DAO contract must expose
//!   * `submit_dispute(session_id: BytesN<32>, proposal_id: BytesN<32>, amount: i128)` and
//!   * `get_resolution(proposal_id: BytesN<32>) -> Option<(i128, i128)>`, returning
//!     `(buyer_share, seller_share)` once voting has finished and `None` before that.

use super::*;
use soroban_sdk::{contracterror, contractimpl, contracttype, panic_with_error, vec, IntoVal, Val, Vec};

/// After this many ledgers without a DAO result the admin may resolve the dispute again.
pub const DAO_FALLBACK_LEDGERS: u32 = 10_000;

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DaoKey {
    Dao,
    Case(Bytes32),
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DaoCase {
    pub dao: Address,
    pub proposal_id: Bytes32,
    pub submitted_at: u32,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum DaoError {
    DaoNotConfigured = 1020,
    DaoPending = 1021,
    AlreadySubmitted = 1022,
    NoDaoCase = 1023,
    VotingNotFinished = 1024,
    InvalidDaoShares = 1025,
    NotAParty = 1026,
}

fn case_of(env: &Env, session_id: &Bytes32) -> Option<DaoCase> {
    env.storage()
        .persistent()
        .get(&DaoKey::Case(session_id.clone()))
}

/// Hook for `resolve_dispute`: while a DAO case is open (less than
/// [`DAO_FALLBACK_LEDGERS`] old) the admin cannot resolve the dispute; afterwards the
/// admin may, as the fallback.
pub(crate) fn ensure_admin_may_resolve(env: &Env, session_id: &Bytes32) {
    if let Some(case) = case_of(env, session_id) {
        if env.ledger().sequence() <= case.submitted_at.saturating_add(DAO_FALLBACK_LEDGERS) {
            panic_with_error!(env, DaoError::DaoPending);
        }
    }
}

#[contractimpl]
impl SkillssyncEscrow {
    pub fn set_dispute_dao(env: Env, dao_address: Address) -> Result<(), ContractError> {
        require_admin(&env)?;
        env.storage().persistent().set(&DaoKey::Dao, &dao_address);
        env.events()
            .publish((Symbol::new(&env, "dispute_dao_updated"),), dao_address);
        Ok(())
    }

    pub fn get_dispute_dao(env: Env) -> Option<Address> {
        env.storage().persistent().get(&DaoKey::Dao)
    }

    pub fn get_dao_case(env: Env, session_id: Bytes32) -> Option<DaoCase> {
        case_of(&env, &session_id)
    }

    /// A party sends a disputed session to the DAO, identified by its `proposal_id`.
    pub fn resolve_dispute_via_dao(
        env: Env,
        session_id: Bytes32,
        submitter: Address,
        proposal_id: Bytes32,
    ) -> Result<(), ContractError> {
        submitter.require_auth();
        let session =
            load_session(&env, session_id.clone()).ok_or(ContractError::SessionNotFound)?;
        if session.status != SessionStatus::Disputed {
            return Err(ContractError::InvalidSessionStatus);
        }
        if submitter != session.buyer && submitter != session.seller {
            panic_with_error!(&env, DaoError::NotAParty);
        }
        let dao: Address = env
            .storage()
            .persistent()
            .get(&DaoKey::Dao)
            .unwrap_or_else(|| panic_with_error!(&env, DaoError::DaoNotConfigured));
        if case_of(&env, &session_id).is_some() {
            panic_with_error!(&env, DaoError::AlreadySubmitted);
        }
        env.storage().persistent().set(
            &DaoKey::Case(session_id.clone()),
            &DaoCase {
                dao: dao.clone(),
                proposal_id: proposal_id.clone(),
                submitted_at: env.ledger().sequence(),
            },
        );
        let args: Vec<Val> = vec![
            &env,
            session_id.clone().into_val(&env),
            proposal_id.clone().into_val(&env),
            session.amount.into_val(&env),
        ];
        env.invoke_contract::<()>(&dao, &Symbol::new(&env, "submit_dispute"), args);
        env.events().publish(
            (Symbol::new(&env, "DisputeSentToDAO"),),
            (session_id, dao, proposal_id),
        );
        Ok(())
    }

    /// Anyone can finalize once the DAO has published the vote result: the DAO's
    /// `(buyer_share, seller_share)` is applied like an admin resolution.
    pub fn execute_dao_resolution(env: Env, session_id: Bytes32) -> Result<(), ContractError> {
        let mut session =
            load_session(&env, session_id.clone()).ok_or(ContractError::SessionNotFound)?;
        let case = case_of(&env, &session_id)
            .unwrap_or_else(|| panic_with_error!(&env, DaoError::NoDaoCase));
        if session.status != SessionStatus::Disputed {
            return Err(ContractError::InvalidSessionStatus);
        }
        let args: Vec<Val> = vec![&env, case.proposal_id.clone().into_val(&env)];
        let result: Option<(i128, i128)> =
            env.invoke_contract(&case.dao, &Symbol::new(&env, "get_resolution"), args);
        let (buyer_share, seller_share) =
            result.unwrap_or_else(|| panic_with_error!(&env, DaoError::VotingNotFinished));
        if buyer_share < 0
            || seller_share < 0
            || buyer_share
                .checked_add(seller_share)
                .map_or(true, |total| total != session.amount)
        {
            panic_with_error!(&env, DaoError::InvalidDaoShares);
        }

        let token_addr =
            read_payment_token(&env).ok_or(ContractError::PaymentTokenNotConfigured)?;
        let token = token::Client::new(&env, &token_addr);
        let contract = env.current_contract_address();
        let (settlement, fee) = apply_fee(&env, session.amount);
        let buyer_payout = if buyer_share == session.amount {
            settlement
        } else if seller_share == session.amount {
            0
        } else {
            buyer_share
                .checked_mul(settlement)
                .and_then(|value| value.checked_div(session.amount))
                .unwrap_or(0)
        };
        let seller_payout = settlement - buyer_payout;

        session.status = SessionStatus::Resolved;
        session.dispute_resolved_at = env.ledger().timestamp();
        save_session(&env, session_id.clone(), &session);
        if buyer_payout > 0 {
            token.transfer(&contract, &session.buyer, &buyer_payout);
        }
        if seller_payout > 0 {
            token.transfer(&contract, &session.seller, &seller_payout);
        }
        transfer_treasury_fee(&env, &token, fee)?;
        env.events().publish(
            (Symbol::new(&env, "DisputeResolvedByDAO"),),
            (session_id, buyer_share, seller_share),
        );
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::{Address as _, Ledger};

    mod mock_dao {
        use super::*;
        use soroban_sdk::contract;

        #[contract]
        pub struct MockDao;

        #[contractimpl]
        impl MockDao {
            pub fn submit_dispute(env: Env, session_id: BytesN<32>, proposal_id: BytesN<32>, _amount: i128) {
                env.storage().persistent().set(&session_id, &proposal_id);
            }

            pub fn was_submitted(env: Env, session_id: BytesN<32>) -> bool {
                env.storage().persistent().has(&session_id)
            }

            /// Test helper: finishes the vote.
            pub fn finish(env: Env, proposal_id: BytesN<32>, buyer: i128, seller: i128) {
                env.storage().persistent().set(&proposal_id, &(buyer, seller));
            }

            pub fn get_resolution(env: Env, proposal_id: BytesN<32>) -> Option<(i128, i128)> {
                env.storage().persistent().get(&proposal_id)
            }
        }
    }

    struct Fixture {
        env: Env,
        client: SkillssyncEscrowClient<'static>,
        token: token::Client<'static>,
        dao: mock_dao::MockDaoClient<'static>,
        buyer: Address,
        seller: Address,
        treasury: Address,
    }

    fn setup() -> Fixture {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(SkillssyncEscrow, ());
        let token_addr = env
            .register_stellar_asset_contract_v2(Address::generate(&env))
            .address();
        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        env.as_contract(&contract_id, || {
            env.storage().persistent().set(&DataKey::Admin, &admin);
            env.storage().persistent().set(&DataKey::Treasury, &treasury);
            env.storage().persistent().set(&DataKey::PaymentToken, &token_addr);
        });
        token::StellarAssetClient::new(&env, &token_addr).mint(&buyer, &1_000_000);
        let dao_id = env.register(mock_dao::MockDao, ());
        let client = SkillssyncEscrowClient::new(&env, &contract_id);
        client.set_dispute_dao(&dao_id);
        Fixture {
            client,
            token: token::Client::new(&env, &token_addr),
            dao: mock_dao::MockDaoClient::new(&env, &dao_id),
            env,
            buyer,
            seller,
            treasury,
        }
    }

    fn id(env: &Env, n: u8) -> Bytes32 {
        BytesN::from_array(env, &[n; 32])
    }

    fn disputed(f: &Fixture, n: u8) {
        f.client.lock_funds(&id(&f.env, n), &f.buyer, &f.seller, &10_000);
        f.client.open_dispute(&id(&f.env, n), &String::from_str(&f.env, "late"));
    }

    #[test]
    fn a_dispute_goes_to_the_dao_and_its_vote_decides() {
        let f = setup();
        disputed(&f, 1);
        f.client.resolve_dispute_via_dao(&id(&f.env, 1), &f.buyer, &id(&f.env, 50));
        assert!(f.dao.was_submitted(&id(&f.env, 1)));
        assert_eq!(f.client.get_dao_case(&id(&f.env, 1)).unwrap().proposal_id, id(&f.env, 50));

        // Voting is still open.
        assert!(f.client.try_execute_dao_resolution(&id(&f.env, 1)).is_err());

        f.dao.finish(&id(&f.env, 50), &6_000, &4_000);
        f.client.execute_dao_resolution(&id(&f.env, 1));

        let session = f.client.get_session(&id(&f.env, 1)).unwrap();
        assert_eq!(session.status, SessionStatus::Resolved);
        // 1% fee: 9_900 split 60/40.
        assert_eq!(f.token.balance(&f.seller), 3_960);
        assert_eq!(f.token.balance(&f.treasury), 100);
        assert!(f.client.try_execute_dao_resolution(&id(&f.env, 1)).is_err());
    }

    #[test]
    fn the_admin_cannot_resolve_while_the_dao_case_is_open() {
        let f = setup();
        disputed(&f, 1);
        f.client.resolve_dispute_via_dao(&id(&f.env, 1), &f.seller, &id(&f.env, 50));
        assert!(f.client.try_resolve_dispute(&id(&f.env, 1), &0, &10_000, &0).is_err());
    }

    #[test]
    fn the_admin_is_the_fallback_after_10000_ledgers_without_a_dao_result() {
        let f = setup();
        disputed(&f, 1);
        f.client.resolve_dispute_via_dao(&id(&f.env, 1), &f.buyer, &id(&f.env, 50));
        f.env.ledger().with_mut(|li| li.sequence_number += DAO_FALLBACK_LEDGERS);
        assert!(f.client.try_resolve_dispute(&id(&f.env, 1), &0, &10_000, &0).is_err());

        f.env.ledger().with_mut(|li| li.sequence_number += 1);
        f.client.resolve_dispute(&id(&f.env, 1), &0, &10_000, &0);
        assert_eq!(f.client.get_session(&id(&f.env, 1)).unwrap().status, SessionStatus::Resolved);
        // The DAO can no longer apply a result to an already resolved session.
        f.dao.finish(&id(&f.env, 50), &0, &10_000);
        assert!(f.client.try_execute_dao_resolution(&id(&f.env, 1)).is_err());
    }

    #[test]
    fn disputes_without_a_dao_case_still_use_the_admin() {
        let f = setup();
        disputed(&f, 1);
        f.client.resolve_dispute(&id(&f.env, 1), &1, &0, &10_000);
        assert_eq!(f.token.balance(&f.seller), 9_900);
    }

    #[test]
    fn submission_is_validated() {
        let f = setup();
        f.client.lock_funds(&id(&f.env, 1), &f.buyer, &f.seller, &10_000);
        // Not disputed yet.
        assert!(f.client.try_resolve_dispute_via_dao(&id(&f.env, 1), &f.buyer, &id(&f.env, 50)).is_err());
        f.client.open_dispute(&id(&f.env, 1), &String::from_str(&f.env, "x"));
        let stranger = Address::generate(&f.env);
        assert!(f.client.try_resolve_dispute_via_dao(&id(&f.env, 1), &stranger, &id(&f.env, 50)).is_err());
        f.client.resolve_dispute_via_dao(&id(&f.env, 1), &f.buyer, &id(&f.env, 50));
        assert!(f.client.try_resolve_dispute_via_dao(&id(&f.env, 1), &f.seller, &id(&f.env, 51)).is_err());
    }

    #[test]
    fn a_dao_result_that_does_not_add_up_is_rejected() {
        let f = setup();
        disputed(&f, 1);
        f.client.resolve_dispute_via_dao(&id(&f.env, 1), &f.buyer, &id(&f.env, 50));
        f.dao.finish(&id(&f.env, 50), &6_000, &3_000);
        assert!(f.client.try_execute_dao_resolution(&id(&f.env, 1)).is_err());
        assert_eq!(f.client.get_session(&id(&f.env, 1)).unwrap().status, SessionStatus::Disputed);
    }

    #[test]
    fn a_dao_must_be_configured() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(SkillssyncEscrow, ());
        let client = SkillssyncEscrowClient::new(&env, &contract_id);
        assert!(client.get_dispute_dao().is_none());
        assert!(client.get_dao_case(&BytesN::from_array(&env, &[1; 32])).is_none());
    }
}
