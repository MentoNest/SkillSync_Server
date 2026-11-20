#![no_std]

use soroban_sdk::{
    contract, contractclient, contracterror, contractimpl, contracttype, token, Address, BytesN,
    Env, String, Symbol,
};
type Bytes32 = BytesN<32>;

mod platform_controls;

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
    Oracle,
    PriceMaxAge,
    FallbackPrice(Bytes32),
    /// Off-chain metadata URI of a session (instance storage).
    Metadata(Bytes32),
}

/// Minimal price-oracle interface (SEP-40 style `lastprice`).
#[contractclient(name = "OracleClient")]
pub trait PriceOracle {
    /// Latest `(price, unix_timestamp)` for `asset`, if known.
    fn lastprice(env: Env, asset: Bytes32) -> Option<(i128, u64)>;
}

const DEFAULT_PRICE_MAX_AGE_SECS: u64 = 300;

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
    /// The token this session is denominated in (one token per session).
    pub token: Address,
    pub amount: i128,
    pub status: SessionStatus,
    pub created_at: u64,
    pub completed_at: u64,
    pub dispute_opened_at: u64,
    pub dispute_resolved_at: u64,
    /// Ledger sequence by which the session should be completed; parties can extend it.
    pub deadline: u32,
}

/// Every error the contract can return. Codes are grouped into ranges and
/// documented in `contract/ERRORS.md`:
///
/// | Range   | Group                          |
/// |---------|--------------------------------|
/// | 100–199 | initialization                 |
/// | 200–299 | authorization (legacy business errors live at 240–249) |
/// | 300–399 | session validation             |
/// | 400–499 | financial validation           |
/// | 500–599 | timeouts and disputes          |
/// | 600–699 | upgrades                       |
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
    /// No usable price: oracle unset/failed/stale and no admin fallback.
    PriceUnavailable = 11,
    /// A token transfer failed (insufficient balance or allowance).
    TransferFailed = 12,
}

impl ContractError {
    /// Human-readable description, for logs and client error mapping.
    pub fn message(&self) -> &'static str {
        match self {
            ContractError::AlreadyInitialized => "contract is already initialized",
            ContractError::Unauthorized => "caller is not authorized",
            ContractError::InvalidPlatformFee => "platform fee exceeds the maximum",
            ContractError::InvalidAmount => "amount must be positive",
            ContractError::DuplicateSessionId => "session id already exists",
            ContractError::SessionNotFound => "session not found",
            ContractError::InvalidSessionStatus => "operation not allowed in the session's status",
            ContractError::PaymentTokenNotConfigured => "payment token is not configured",
            ContractError::InvalidResolution => "unknown dispute resolution",
            ContractError::InvalidShares => "dispute shares must sum to the session amount",
            ContractError::PriceUnavailable => "no fresh price available",
            ContractError::TransferFailed => "token transfer failed",
        }
    }
}

fn read_admin(env: &Env) -> Option<Address> {
    env.storage().persistent().get(&DataKey::Admin)
}

