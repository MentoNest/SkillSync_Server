//! Escrow released on the state of another Soroban contract (#1649).
//!
//! Own storage keys (`CondKey`) and error range 1000-1019.
//!
//! The external contract must expose `check_condition(selector: BytesN<32>) -> bool`;
//! the 32-byte `selector` chosen at lock time tells it which condition to evaluate
//! (a trade id, a mint id, a proposal id, ...).

use super::*;
use soroban_sdk::{contracterror, contractimpl, contracttype, panic_with_error, vec, IntoVal, Val, Vec};

/// About 1 day of ledgers.
pub const DEFAULT_CONDITION_TIMEOUT_LEDGERS: u32 = 17_280;

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum CondKey {
    Timeout,
    Condition(Bytes32),
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Condition {
    pub contract: Address,
    pub selector: Bytes32,
    /// Last ledger at which the condition can still release the funds.
    pub expires_at: u32,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum ConditionError {
    NotConditional = 1000,
    ConditionNotMet = 1001,
    ConditionTimedOut = 1002,
    NotTimedOutYet = 1003,
    InvalidTimeout = 1004,
    ConditionalSession = 1005,
}

fn timeout(env: &Env) -> u32 {
    env.storage()
        .persistent()
        .get(&CondKey::Timeout)
        .unwrap_or(DEFAULT_CONDITION_TIMEOUT_LEDGERS)
}

fn condition_of(env: &Env, session_id: &Bytes32) -> Option<Condition> {
    env.storage()
        .persistent()
        .get(&CondKey::Condition(session_id.clone()))
}

fn evaluate(env: &Env, condition: &Condition) -> bool {
    let args: Vec<Val> = vec![env, condition.selector.clone().into_val(env)];
    env.invoke_contract::<bool>(
        &condition.contract,
        &Symbol::new(env, "check_condition"),
        args,
    )
}

/// Hook for `refund_session`: a conditional session must not be refunded at the buyer's
/// whim; it ends through `release_if_condition_met` or `refund_conditional_failed`.
pub(crate) fn reject_conditional(env: &Env, session_id: &Bytes32) {
    if condition_of(env, session_id).is_some() {
        panic_with_error!(env, ConditionError::ConditionalSession);
    }
}

#[contractimpl]
impl SkillssyncEscrow {
    /// Ledgers a conditional session waits for its condition (default 17,280, about a day).
    /// Applies to sessions locked afterwards.
    pub fn set_condition_timeout(env: Env, ledgers: u32) -> Result<(), ContractError> {
        require_admin(&env)?;
        if ledgers == 0 {
            panic_with_error!(&env, ConditionError::InvalidTimeout);
        }
        env.storage().persistent().set(&CondKey::Timeout, &ledgers);
        Ok(())
    }

    pub fn get_condition_timeout(env: Env) -> u32 {
        timeout(&env)
    }

    /// Locks funds that are released only when `condition_contract` reports the condition
    /// identified by `condition_selector` as met.
    pub fn lock_funds_conditional(
        env: Env,
        session_id: Bytes32,
        buyer: Address,
        seller: Address,
        amount: i128,
        condition_contract: Address,
        condition_selector: Bytes32,
    ) -> Result<(), ContractError> {
        SkillssyncEscrow::lock_funds(env.clone(), session_id.clone(), buyer, seller, amount)?;
        let expires_at = env.ledger().sequence().saturating_add(timeout(&env));
        env.storage().persistent().set(
            &CondKey::Condition(session_id),
            &Condition {
                contract: condition_contract,
                selector: condition_selector,
                expires_at,
            },
        );
        Ok(())
    }

    pub fn get_condition(env: Env, session_id: Bytes32) -> Option<Condition> {
        condition_of(&env, &session_id)
    }

    /// Calls the external contract's `check_condition` view for this session.
    pub fn check_condition(env: Env, session_id: Bytes32) -> bool {
        let condition = condition_of(&env, &session_id)
            .unwrap_or_else(|| panic_with_error!(&env, ConditionError::NotConditional));
        evaluate(&env, &condition)
    }

    /// Anyone can trigger the payout once the condition holds (and before the timeout).
    pub fn release_if_condition_met(env: Env, session_id: Bytes32) -> Result<(), ContractError> {
        let mut session =
            load_session(&env, session_id.clone()).ok_or(ContractError::SessionNotFound)?;
        let condition = condition_of(&env, &session_id)
            .unwrap_or_else(|| panic_with_error!(&env, ConditionError::NotConditional));
        if session.status != SessionStatus::Locked {
            return Err(ContractError::InvalidSessionStatus);
        }
        if env.ledger().sequence() > condition.expires_at {
            panic_with_error!(&env, ConditionError::ConditionTimedOut);
        }
        if !evaluate(&env, &condition) {
            panic_with_error!(&env, ConditionError::ConditionNotMet);
        }
        let token_addr =
            read_payment_token(&env).ok_or(ContractError::PaymentTokenNotConfigured)?;
        let token = token::Client::new(&env, &token_addr);
        let (payout, fee) = apply_fee(&env, session.amount);
        session.status = SessionStatus::Approved;
        save_session(&env, session_id.clone(), &session);
        token.transfer(&env.current_contract_address(), &session.seller, &payout);
        transfer_treasury_fee(&env, &token, fee)?;
        env.events()
            .publish((Symbol::new(&env, "ConditionMet"),), (session_id, payout, fee));
        Ok(())
    }

    /// After the timeout without the condition being released, the buyer gets everything back.
    pub fn refund_conditional_failed(env: Env, session_id: Bytes32) -> Result<(), ContractError> {
        let mut session =
            load_session(&env, session_id.clone()).ok_or(ContractError::SessionNotFound)?;
        session.buyer.require_auth();
        let condition = condition_of(&env, &session_id)
            .unwrap_or_else(|| panic_with_error!(&env, ConditionError::NotConditional));
        if session.status != SessionStatus::Locked {
            return Err(ContractError::InvalidSessionStatus);
        }
        if env.ledger().sequence() <= condition.expires_at {
            panic_with_error!(&env, ConditionError::NotTimedOutYet);
        }
        let token_addr =
            read_payment_token(&env).ok_or(ContractError::PaymentTokenNotConfigured)?;
        session.status = SessionStatus::Refunded;
        save_session(&env, session_id.clone(), &session);
        token::Client::new(&env, &token_addr).transfer(
            &env.current_contract_address(),
            &session.buyer,
            &session.amount,
        );
        env.events().publish(
            (Symbol::new(&env, "ConditionFailedRefund"),),
            (session_id, session.amount),
        );
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::{Address as _, Ledger};

    mod mock_condition {
        use super::*;
        use soroban_sdk::contract;

        #[contract]
        pub struct MockCondition;

        #[contractimpl]
        impl MockCondition {
            pub fn set(env: Env, selector: BytesN<32>, met: bool) {
                env.storage().persistent().set(&selector, &met);
            }

            pub fn check_condition(env: Env, selector: BytesN<32>) -> bool {
                env.storage().persistent().get(&selector).unwrap_or(false)
            }
        }
    }

    struct Fixture {
        env: Env,
        client: SkillssyncEscrowClient<'static>,
        token: token::Client<'static>,
        oracle: mock_condition::MockConditionClient<'static>,
        oracle_id: Address,
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
        let oracle_id = env.register(mock_condition::MockCondition, ());
        Fixture {
            client: SkillssyncEscrowClient::new(&env, &contract_id),
            token: token::Client::new(&env, &token_addr),
            oracle: mock_condition::MockConditionClient::new(&env, &oracle_id),
            oracle_id,
            env,
            buyer,
            seller,
            treasury,
        }
    }

    fn id(env: &Env, n: u8) -> Bytes32 {
        BytesN::from_array(env, &[n; 32])
    }

    fn lock(f: &Fixture, n: u8) {
        f.client.lock_funds_conditional(
            &id(&f.env, n),
            &f.buyer,
            &f.seller,
            &10_000,
            &f.oracle_id,
            &id(&f.env, 100 + n),
        );
    }

    #[test]
    fn funds_are_released_once_the_external_condition_is_met() {
        let f = setup();
        lock(&f, 1);
        assert!(!f.client.check_condition(&id(&f.env, 1)));
        assert!(f.client.try_release_if_condition_met(&id(&f.env, 1)).is_err());

        f.oracle.set(&id(&f.env, 101), &true);
        assert!(f.client.check_condition(&id(&f.env, 1)));
        // Anyone may trigger it; no authorization from buyer or seller is needed.
        f.client.release_if_condition_met(&id(&f.env, 1));

        assert_eq!(f.client.get_session(&id(&f.env, 1)).unwrap().status, SessionStatus::Approved);
        assert_eq!(f.token.balance(&f.seller), 9_900);
        assert_eq!(f.token.balance(&f.treasury), 100);
        assert!(f.client.try_release_if_condition_met(&id(&f.env, 1)).is_err());
    }

    #[test]
    fn the_condition_is_tracked_per_session_selector() {
        let f = setup();
        lock(&f, 1);
        lock(&f, 2);
        f.oracle.set(&id(&f.env, 102), &true);
        assert!(!f.client.check_condition(&id(&f.env, 1)));
        assert!(f.client.check_condition(&id(&f.env, 2)));
    }

    #[test]
    fn the_buyer_reclaims_everything_after_the_timeout() {
        let f = setup();
        f.client.set_condition_timeout(&100);
        lock(&f, 1);
        let after_lock = f.token.balance(&f.buyer);

        assert!(f.client.try_refund_conditional_failed(&id(&f.env, 1)).is_err()); // too early
        f.env.ledger().with_mut(|li| li.sequence_number += 101);
        f.client.refund_conditional_failed(&id(&f.env, 1));

        assert_eq!(f.token.balance(&f.buyer), after_lock + 10_000);
        assert_eq!(f.client.get_session(&id(&f.env, 1)).unwrap().status, SessionStatus::Refunded);
        assert!(f.client.try_refund_conditional_failed(&id(&f.env, 1)).is_err());
    }

    #[test]
    fn a_condition_met_after_the_timeout_no_longer_releases() {
        let f = setup();
        f.client.set_condition_timeout(&100);
        lock(&f, 1);
        f.env.ledger().with_mut(|li| li.sequence_number += 101);
        f.oracle.set(&id(&f.env, 101), &true);
        assert!(f.client.try_release_if_condition_met(&id(&f.env, 1)).is_err());
        f.client.refund_conditional_failed(&id(&f.env, 1));
    }

    #[test]
    fn a_conditional_session_cannot_be_refunded_early_with_refund_session() {
        let f = setup();
        lock(&f, 1);
        assert!(f.client.try_refund_session(&id(&f.env, 1)).is_err());
    }

    #[test]
    fn ordinary_sessions_are_not_conditional_and_the_timeout_is_validated() {
        let f = setup();
        f.client.lock_funds(&id(&f.env, 1), &f.buyer, &f.seller, &10_000);
        assert!(f.client.try_check_condition(&id(&f.env, 1)).is_err());
        assert!(f.client.try_release_if_condition_met(&id(&f.env, 1)).is_err());
        assert!(f.client.try_refund_conditional_failed(&id(&f.env, 1)).is_err());
        assert!(f.client.try_set_condition_timeout(&0).is_err());
        assert_eq!(f.client.get_condition_timeout(), DEFAULT_CONDITION_TIMEOUT_LEDGERS);
        assert!(f.client.get_condition(&id(&f.env, 1)).is_none());
    }
}
