#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, token, Address, BytesN, Env, String,
    Symbol,
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
    // Existing codes, unchanged until the initialization/authorization ranges
    // (100-103, 200-203) are introduced separately.
    AlreadyInitialized = 1,
    Unauthorized = 2,
    PaymentTokenNotConfigured = 8,
    InvalidResolution = 9,

    // ── Session validation: 300–306 ─────────────────────────────────────────
    /// The session ID does not exist.
    SessionNotFound = 300,
    /// The session ID already exists.
    DuplicateSessionId = 301,
    /// The operation is not allowed in the session's current state.
    InvalidSessionState = 302,
    /// The session is already completed; it cannot be completed again.
    SessionAlreadyCompleted = 303,
    /// The session is already approved; it cannot be approved twice.
    SessionAlreadyApproved = 304,
    /// The session is already refunded.
    SessionAlreadyRefunded = 305,
    /// The session is in dispute; this action is not possible meanwhile.
    SessionInDispute = 306,

    // ── Financial validation: 400–404 ───────────────────────────────────────
    /// The amount is zero or negative.
    InvalidAmount = 400,
    /// The buyer has insufficient funds.
    InsufficientBalance = 401,
    /// The fee exceeds the 1000 bps maximum.
    FeeTooHigh = 402,
    /// The dispute split does not sum to the session amount.
    InvalidSplit = 403,
    /// Arithmetic overflow detected.
    Overflow = 404,

    // ── Timeouts and disputes: 500–503 ──────────────────────────────────────
    /// The dispute window has not elapsed, so there is no auto-refund yet.
    DisputeWindowNotElapsed = 500,
    /// A dispute already exists for the session.
    DisputeAlreadyOpen = 501,
    /// There is no open dispute to resolve.
    DisputeNotOpen = 502,
    /// The session is not eligible for resolution.
    ResolutionNotAllowed = 503,

    // ── Upgrades: 600–601 ───────────────────────────────────────────────────
    /// The provided WASM hash is zero or invalid.
    InvalidWasmHash = 600,
    /// A low-level upgrade failure.
    UpgradeFailed = 601,
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
    pub fn set_payment_token(env: Env, token: Address) -> Result<(), ContractError> {
        require_admin(&env)?;
        env.storage().persistent().set(&DataKey::PaymentToken, &token);
        env.events()
            .publish((Symbol::new(&env, "payment_token_updated"),), token);
        Ok(())
    }

    pub fn get_payment_token(env: Env) -> Option<Address> {
        read_payment_token(&env)
    }

    pub fn set_platform_fee(env: Env, new_fee_bps: u32) -> Result<(), ContractError> {
        require_admin(&env)?;
        if new_fee_bps > MAX_PLATFORM_FEE_BPS {
            return Err(ContractError::FeeTooHigh);
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
        read_platform_fee(&env)
    }

    pub fn set_treasury(env: Env, new_treasury: Address) -> Result<(), ContractError> {
        require_admin(&env)?;
        env.storage()
            .persistent()
            .set(&DataKey::Treasury, &new_treasury);
        env.events()
            .publish((Symbol::new(&env, "treasury_updated"),), new_treasury);
        Ok(())
    }

    pub fn get_treasury(env: Env) -> Option<Address> {
        read_treasury(&env)
    }

    pub fn lock_funds(
        env: Env,
        session_id: Bytes32,
        buyer: Address,
        seller: Address,
        amount: i128,
    ) -> Result<(), ContractError> {
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
        if token.balance(&buyer) < amount {
            return Err(ContractError::InsufficientBalance);
        }
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
        let mut session =
            load_session(&env, session_id.clone()).ok_or(ContractError::SessionNotFound)?;
        session.seller.require_auth();
        match session.status {
            SessionStatus::Locked => {}
            SessionStatus::Completed => return Err(ContractError::SessionAlreadyCompleted),
            SessionStatus::Disputed => return Err(ContractError::SessionInDispute),
            _ => return Err(ContractError::InvalidSessionState),
        }
        session.status = SessionStatus::Completed;
        session.completed_at = env.ledger().timestamp();
        save_session(&env, session_id.clone(), &session);
        env.events()
            .publish((Symbol::new(&env, "session_completed"),), session_id);
        Ok(())
    }

    pub fn approve_session(env: Env, session_id: Bytes32) -> Result<(), ContractError> {
        let mut session =
            load_session(&env, session_id.clone()).ok_or(ContractError::SessionNotFound)?;
        session.buyer.require_auth();
        match session.status {
            SessionStatus::Completed => {}
            SessionStatus::Approved => return Err(ContractError::SessionAlreadyApproved),
            SessionStatus::Disputed => return Err(ContractError::SessionInDispute),
            _ => return Err(ContractError::InvalidSessionState),
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
        let mut session =
            load_session(&env, session_id.clone()).ok_or(ContractError::SessionNotFound)?;
        session.buyer.require_auth();
        match session.status {
            SessionStatus::Locked => {}
            SessionStatus::Refunded => return Err(ContractError::SessionAlreadyRefunded),
            SessionStatus::Disputed => return Err(ContractError::SessionInDispute),
            _ => return Err(ContractError::InvalidSessionState),
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
            (Symbol::new(&env, "session_refunded"),),
            (session_id, session.amount),
        );
        Ok(())
    }

    pub fn open_dispute(
        env: Env,
        session_id: Bytes32,
        reason: String,
    ) -> Result<(), ContractError> {
        let mut session =
            load_session(&env, session_id.clone()).ok_or(ContractError::SessionNotFound)?;
        match session.status {
            SessionStatus::Completed | SessionStatus::Locked => {}
            SessionStatus::Disputed => return Err(ContractError::DisputeAlreadyOpen),
            _ => return Err(ContractError::InvalidSessionState),
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
        require_admin(&env)?;
        let mut session =
            load_session(&env, session_id.clone()).ok_or(ContractError::SessionNotFound)?;
        match session.status {
            SessionStatus::Disputed => {}
            SessionStatus::Resolved => return Err(ContractError::ResolutionNotAllowed),
            _ => return Err(ContractError::DisputeNotOpen),
        }
        if buyer_share < 0
            || seller_share < 0
            || buyer_share
                .checked_add(seller_share)
                .map_or(true, |total| total != session.amount)
        {
            return Err(ContractError::InvalidSplit);
        }
        match resolution {
            0 | 1 | 2 => {}
            _ => return Err(ContractError::InvalidResolution),
        }
        if resolution == 0 && (buyer_share != session.amount || seller_share != 0) {
            return Err(ContractError::InvalidSplit);
        }
        if resolution == 1 && (seller_share != session.amount || buyer_share != 0) {
            return Err(ContractError::InvalidSplit);
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
                .ok_or(ContractError::Overflow)?
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
        let mut session =
            load_session(&env, session_id.clone()).ok_or(ContractError::SessionNotFound)?;
        match session.status {
            SessionStatus::Completed => {}
            SessionStatus::Disputed => return Err(ContractError::SessionInDispute),
            SessionStatus::Refunded => return Err(ContractError::SessionAlreadyRefunded),
            _ => return Err(ContractError::InvalidSessionState),
        }
        let deadline = session
            .completed_at
            .checked_add(read_dispute_window(&env) as u64)
            .ok_or(ContractError::Overflow)?;
        if env.ledger().timestamp() <= deadline {
            return Err(ContractError::DisputeWindowNotElapsed);
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
        load_session(&env, session_id)
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::testutils::Address as _;

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

    // ── error groups (#1625–#1628) ──────────────────────────────────────────

    struct Fixture<'a> {
        env: Env,
        client: SkillssyncEscrowClient<'a>,
        buyer: Address,
        seller: Address,
    }

    fn fixture<'a>() -> Fixture<'a> {
        let env = Env::default();
        env.mock_all_auths();
        let id = env.register(SkillssyncEscrow, ());
        let client = SkillssyncEscrowClient::new(&env, &id);
        let admin = Address::generate(&env);
        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        env.as_contract(&id, || {
            env.storage().persistent().set(&DataKey::Admin, &admin);
        });
        let token_admin = Address::generate(&env);
        let token = env.register_stellar_asset_contract_v2(token_admin);
        token::StellarAssetClient::new(&env, &token.address()).mint(&buyer, &1_000);
        client.set_payment_token(&token.address());
        // SAFETY of lifetimes: the client borrows the env clone below.
        let env2 = env.clone();
        let client = SkillssyncEscrowClient::new(&env2, &id);
        Fixture { env: env2, client, buyer, seller }
    }

    fn sid(env: &Env, n: u8) -> Bytes32 {
        BytesN::from_array(env, &[n; 32])
    }

    #[test]
    fn session_validation_errors() {
        let f = fixture();
        let a = sid(&f.env, 1);
        assert_eq!(f.client.try_complete_session(&a), Err(Ok(ContractError::SessionNotFound)));
        f.client.lock_funds(&a, &f.buyer, &f.seller, &100);
        assert_eq!(
            f.client.try_lock_funds(&a, &f.buyer, &f.seller, &100),
            Err(Ok(ContractError::DuplicateSessionId))
        );
        f.client.complete_session(&a);
        assert_eq!(f.client.try_complete_session(&a), Err(Ok(ContractError::SessionAlreadyCompleted)));
        f.client.approve_session(&a);
        assert_eq!(f.client.try_approve_session(&a), Err(Ok(ContractError::SessionAlreadyApproved)));
        assert_eq!(f.client.try_refund_session(&a), Err(Ok(ContractError::InvalidSessionState)));

        let b = sid(&f.env, 2);
        f.client.lock_funds(&b, &f.buyer, &f.seller, &100);
        f.client.refund_session(&b);
        assert_eq!(f.client.try_refund_session(&b), Err(Ok(ContractError::SessionAlreadyRefunded)));

        let c = sid(&f.env, 3);
        f.client.lock_funds(&c, &f.buyer, &f.seller, &100);
        f.client.open_dispute(&c, &String::from_str(&f.env, "late"));
        assert_eq!(f.client.try_complete_session(&c), Err(Ok(ContractError::SessionInDispute)));
        assert_eq!(f.client.try_approve_session(&c), Err(Ok(ContractError::SessionInDispute)));
    }

    #[test]
    fn financial_validation_errors() {
        let f = fixture();
        assert_eq!(
            f.client.try_lock_funds(&sid(&f.env, 1), &f.buyer, &f.seller, &0),
            Err(Ok(ContractError::InvalidAmount))
        );
        assert_eq!(
            f.client.try_lock_funds(&sid(&f.env, 1), &f.buyer, &f.seller, &5_000),
            Err(Ok(ContractError::InsufficientBalance))
        );
        assert_eq!(f.client.try_set_platform_fee(&1_001), Err(Ok(ContractError::FeeTooHigh)));

        let a = sid(&f.env, 2);
        f.client.lock_funds(&a, &f.buyer, &f.seller, &100);
        f.client.open_dispute(&a, &String::from_str(&f.env, "x"));
        assert_eq!(
            f.client.try_resolve_dispute(&a, &2, &30, &30),
            Err(Ok(ContractError::InvalidSplit))
        );
    }

    #[test]
    fn dispute_and_timeout_errors() {
        let f = fixture();
        let a = sid(&f.env, 1);
        f.client.lock_funds(&a, &f.buyer, &f.seller, &100);
        assert_eq!(
            f.client.try_resolve_dispute(&a, &2, &50, &50),
            Err(Ok(ContractError::DisputeNotOpen))
        );
        f.client.open_dispute(&a, &String::from_str(&f.env, "x"));
        assert_eq!(
            f.client.try_open_dispute(&a, &String::from_str(&f.env, "y")),
            Err(Ok(ContractError::DisputeAlreadyOpen))
        );
        f.client.resolve_dispute(&a, &2, &50, &50);
        assert_eq!(
            f.client.try_resolve_dispute(&a, &2, &50, &50),
            Err(Ok(ContractError::ResolutionNotAllowed))
        );

        let b = sid(&f.env, 2);
        f.client.lock_funds(&b, &f.buyer, &f.seller, &100);
        f.client.complete_session(&b);
        assert_eq!(
            f.client.try_auto_refund(&b),
            Err(Ok(ContractError::DisputeWindowNotElapsed))
        );
    }
}