fn require_admin(env: &Env) -> Result<Address, ContractError> {
    let admin = read_admin(env).ok_or(ContractError::NotInitialized)?;
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
    archive::is_archived(env, &session_id)
        || env
            .storage()
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

/// `token.transfer` that returns an error instead of aborting the invocation.
fn safe_transfer(
    token: &token::Client,
    from: &Address,
    to: &Address,
    amount: &i128,
) -> Result<(), ContractError> {
    match token.try_transfer(from, to, amount) {
        Ok(Ok(())) => Ok(()),
        _ => Err(ContractError::TransferFailed),
    }
}

fn transfer_treasury_fee(
    env: &Env,
    token: &token::Client,
    fee_amount: i128,
) -> Result<(), ContractError> {
    if fee_amount > 0 {
        let treasury = read_treasury(env).ok_or(ContractError::Unauthorized)?;
        safe_transfer(token, &env.current_contract_address(), &treasury, &fee_amount)?;
    }
    Ok(())
}

/// Price of `asset` from the oracle when it answers with a fresh value,
/// otherwise the admin-provided fallback price.
fn get_price(env: &Env, asset: Bytes32) -> Result<i128, ContractError> {
    if let Some(oracle) = env.storage().persistent().get::<_, Address>(&DataKey::Oracle) {
        let max_age = env
            .storage()
            .persistent()
            .get(&DataKey::PriceMaxAge)
            .unwrap_or(DEFAULT_PRICE_MAX_AGE_SECS);
        if let Ok(Ok(Some((price, timestamp)))) =
            OracleClient::new(env, &oracle).try_lastprice(&asset)
        {
            let now = env.ledger().timestamp();
            if price > 0 && timestamp <= now && now - timestamp <= max_age {
                return Ok(price);
            }
        }
    }
    env.storage()
        .persistent()
        .get::<_, i128>(&DataKey::FallbackPrice(asset))
        .filter(|price| *price > 0)
        .ok_or(ContractError::PriceUnavailable)
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
        let admin = require_admin(&env)?;
        if new_fee_bps > MAX_PLATFORM_FEE_BPS {
            return Err(ContractError::FeeTooHigh);
        }
        let old_fee_bps = read_platform_fee(&env);
        env.storage()
            .persistent()
            .set(&DataKey::PlatformFeeBps, &new_fee_bps);
        // PlatformFeeUpdated(old_fee_bps, new_fee_bps, updated_by)
        env.events().publish(
            (Symbol::new(&env, "PlatformFeeUpdated"),),
            (old_fee_bps, new_fee_bps, admin),
        );
        Ok(())
    }

    pub fn get_platform_fee(env: Env) -> u32 {
        assert_initialized(&env);
        read_platform_fee(&env)
    }

    pub fn set_treasury(env: Env, new_treasury: Address) -> Result<(), ContractError> {
        let admin = require_admin(&env)?;
        // `None` when no treasury was set before.
        let old_treasury = read_treasury(&env);
        env.storage()
            .persistent()
            .set(&DataKey::Treasury, &new_treasury);
        // TreasuryUpdated(old_treasury, new_treasury, updated_by)
        env.events().publish(
            (Symbol::new(&env, "TreasuryUpdated"),),
            (old_treasury, new_treasury, admin),
        );
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
        token_address: Address,
    ) -> Result<(), ContractError> {
        require_initialized(&env)?;
        if amount <= 0 {
            return Err(ContractError::InvalidAmount);
        }
        if session_exists(&env, session_id.clone()) {
            return Err(ContractError::DuplicateSessionId);
        }
        buyer.require_auth();
        let token = token::Client::new(&env, &token_address);
        // Pull the funds with the buyer's allowance to this contract.
        let contract = env.current_contract_address();
        match token.try_transfer_from(&contract, &buyer, &contract, &amount) {
            Ok(Ok(())) => {}
            _ => return Err(ContractError::TransferFailed),
        }
        let session = Session {
            buyer: buyer.clone(),
            seller: seller.clone(),
            token: token_address.clone(),
            amount,
            status: SessionStatus::Locked,
            created_at: env.ledger().timestamp(),
            completed_at: 0,
            dispute_opened_at: 0,
            dispute_resolved_at: 0,
            deadline: env.ledger().sequence()
                + platform_controls::DEFAULT_SESSION_DEADLINE_LEDGERS,
        };
        save_session(&env, session_id.clone(), &session);
        platform_controls::record_locked(&env, &session_id, amount);
        env.events().publish(
            (Symbol::new(&env, "funds_locked"),),
            (session_id, buyer, seller, amount, token_address),
        );
        Ok(())
    }

    pub fn complete_session(env: Env, session_id: Bytes32) -> Result<(), ContractError> {
        require_initialized(&env)?;
        let mut session =
            load_session(&env, session_id.clone()).ok_or(ContractError::SessionNotFound)?;
        session.seller.require_auth();
        match session.status {
            SessionStatus::Locked => {}
            SessionStatus::Completed => return Err(ContractError::SessionAlreadyCompleted),
            SessionStatus::Disputed => return Err(ContractError::SessionInDispute),
            _ => return Err(ContractError::InvalidSessionState),
        }
        session_limits::ensure_not_expired(&env, &session_id);
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
        match session.status {
            SessionStatus::Completed => {}
            SessionStatus::Approved => return Err(ContractError::SessionAlreadyApproved),
            SessionStatus::Disputed => return Err(ContractError::SessionInDispute),
            _ => return Err(ContractError::InvalidSessionState),
        }
        let _guard = settlement_extras::before_payout(
            &env,
            &session_id,
            settlement_extras::Payout::Approve,
        );
        let (payout, fee) = apply_fee(&env, session.amount);
        let token = token::Client::new(&env, &session.token);
        let contract = env.current_contract_address();
        safe_transfer(&token, &contract, &session.seller, &payout)?;
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
        match session.status {
            SessionStatus::Locked => {}
            SessionStatus::Refunded => return Err(ContractError::SessionAlreadyRefunded),
            SessionStatus::Disputed => return Err(ContractError::SessionInDispute),
            _ => return Err(ContractError::InvalidSessionState),
        }
        let token = token::Client::new(&env, &session.token);
        safe_transfer(
            &token,
            &env.current_contract_address(),
            &session.buyer,
            &session.amount,
        )?;
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
        match session.status {
            SessionStatus::Completed | SessionStatus::Locked => {}
            SessionStatus::Disputed => return Err(ContractError::DisputeAlreadyOpen),
            _ => return Err(ContractError::InvalidSessionState),
        }
        session.buyer.require_auth();
        session.status = SessionStatus::Disputed;
        let now = env.ledger().timestamp();
        session.dispute_opened_at = now;
        let opened_by = session.buyer.clone();
        save_session(&env, session_id.clone(), &session);
        // DisputeOpened(session_id, opened_by, reason, timestamp)
        env.events().publish(
            (Symbol::new(&env, "DisputeOpened"), session_id),
            (opened_by, reason, now),
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
        let resolver = require_admin(&env)?;
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

        let token = token::Client::new(&env, &session.token);
        let contract = env.current_contract_address();

        let _guard = settlement_extras::before_payout(
            &env,
            &session_id,
            settlement_extras::Payout::Resolve,
        );
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
        settlement_extras::record_buyer_payout(&env, &session_id, buyer_payout);
        if buyer_payout > 0 {
            safe_transfer(&token, &contract, &session.buyer, &buyer_payout)?;
        }
        if seller_payout > 0 {
            safe_transfer(&token, &contract, &session.seller, &seller_payout)?;
        }
        let fee = platform_controls::take_referrer_share(&env, &session_id, fee);
        transfer_treasury_fee(&env, &token, fee)?;

        session.status = SessionStatus::Resolved;
        let now = env.ledger().timestamp();
        session.dispute_resolved_at = now;
        save_session(&env, session_id.clone(), &session);
        // DisputeResolved(session_id, resolver, buyer_share, seller_share, fee, timestamp)
        env.events().publish(
            (Symbol::new(&env, "DisputeResolved"), session_id),
            (resolver, buyer_share, seller_share, fee, now),
        );
        Ok(())
    }

    pub fn auto_refund(env: Env, session_id: Bytes32) -> Result<(), ContractError> {
        require_initialized(&env)?;
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
        let token = token::Client::new(&env, &session.token);
        safe_transfer(
            &token,
            &env.current_contract_address(),
            &session.buyer,
            &session.amount,
        )?;
        session.status = SessionStatus::Refunded;
        save_session(&env, session_id.clone(), &session);
        env.events().publish(
            (Symbol::new(&env, "AutoRefundExecuted"),),
            (session_id, session.amount),
        );
        Ok(())
    }

    // ── price oracle (#1630) ────────────────────────────────────────────────

    pub fn set_oracle(env: Env, oracle_id: Address) -> Result<(), ContractError> {
        require_admin(&env)?;
        env.storage().persistent().set(&DataKey::Oracle, &oracle_id);
        Ok(())
    }

    /// Maximum age (seconds) of an oracle price before it counts as stale.
    pub fn set_price_max_age(env: Env, seconds: u64) -> Result<(), ContractError> {
        require_admin(&env)?;
        env.storage().persistent().set(&DataKey::PriceMaxAge, &seconds);
        Ok(())
    }

    /// Price used when the oracle is unset, failing or stale.
    pub fn set_fallback_price(env: Env, asset: Bytes32, price: i128) -> Result<(), ContractError> {
        require_admin(&env)?;
        if price <= 0 {
            return Err(ContractError::InvalidAmount);
        }
        env.storage()
            .persistent()
            .set(&DataKey::FallbackPrice(asset), &price);
        Ok(())
    }

    /// Read-only view of the price the contract would use for `asset`.
    pub fn quote_price(env: Env, asset: Bytes32) -> Result<i128, ContractError> {
        get_price(&env, asset)
    }

    // ── session metadata (#1632) ────────────────────────────────────────────

    /// Attach an off-chain metadata URI (IPFS hash, JSON, ...) to a session.
    /// Only the buyer or the seller may set it. Stored in instance storage.
    pub fn set_session_metadata(
        env: Env,
        session_id: Bytes32,
        caller: Address,
        metadata_uri: String,
    ) -> Result<(), ContractError> {
        let session =
            load_session(&env, session_id.clone()).ok_or(ContractError::SessionNotFound)?;
        caller.require_auth();
        if caller != session.buyer && caller != session.seller {
            return Err(ContractError::Unauthorized);
        }
        env.storage()
            .instance()
            .set(&DataKey::Metadata(session_id.clone()), &metadata_uri);
        env.events().publish(
            (Symbol::new(&env, "MetadataUpdated"), session_id),
            (caller, metadata_uri),
        );
        Ok(())
    }

    pub fn get_session_metadata(env: Env, session_id: Bytes32) -> Option<String> {
        env.storage().instance().get(&DataKey::Metadata(session_id))
    }

    pub fn get_session(env: Env, session_id: Bytes32) -> Option<Session> {
        assert_initialized(&env);
        load_session(&env, session_id)
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{symbol_short, testutils::{Address as _, Ledger as _}};

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

    // ── propagation, tokens, oracle, metadata (#1629–#1632) ─────────────────

    #[contract]
    pub struct MockOracle;

    #[contractimpl]
    impl MockOracle {
        pub fn lastprice(env: Env, _asset: Bytes32) -> Option<(i128, u64)> {
            env.storage().instance().get(&symbol_short!("p"))
        }
        pub fn set(env: Env, price: i128, timestamp: u64) {
            env.storage().instance().set(&symbol_short!("p"), &(price, timestamp));
        }
    }

    struct Fx {
        env: Env,
        id: Address,
        buyer: Address,
        seller: Address,
        token: Address,
    }

    fn fx() -> Fx {
        let env = Env::default();
        env.mock_all_auths();
        let id = env.register(SkillssyncEscrow, ());
        let admin = Address::generate(&env);
        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        env.as_contract(&id, || {
            env.storage().persistent().set(&DataKey::Admin, &admin);
        });
        let token = env
            .register_stellar_asset_contract_v2(Address::generate(&env))
            .address();
        token::StellarAssetClient::new(&env, &token).mint(&buyer, &1_000);
        token::Client::new(&env, &token).approve(&buyer, &id, &1_000, &10_000);
        Fx { env, id, buyer, seller, token }
    }

    fn sid(env: &Env, n: u8) -> Bytes32 {
        BytesN::from_array(env, &[n; 32])
    }

    #[test]
    fn lock_funds_records_the_token_and_pays_out_in_it() {
        let f = fx();
        let client = SkillssyncEscrowClient::new(&f.env, &f.id);
        let a = sid(&f.env, 1);
        client.lock_funds(&a, &f.buyer, &f.seller, &100, &f.token);
        assert_eq!(client.get_session(&a).unwrap().token, f.token);
        client.complete_session(&a);
        client.approve_session(&a);
        assert_eq!(token::Client::new(&f.env, &f.token).balance(&f.seller), 99);
    }

    #[test]
    fn every_error_code_is_returned_in_practice() {
        let f = fx();
        let client = SkillssyncEscrowClient::new(&f.env, &f.id);
        let a = sid(&f.env, 1);
        assert_eq!(
            client.try_lock_funds(&a, &f.buyer, &f.seller, &0, &f.token),
            Err(Ok(ContractError::InvalidAmount))
        );
        assert_eq!(client.try_complete_session(&a), Err(Ok(ContractError::SessionNotFound)));
        client.lock_funds(&a, &f.buyer, &f.seller, &100, &f.token);
        assert_eq!(
            client.try_lock_funds(&a, &f.buyer, &f.seller, &100, &f.token),
            Err(Ok(ContractError::DuplicateSessionId))
        );
        assert_eq!(client.try_approve_session(&a), Err(Ok(ContractError::InvalidSessionStatus)));
        assert_eq!(client.try_set_platform_fee(&1_001), Err(Ok(ContractError::InvalidPlatformFee)));
        client.open_dispute(&a, &String::from_str(&f.env, "x"));
        assert_eq!(client.try_resolve_dispute(&a, &7, &50, &50), Err(Ok(ContractError::InvalidResolution)));
        assert_eq!(client.try_resolve_dispute(&a, &2, &10, &10), Err(Ok(ContractError::InvalidShares)));
        // Not enough allowance/balance: a typed error, not an abort.
        let b = sid(&f.env, 2);
        assert_eq!(
            client.try_lock_funds(&b, &f.buyer, &f.seller, &5_000, &f.token),
            Err(Ok(ContractError::TransferFailed))
        );
    }

    #[test]
    fn error_messages_are_readable() {
        assert_eq!(ContractError::SessionNotFound.message(), "session not found");
        assert_eq!(ContractError::TransferFailed.message(), "token transfer failed");
    }

    #[test]
    fn metadata_is_settable_by_the_parties_only() {
        let f = fx();
        let client = SkillssyncEscrowClient::new(&f.env, &f.id);
        let a = sid(&f.env, 1);
        client.lock_funds(&a, &f.buyer, &f.seller, &100, &f.token);
        let uri = String::from_str(&f.env, "ipfs://Qm123");
        assert_eq!(client.get_session_metadata(&a), None);
        client.set_session_metadata(&a, &f.seller, &uri);
        assert_eq!(client.get_session_metadata(&a), Some(uri.clone()));
        let stranger = Address::generate(&f.env);
        assert_eq!(
            client.try_set_session_metadata(&a, &stranger, &uri),
            Err(Ok(ContractError::Unauthorized))
        );
    }

    #[test]
    fn oracle_price_is_used_when_fresh_and_the_fallback_when_not() {
        let f = fx();
        let client = SkillssyncEscrowClient::new(&f.env, &f.id);
        let asset = sid(&f.env, 9);
        assert_eq!(client.try_quote_price(&asset), Err(Ok(ContractError::PriceUnavailable)));

        let oracle = f.env.register(MockOracle, ());
        let mock = MockOracleClient::new(&f.env, &oracle);
        client.set_oracle(&oracle);
        f.env.ledger().with_mut(|l| l.timestamp = 10_000);

        mock.set(&250, &9_900);
        assert_eq!(client.quote_price(&asset), 250);

        // Stale oracle price and no fallback: unavailable.
        mock.set(&250, &1_000);
        assert_eq!(client.try_quote_price(&asset), Err(Ok(ContractError::PriceUnavailable)));

        // The admin fallback is used instead.
        client.set_fallback_price(&asset, &300);
        assert_eq!(client.quote_price(&asset), 300);
    }
}
