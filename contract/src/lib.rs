#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, token, Address,
    BytesN, Env, String, Symbol,
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
    // ── Initialization: 100–103 ─────────────────────────────────────────────
    /// The contract is already initialized.
    AlreadyInitialized = 100,
    /// The contract has not been initialized yet.
    NotInitialized = 101,
    /// The admin address is zero or invalid.
    InvalidAdmin = 102,
    /// The treasury address is zero or invalid (or not configured).
    InvalidTreasury = 103,

    // ── Authorization: 200–203 ──────────────────────────────────────────────
    /// Generic unauthorized access.
    Unauthorized = 200,
    /// The caller is not the contract admin.
    NotAdmin = 201,
    /// The caller is not the session buyer.
    NotBuyer = 202,
    /// The caller is not the session seller.
    NotSeller = 203,

    // ── Upgrades: 600 ───────────────────────────────────────────────────────
    /// The provided WASM hash is zero or invalid.
    InvalidWasmHash = 600,

    // ── Existing business errors, renumbered into a reserved block (240–247).
    // They are re-homed into the 300/400/500 groups by the session, financial
    // and dispute error work.
    InvalidPlatformFee = 240,
    InvalidAmount = 241,
    DuplicateSessionId = 242,
    SessionNotFound = 243,
    InvalidSessionStatus = 244,
    PaymentTokenNotConfigured = 245,
    InvalidResolution = 246,
    InvalidShares = 247,
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

fn transfer_treasury_fee(
    env: &Env,
    token: &token::Client,
    fee_amount: i128,
) -> Result<(), ContractError> {
    if fee_amount > 0 {
        let treasury = read_treasury(env).ok_or(ContractError::InvalidTreasury)?;
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
    ) -> Result<(), ContractError> {
        require_initialized(&env)?;
        if amount <= 0 {
            return Err(ContractError::InvalidAmount);
        }
        if session_exists(&env, session_id.clone()) {
            return Err(ContractError::DuplicateSessionId);
        }
        buyer.require_auth();
        session_limits::enforce_rate_limit(&env, &buyer);
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
            deadline: env.ledger().sequence()
                + platform_controls::DEFAULT_SESSION_DEADLINE_LEDGERS,
        };
        save_session(&env, session_id.clone(), &session);
        platform_controls::record_locked(&env, &session_id, amount);
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
        let token_addr =
            read_payment_token(&env).ok_or(ContractError::PaymentTokenNotConfigured)?;
        let token = token::Client::new(&env, &token_addr);
        let contract = env.current_contract_address();
        token.transfer(&contract, &session.seller, &payout);
        let fee = platform_controls::take_referrer_share(&env, &session_id, fee);
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
        let _guard = settlement_extras::before_payout(
            &env,
            &session_id,
            settlement_extras::Payout::Refund,
        );
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

        let token_addr =
            read_payment_token(&env).ok_or(ContractError::PaymentTokenNotConfigured)?;
        let token = token::Client::new(&env, &token_addr);
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
            token.transfer(&contract, &session.buyer, &buyer_payout);
        }
        if seller_payout > 0 {
            token.transfer(&contract, &session.seller, &seller_payout);
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
        let _guard = settlement_extras::before_payout(
            &env,
            &session_id,
            settlement_extras::Payout::Refund,
        );
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

    /// Replace the contract's WASM (admin only) and emit `ContractUpgraded`
    /// with topics `(name,)` and data `(old_wasm_hash, new_wasm_hash,
    /// upgraded_by, timestamp)`. The old hash is the one recorded by the
    /// previous `upgrade` call, or all zeros for the first upgrade.
    pub fn upgrade(env: Env, new_wasm_hash: Bytes32) -> Result<(), ContractError> {
        let admin = require_admin(&env)?;
        let zero = BytesN::from_array(&env, &[0u8; 32]);
        if new_wasm_hash == zero {
            return Err(ContractError::InvalidWasmHash);
        }
        let old_wasm_hash: Bytes32 = env
            .storage()
            .persistent()
            .get(&DataKey::WasmHash)
            .unwrap_or(zero);
        env.deployer()
            .update_current_contract_wasm(new_wasm_hash.clone());
        env.storage()
            .persistent()
            .set(&DataKey::WasmHash, &new_wasm_hash);
        env.events().publish(
            (Symbol::new(&env, "ContractUpgraded"),),
            (old_wasm_hash, new_wasm_hash, admin, env.ledger().timestamp()),
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

    // ── error codes and upgrade (#1621–#1624) ───────────────────────────────

    #[test]
    fn error_codes_match_the_documented_ranges() {
        assert_eq!(ContractError::AlreadyInitialized as u32, 100);
        assert_eq!(ContractError::NotInitialized as u32, 101);
        assert_eq!(ContractError::InvalidAdmin as u32, 102);
        assert_eq!(ContractError::InvalidTreasury as u32, 103);
        assert_eq!(ContractError::Unauthorized as u32, 200);
        assert_eq!(ContractError::NotAdmin as u32, 201);
        assert_eq!(ContractError::NotBuyer as u32, 202);
        assert_eq!(ContractError::NotSeller as u32, 203);
        assert_eq!(ContractError::InvalidWasmHash as u32, 600);
    }

    #[test]
    fn admin_calls_before_initialization_return_not_initialized() {
        let env = Env::default();
        env.mock_all_auths();
        let id = env.register(SkillssyncEscrow, ());
        let client = SkillssyncEscrowClient::new(&env, &id);
        assert_eq!(
            client.try_set_platform_fee(&10),
            Err(Ok(ContractError::NotInitialized))
        );
    }

    #[test]
    fn upgrade_rejects_a_zero_wasm_hash() {
        let env = Env::default();
        env.mock_all_auths();
        let id = env.register(SkillssyncEscrow, ());
        let client = SkillssyncEscrowClient::new(&env, &id);
        let admin = soroban_sdk::Address::generate(&env);
        env.as_contract(&id, || {
            env.storage().persistent().set(&DataKey::Admin, &admin);
        });
        let zero = BytesN::from_array(&env, &[0u8; 32]);
        assert_eq!(
            client.try_upgrade(&zero),
            Err(Ok(ContractError::InvalidWasmHash))
        );
    }
}
