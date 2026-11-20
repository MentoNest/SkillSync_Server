#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, token, Address,
    BytesN, Env, String, Symbol,
};
type Bytes32 = BytesN<32>;

#[contract]
pub struct SkillssyncEscrow;

const DEFAULT_PLATFORM_FEE_BPS: u32 = 100;
const DEFAULT_DISPUTE_WINDOW_LEDGERS: u32 = 1000;
const MAX_PLATFORM_FEE_BPS: u32 = 1000;

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    Admin,
    Treasury,
    PlatformFeeBps,
    DisputeWindow,
    PaymentToken,
    Initialized,
    WasmHash,
    Session(Bytes32),
}

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum SessionStatus {
    Locked,
    Completed,
    Approved,
    Refunded,
    Disputed,
    Resolved,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Session {
    pub buyer: Address,
    pub seller: Address,
    pub amount: i128,
    pub status: SessionStatus,
    pub created_at: u64,
    pub completed_at: u64,
    pub dispute_opened_at: u64,
    pub dispute_resolved_at: u64,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum ContractError {
    AlreadyInitialized = 1,
    Unauthorized = 2,
    InvalidPlatformFee = 3,
    InvalidAmount = 4,
    DuplicateSessionId = 5,
    SessionNotFound = 6,
    InvalidSessionStatus = 7,
    PaymentTokenNotConfigured = 8,
    InvalidResolution = 9,
    InvalidShares = 10,
    NotInitialized = 11,
}

fn is_initialized(env: &Env) -> bool {
    env.storage()
        .persistent()
        .get(&DataKey::Initialized)
        .unwrap_or(false)
}

fn require_initialized(env: &Env) -> Result<(), ContractError> {
    if !is_initialized(env) {
        return Err(ContractError::NotInitialized);
    }
    Ok(())
}

fn assert_initialized(env: &Env) {
    if !is_initialized(env) {
        panic_with_error!(env, ContractError::NotInitialized);
    }
}

fn read_admin(env: &Env) -> Option<Address> {
    env.storage().persistent().get(&DataKey::Admin)
}

fn require_admin(env: &Env) -> Result<Address, ContractError> {
    let admin = read_admin(env).ok_or(ContractError::Unauthorized)?;
    admin.require_auth();
    Ok(admin)
}

fn read_treasury(env: &Env) -> Option<Address> {
    env.storage().persistent().get(&DataKey::Treasury)
}

fn read_platform_fee(env: &Env) -> u32 {
    env.storage()
        .persistent()
        .get(&DataKey::PlatformFeeBps)
        .unwrap_or(DEFAULT_PLATFORM_FEE_BPS)
}

fn read_dispute_window(env: &Env) -> u32 {
    env.storage()
        .persistent()
        .get(&DataKey::DisputeWindow)
        .unwrap_or(DEFAULT_DISPUTE_WINDOW_LEDGERS)
}

fn read_payment_token(env: &Env) -> Option<Address> {
    env.storage().persistent().get(&DataKey::PaymentToken)
}

fn load_session(env: &Env, session_id: Bytes32) -> Option<Session> {
    env.storage().persistent().get(&DataKey::Session(session_id))
}

fn save_session(env: &Env, session_id: Bytes32, session: &Session) {
    env.storage()
        .persistent()
        .set(&DataKey::Session(session_id), session);
}

fn session_exists(env: &Env, session_id: Bytes32) -> bool {
    env.storage()
        .persistent()
        .has(&DataKey::Session(session_id))
}

fn apply_fee(env: &Env, amount: i128) -> (i128, i128) {
    let fee_bps = read_platform_fee(env);
    if amount <= 0 || fee_bps == 0 {
        return (amount, 0);
    }
    let fee_amount = amount / 10_000 * fee_bps as i128
        + amount % 10_000 * fee_bps as i128 / 10_000;
    (amount - fee_amount, fee_amount)
}

fn transfer_treasury_fee(
    env: &Env,
    token: &token::Client,
    fee_amount: i128,
) -> Result<(), ContractError> {
    if fee_amount > 0 {
        let treasury = read_treasury(env).ok_or(ContractError::Unauthorized)?;
        token.transfer(
            &env.current_contract_address(),
            &treasury,
            &fee_amount,
        );
    }
    Ok(())
}

#[contractimpl]
impl SkillssyncEscrow {
    pub fn initialize(env: Env, admin: Address, treasury: Address) -> Result<(), ContractError> {
        if is_initialized(&env) {
            return Err(ContractError::AlreadyInitialized);
        }
        admin.require_auth();
        let storage = env.storage().persistent();
        storage.set(&DataKey::Admin, &admin);
        storage.set(&DataKey::Treasury, &treasury);
        storage.set(&DataKey::Initialized, &true);
        env.events()
            .publish((Symbol::new(&env, "Initialized"),), (admin, treasury));
        Ok(())
    }

    pub fn set_payment_token(env: Env, token: Address) -> Result<(), ContractError> {
        require_initialized(&env)?;
        require_admin(&env)?;
        env.storage().persistent().set(&DataKey::PaymentToken, &token);
        env.events()
            .publish((Symbol::new(&env, "payment_token_updated"),), token);
        Ok(())
    }

    pub fn get_payment_token(env: Env) -> Option<Address> {
        assert_initialized(&env);
        read_payment_token(&env)
    }

    pub fn set_platform_fee(env: Env, new_fee_bps: u32) -> Result<(), ContractError> {
        require_initialized(&env)?;
        require_admin(&env)?;
        if new_fee_bps > MAX_PLATFORM_FEE_BPS {
            return Err(ContractError::InvalidPlatformFee);
        }
        env.storage()
            .persistent()
            .set(&DataKey::PlatformFeeBps, &new_fee_bps);
        env.events().publish(
            (Symbol::new(&env, "platform_fee_updated"),),
            new_fee_bps,
        );
        Ok(())
    }

    pub fn get_platform_fee(env: Env) -> u32 {
        assert_initialized(&env);
        read_platform_fee(&env)
    }

    pub fn set_treasury(env: Env, new_treasury: Address) -> Result<(), ContractError> {
        require_initialized(&env)?;
        require_admin(&env)?;
        env.storage()
            .persistent()
            .set(&DataKey::Treasury, &new_treasury);
        env.events()
            .publish((Symbol::new(&env, "treasury_updated"),), new_treasury);
        Ok(())
    }

    pub fn get_treasury(env: Env) -> Option<Address> {
        assert_initialized(&env);
        read_treasury(&env)
    }

    pub fn lock_funds(
        env: Env,
        session_id: Bytes32,
        buyer: Address,
        seller: Address,
        amount: i128,
    ) -> Result<(), ContractError> {
        require_initialized(&env)?;
        if amount <= 0 {
            return Err(ContractError::InvalidAmount);
        }
        if session_exists(&env, session_id.clone()) {
            return Err(ContractError::DuplicateSessionId);
        }
        buyer.require_auth();
        let token_addr =
            read_payment_token(&env).ok_or(ContractError::PaymentTokenNotConfigured)?;
        let token = token::Client::new(&env, &token_addr);
        token.transfer(&buyer, &env.current_contract_address(), &amount);
        let session = Session {
            buyer: buyer.clone(),
            seller: seller.clone(),
            amount,
            status: SessionStatus::Locked,
            created_at: env.ledger().timestamp(),
            completed_at: 0,
            dispute_opened_at: 0,
            dispute_resolved_at: 0,
        };
        save_session(&env, session_id.clone(), &session);
        env.events().publish(
            (Symbol::new(&env, "funds_locked"),),
            (session_id, buyer, seller, amount),
        );
        Ok(())
    }

    pub fn complete_session(env: Env, session_id: Bytes32) -> Result<(), ContractError> {
        require_initialized(&env)?;
        let mut session =
            load_session(&env, session_id.clone()).ok_or(ContractError::SessionNotFound)?;
        session.seller.require_auth();
        if session.status != SessionStatus::Locked {
            return Err(ContractError::DuplicateSessionId);
        }
        session.status = SessionStatus::Completed;
        session.completed_at = env.ledger().timestamp();
        save_session(&env, session_id.clone(), &session);
        env.events()
            .publish((Symbol::new(&env, "session_completed"),), session_id);
        Ok(())
    }

    pub fn approve_session(env: Env, session_id: Bytes32) -> Result<(), ContractError> {
        require_initialized(&env)?;
        let mut session =
            load_session(&env, session_id.clone()).ok_or(ContractError::SessionNotFound)?;
        session.buyer.require_auth();
        if session.status != SessionStatus::Completed {
            return Err(ContractError::InvalidSessionStatus);
        }
        let (payout, fee) = apply_fee(&env, session.amount);
        let token_addr =
            read_payment_token(&env).ok_or(ContractError::PaymentTokenNotConfigured)?;
        let token = token::Client::new(&env, &token_addr);
        let contract = env.current_contract_address();
        token.transfer(&contract, &session.seller, &payout);
        transfer_treasury_fee(&env, &token, fee)?;
        session.status = SessionStatus::Approved;
        save_session(&env, session_id.clone(), &session);
        env.events().publish(
            (Symbol::new(&env, "session_approved"),),
            (session_id, payout, fee),
        );
        Ok(())
    }

    pub fn refund_session(env: Env, session_id: Bytes32) -> Result<(), ContractError> {
        require_initialized(&env)?;
        let mut session =
            load_session(&env, session_id.clone()).ok_or(ContractError::SessionNotFound)?;
        session.buyer.require_auth();
        if session.status == SessionStatus::Refunded {
            return Err(ContractError::DuplicateSessionId);
        }
        if session.status != SessionStatus::Locked {
            return Err(ContractError::InvalidSessionStatus);
        }
        let token_addr =
            read_payment_token(&env).ok_or(ContractError::PaymentTokenNotConfigured)?;
        let token = token::Client::new(&env, &token_addr);
        token.transfer(
            &env.current_contract_address(),
            &session.buyer,
            &session.amount,
        );
        session.status = SessionStatus::Refunded;
        save_session(&env, session_id.clone(), &session);
        env.events().publish(
            (Symbol::new(&env, "SessionRefunded"),),
            (session_id, session.amount),
        );
        Ok(())
    }

    pub fn open_dispute(
        env: Env,
        session_id: Bytes32,
        reason: String,
    ) -> Result<(), ContractError> {
        require_initialized(&env)?;
        let mut session =
            load_session(&env, session_id.clone()).ok_or(ContractError::SessionNotFound)?;
        if session.status != SessionStatus::Completed
            && session.status != SessionStatus::Locked
        {
            return Err(ContractError::InvalidSessionStatus);
        }
        session.buyer.require_auth();
        session.status = SessionStatus::Disputed;
        session.dispute_opened_at = env.ledger().timestamp();
        save_session(&env, session_id.clone(), &session);
        env.events().publish(
            (Symbol::new(&env, "DisputeOpened"),),
            (session_id, reason),
        );
        Ok(())
    }

    pub fn resolve_dispute(
        env: Env,
        session_id: Bytes32,
        resolution: u32,
        buyer_share: i128,
        seller_share: i128,
    ) -> Result<(), ContractError> {
        require_initialized(&env)?;
        require_admin(&env)?;
        let mut session =
            load_session(&env, session_id.clone()).ok_or(ContractError::SessionNotFound)?;
        if session.status != SessionStatus::Disputed {
            return Err(ContractError::InvalidSessionStatus);
        }
        if buyer_share < 0
            || seller_share < 0
            || buyer_share
                .checked_add(seller_share)
                .map_or(true, |total| total != session.amount)
        {
            return Err(ContractError::InvalidShares);
        }
        match resolution {
            0 | 1 | 2 => {}
            _ => return Err(ContractError::InvalidResolution),
        }
        if resolution == 0 && (buyer_share != session.amount || seller_share != 0) {
            return Err(ContractError::InvalidShares);
        }
        if resolution == 1 && (seller_share != session.amount || buyer_share != 0) {
            return Err(ContractError::InvalidShares);
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
        if buyer_payout > 0 {
            token.transfer(&contract, &session.buyer, &buyer_payout);
        }
        if seller_payout > 0 {
            token.transfer(&contract, &session.seller, &seller_payout);
        }
        transfer_treasury_fee(&env, &token, fee)?;

        session.status = SessionStatus::Resolved;
        session.dispute_resolved_at = env.ledger().timestamp();
        save_session(&env, session_id.clone(), &session);
        env.events().publish(
            (Symbol::new(&env, "DisputeResolved"),),
            (session_id, resolution, buyer_share, seller_share),
        );
        Ok(())
    }

    pub fn auto_refund(env: Env, session_id: Bytes32) -> Result<(), ContractError> {
        require_initialized(&env)?;
        let mut session =
            load_session(&env, session_id.clone()).ok_or(ContractError::SessionNotFound)?;
        if session.status != SessionStatus::Completed {
            return Err(ContractError::InvalidSessionStatus);
        }
        let deadline = session
            .completed_at
            .checked_add(read_dispute_window(&env) as u64)
            .ok_or(ContractError::InvalidSessionStatus)?;
        if env.ledger().timestamp() <= deadline {
            return Err(ContractError::InvalidSessionStatus);
        }
        let token_addr =
            read_payment_token(&env).ok_or(ContractError::PaymentTokenNotConfigured)?;
        let token = token::Client::new(&env, &token_addr);
        token.transfer(
            &env.current_contract_address(),
            &session.buyer,
            &session.amount,
        );
        session.status = SessionStatus::Refunded;
        save_session(&env, session_id.clone(), &session);
        env.events().publish(
            (Symbol::new(&env, "AutoRefundExecuted"),),
            (session_id, session.amount),
        );
        Ok(())
    }

    pub fn get_session(env: Env, session_id: Bytes32) -> Option<Session> {
        assert_initialized(&env);
        load_session(&env, session_id)
    }
}

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn apply_fee_zero_fee() {
        let env = Env::default();
        let contract = env.register(SkillssyncEscrow, ());
        env.as_contract(&contract, || {
            env.storage()
                .persistent()
                .set(&DataKey::PlatformFeeBps, &0u32);
            assert_eq!(apply_fee(&env, 10_000), (10_000, 0));
        });
    }

    #[test]
    fn apply_fee_max_fee() {
        let env = Env::default();
        let contract = env.register(SkillssyncEscrow, ());
        env.as_contract(&contract, || {
            env.storage()
                .persistent()
                .set(&DataKey::PlatformFeeBps, &MAX_PLATFORM_FEE_BPS);
            assert_eq!(apply_fee(&env, 10_001), (9_001, 1_000));
        });
    }

    #[test]
    fn apply_fee_rounding() {
        let env = Env::default();
        let contract = env.register(SkillssyncEscrow, ());
        env.as_contract(&contract, || {
            env.storage()
                .persistent()
                .set(&DataKey::PlatformFeeBps, &100u32);
            assert_eq!(apply_fee(&env, 49), (49, 0));
            assert_eq!(apply_fee(&env, 10_001), (9_901, 100));
        });
    }
}

#[cfg(test)]
mod escrow_tests {
    use super::*;
    use soroban_sdk::{
        testutils::{Address as _, Events, Ledger},
        IntoVal, TryFromVal, Val, Vec,
    };

    const AMOUNT: i128 = 10_000;

    struct Setup {
        env: Env,
        contract_id: Address,
        client: SkillssyncEscrowClient<'static>,
        admin: Address,
        treasury: Address,
    }

    fn setup_uninitialized() -> Setup {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(SkillssyncEscrow, ());
        let client = SkillssyncEscrowClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        Setup {
            env,
            contract_id,
            client,
            admin,
            treasury,
        }
    }

    fn setup_initialized() -> Setup {
        let s = setup_uninitialized();
        s.client.initialize(&s.admin, &s.treasury);
        s
    }

    struct Market {
        token: token::Client<'static>,
        buyer: Address,
        seller: Address,
    }

    fn setup_market(s: &Setup) -> Market {
        let sac = s.env.register_stellar_asset_contract_v2(s.admin.clone());
        let token_addr = sac.address();
        s.client.set_payment_token(&token_addr);
        let buyer = Address::generate(&s.env);
        let seller = Address::generate(&s.env);
        token::StellarAssetClient::new(&s.env, &token_addr).mint(&buyer, &AMOUNT);
        Market {
            token: token::Client::new(&s.env, &token_addr),
            buyer,
            seller,
        }
    }

    fn session_id(env: &Env, seed: u8) -> Bytes32 {
        BytesN::from_array(env, &[seed; 32])
    }

    fn last_event(env: &Env, contract_id: &Address, name: &str) -> Option<Val> {
        let topics: Vec<Val> = (Symbol::new(env, name),).into_val(env);
        env.events()
            .all()
            .iter()
            .filter(|(addr, t, _)| addr == contract_id && *t == topics)
            .last()
            .map(|(_, _, data)| data)
    }

    // ---- initialize ----

    #[test]
    fn initialize_sets_admin_and_treasury() {
        let s = setup_initialized();
        assert_eq!(s.client.get_treasury(), Some(s.treasury.clone()));
        s.env.as_contract(&s.contract_id, || {
            assert_eq!(read_admin(&s.env), Some(s.admin.clone()));
            assert!(is_initialized(&s.env));
        });
    }

    #[test]
    fn initialize_twice_reverts_with_already_initialized() {
        let s = setup_initialized();
        let other = Address::generate(&s.env);
        assert_eq!(
            s.client.try_initialize(&other, &other),
            Err(Ok(ContractError::AlreadyInitialized))
        );
        assert_eq!(s.client.get_treasury(), Some(s.treasury.clone()));
        s.env.as_contract(&s.contract_id, || {
            assert_eq!(read_admin(&s.env), Some(s.admin.clone()));
        });
    }

    #[test]
    fn initialize_emits_initialized_event() {
        let s = setup_uninitialized();
        s.client.initialize(&s.admin, &s.treasury);
        let data = last_event(&s.env, &s.contract_id, "Initialized")
            .expect("Initialized event not emitted");
        let (admin, treasury) = <(Address, Address)>::try_from_val(&s.env, &data).unwrap();
        assert_eq!(admin, s.admin);
        assert_eq!(treasury, s.treasury);
    }

    #[test]
    fn entry_points_revert_when_uninitialized() {
        let s = setup_uninitialized();
        let env = &s.env;
        let c = &s.client;
        let id = session_id(env, 1);
        let addr = Address::generate(env);

        assert_eq!(
            c.try_set_payment_token(&addr),
            Err(Ok(ContractError::NotInitialized))
        );
        assert_eq!(
            c.try_set_platform_fee(&50),
            Err(Ok(ContractError::NotInitialized))
        );
        assert_eq!(
            c.try_set_treasury(&addr),
            Err(Ok(ContractError::NotInitialized))
        );
        assert_eq!(
            c.try_lock_funds(&id, &addr, &addr, &AMOUNT),
            Err(Ok(ContractError::NotInitialized))
        );
        assert_eq!(
            c.try_complete_session(&id),
            Err(Ok(ContractError::NotInitialized))
        );
        assert_eq!(
            c.try_approve_session(&id),
            Err(Ok(ContractError::NotInitialized))
        );
        assert_eq!(
            c.try_refund_session(&id),
            Err(Ok(ContractError::NotInitialized))
        );
        assert_eq!(
            c.try_open_dispute(&id, &String::from_str(env, "reason")),
            Err(Ok(ContractError::NotInitialized))
        );
        assert_eq!(
            c.try_resolve_dispute(&id, &0, &AMOUNT, &0),
            Err(Ok(ContractError::NotInitialized))
        );
        assert_eq!(
            c.try_auto_refund(&id),
            Err(Ok(ContractError::NotInitialized))
        );
        assert_eq!(
            c.try_get_payment_token(),
            Err(Ok(ContractError::NotInitialized))
        );
        assert_eq!(
            c.try_get_platform_fee(),
            Err(Ok(ContractError::NotInitialized))
        );
        assert_eq!(
            c.try_get_treasury(),
            Err(Ok(ContractError::NotInitialized))
        );
        assert_eq!(
            c.try_get_session(&id),
            Err(Ok(ContractError::NotInitialized))
        );
    }

    // ---- refunds ----

    #[test]
    fn buyer_can_refund_before_completion_with_full_amount() {
        let s = setup_initialized();
        let m = setup_market(&s);
        let id = session_id(&s.env, 1);
        assert!(s.client.get_platform_fee() > 0);

        s.client.lock_funds(&id, &m.buyer, &m.seller, &AMOUNT);
        assert_eq!(m.token.balance(&m.buyer), 0);

        s.client.refund_session(&id);

        assert_eq!(m.token.balance(&m.buyer), AMOUNT);
        assert_eq!(m.token.balance(&s.contract_id), 0);
        assert_eq!(m.token.balance(&s.treasury), 0);
        assert_eq!(m.token.balance(&m.seller), 0);
        assert_eq!(
            s.client.get_session(&id).unwrap().status,
            SessionStatus::Refunded
        );
    }

    #[test]
    fn refund_emits_session_refunded_event() {
        let s = setup_initialized();
        let m = setup_market(&s);
        let id = session_id(&s.env, 2);
        s.client.lock_funds(&id, &m.buyer, &m.seller, &AMOUNT);
        s.client.refund_session(&id);

        let data = last_event(&s.env, &s.contract_id, "SessionRefunded")
            .expect("SessionRefunded event not emitted");
        let (ev_id, ev_amount) = <(Bytes32, i128)>::try_from_val(&s.env, &data).unwrap();
        assert_eq!(ev_id, id);
        assert_eq!(ev_amount, AMOUNT);
    }

    #[test]
    fn refund_reverts_when_session_completed() {
        let s = setup_initialized();
        let m = setup_market(&s);
        let id = session_id(&s.env, 3);
        s.client.lock_funds(&id, &m.buyer, &m.seller, &AMOUNT);
        s.client.complete_session(&id);

        assert_eq!(
            s.client.try_refund_session(&id),
            Err(Ok(ContractError::InvalidSessionStatus))
        );
        assert_eq!(m.token.balance(&s.contract_id), AMOUNT);
    }

    #[test]
    fn refund_reverts_when_session_approved() {
        let s = setup_initialized();
        let m = setup_market(&s);
        let id = session_id(&s.env, 4);
        s.client.lock_funds(&id, &m.buyer, &m.seller, &AMOUNT);
        s.client.complete_session(&id);
        s.client.approve_session(&id);

        assert_eq!(
            s.client.try_refund_session(&id),
            Err(Ok(ContractError::InvalidSessionStatus))
        );
        assert_eq!(m.token.balance(&m.buyer), 0);
    }

    #[test]
    fn auto_refund_after_timeout_returns_full_amount() {
        let s = setup_initialized();
        let m = setup_market(&s);
        let id = session_id(&s.env, 5);
        s.client.lock_funds(&id, &m.buyer, &m.seller, &AMOUNT);
        s.client.complete_session(&id);

        let completed_at = s.client.get_session(&id).unwrap().completed_at;
        s.env
            .ledger()
            .set_timestamp(completed_at + DEFAULT_DISPUTE_WINDOW_LEDGERS as u64 + 1);
        s.client.auto_refund(&id);

        assert_eq!(m.token.balance(&m.buyer), AMOUNT);
        assert_eq!(m.token.balance(&s.treasury), 0);
        assert_eq!(m.token.balance(&s.contract_id), 0);
        assert_eq!(
            s.client.get_session(&id).unwrap().status,
            SessionStatus::Refunded
        );
    }

    #[test]
    fn auto_refund_reverts_before_timeout() {
        let s = setup_initialized();
        let m = setup_market(&s);
        let id = session_id(&s.env, 6);
        s.client.lock_funds(&id, &m.buyer, &m.seller, &AMOUNT);
        s.client.complete_session(&id);

        let completed_at = s.client.get_session(&id).unwrap().completed_at;
        s.env
            .ledger()
            .set_timestamp(completed_at + DEFAULT_DISPUTE_WINDOW_LEDGERS as u64);
        assert_eq!(
            s.client.try_auto_refund(&id),
            Err(Ok(ContractError::InvalidSessionStatus))
        );
        assert_eq!(m.token.balance(&s.contract_id), AMOUNT);
    }
}
