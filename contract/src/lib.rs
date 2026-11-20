#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, token, Address, Bytes, BytesN, Env,
    IntoVal, String, Symbol, Val, Vec,
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
    Webhook,
    /// Whether `account` holds `role`.
    Role(Bytes32, Address),
    Vesting(Bytes32),
}

/// Linear vesting with an optional cliff, in ledger sequence numbers.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Vesting {
    pub total: i128,
    pub claimed: i128,
    pub start_ledger: u32,
    pub cliff_ledgers: u32,
    pub duration_ledgers: u32,
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
    /// The caller does not hold the required role.
    MissingRole = 11,
    /// Nothing has vested beyond what was already claimed.
    NothingToClaim = 12,
    /// Invalid vesting schedule (zero duration or cliff longer than duration).
    InvalidVesting = 13,
    /// The session is vesting and cannot use this operation.
    SessionIsVesting = 14,
}

fn read_admin(env: &Env) -> Option<Address> {
    env.storage().persistent().get(&DataKey::Admin)
}

fn require_admin(env: &Env) -> Result<Address, ContractError> {
    let admin = read_admin(env).ok_or(ContractError::NotInitialized)?;
    admin.require_auth();
    Ok(admin)
}

fn role_hash(env: &Env, name: &[u8]) -> Bytes32 {
    env.crypto().sha256(&Bytes::from_slice(env, name)).to_bytes()
}

fn default_admin_role(env: &Env) -> Bytes32 {
    BytesN::from_array(env, &[0u8; 32])
}

fn holds_role(env: &Env, role: &Bytes32, account: &Address) -> bool {
    if env
        .storage()
        .persistent()
        .get::<_, bool>(&DataKey::Role(role.clone(), account.clone()))
        .unwrap_or(false)
    {
        return true;
    }
    // The stored admin always holds DEFAULT_ADMIN_ROLE.
    *role == default_admin_role(env) && read_admin(env).as_ref() == Some(account)
}

/// `only_role` guard: authenticates `caller` and requires it to hold `role`
/// (or `DEFAULT_ADMIN_ROLE`, which administers every role).
fn only_role(env: &Env, role: &Bytes32, caller: &Address) -> Result<(), ContractError> {
    caller.require_auth();
    if holds_role(env, role, caller) || holds_role(env, &default_admin_role(env), caller) {
        Ok(())
    } else {
        Err(ContractError::MissingRole)
    }
}

/// Structured relay event for the off-chain webhook indexer (#1633): topics
/// `("relay", session_id)`, data `(event_type, payload)`.
fn relay<T: IntoVal<Env, Val>>(env: &Env, session_id: &Bytes32, event_type: &str, payload: T) {
    env.events().publish(
        (Symbol::new(env, "relay"), session_id.clone()),
        (Symbol::new(env, event_type), payload),
    );
}

fn vested_amount(v: &Vesting, now_ledger: u32) -> Result<i128, ContractError> {
    let elapsed_since_start = now_ledger.saturating_sub(v.start_ledger);
    if elapsed_since_start < v.cliff_ledgers {
        return Ok(0);
    }
    let elapsed = elapsed_since_start.min(v.duration_ledgers) as i128;
    v.total
        .checked_mul(elapsed)
        .map(|value| value / v.duration_ledgers as i128)
        .ok_or(ContractError::InvalidAmount)
}

fn guard_not_vesting(env: &Env, session_id: &Bytes32) -> Result<(), ContractError> {
    if env.storage().persistent().has(&DataKey::Vesting(session_id.clone())) {
        return Err(ContractError::SessionIsVesting);
    }
    Ok(())
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

    pub fn set_platform_fee(env: Env, caller: Address, new_fee_bps: u32) -> Result<(), ContractError> {
        only_role(&env, &role_hash(&env, b"FEE_MANAGER_ROLE"), &caller)?;
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

    pub fn set_treasury(env: Env, caller: Address, new_treasury: Address) -> Result<(), ContractError> {
        only_role(&env, &role_hash(&env, b"FEE_MANAGER_ROLE"), &caller)?;
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
            (session_id.clone(), buyer.clone(), seller.clone(), amount),
        );
        relay(&env, &session_id, "funds_locked", (buyer, seller, amount));
        Ok(())
    }

    pub fn complete_session(env: Env, session_id: Bytes32) -> Result<(), ContractError> {
        guard_not_vesting(&env, &session_id)?;
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
            .publish((Symbol::new(&env, "session_completed"),), session_id.clone());
        relay(&env, &session_id, "session_completed", session.seller.clone());
        Ok(())
    }

    pub fn approve_session(env: Env, session_id: Bytes32) -> Result<(), ContractError> {
        guard_not_vesting(&env, &session_id)?;
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
            (session_id.clone(), payout, fee),
        );
        relay(&env, &session_id, "session_approved", (payout, fee));
        Ok(())
    }

    pub fn refund_session(env: Env, session_id: Bytes32) -> Result<(), ContractError> {
        guard_not_vesting(&env, &session_id)?;
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
            (Symbol::new(&env, "session_refunded"),),
            (session_id.clone(), session.amount),
        );
        relay(&env, &session_id, "session_refunded", session.amount);
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
        // A vesting session returns its unvested part to the buyer now; only
        // the vested, unclaimed part stays in escrow for the resolution.
        if let Some(mut vesting) = env
            .storage()
            .persistent()
            .get::<_, Vesting>(&DataKey::Vesting(session_id.clone()))
        {
            let vested = vested_amount(&vesting, env.ledger().sequence())?;
            let unvested = vesting.total - vested;
            if unvested > 0 {
                let token_addr = read_payment_token(&env)
                    .ok_or(ContractError::PaymentTokenNotConfigured)?;
                token::Client::new(&env, &token_addr).transfer(
                    &env.current_contract_address(),
                    &session.buyer,
                    &unvested,
                );
            }
            session.amount = vested - vesting.claimed;
            vesting.total = vested;
            env.storage()
                .persistent()
                .set(&DataKey::Vesting(session_id.clone()), &vesting);
        }
        session.status = SessionStatus::Disputed;
        let now = env.ledger().timestamp();
        session.dispute_opened_at = now;
        let opened_by = session.buyer.clone();
        save_session(&env, session_id.clone(), &session);
        // DisputeOpened(session_id, opened_by, reason, timestamp)
        env.events().publish(
            (Symbol::new(&env, "DisputeOpened"),),
            (session_id.clone(), reason.clone()),
        );
        relay(&env, &session_id, "dispute_opened", reason);
        Ok(())
    }

    pub fn resolve_dispute(
        env: Env,
        caller: Address,
        session_id: Bytes32,
        resolution: u32,
        buyer_share: i128,
        seller_share: i128,
    ) -> Result<(), ContractError> {
        only_role(&env, &role_hash(&env, b"DISPUTE_RESOLVER_ROLE"), &caller)?;
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
            (Symbol::new(&env, "DisputeResolved"),),
            (session_id.clone(), resolution, buyer_share, seller_share),
        );
        relay(&env, &session_id, "dispute_resolved", (resolution, buyer_share, seller_share));
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

    // ── roles (#1636) ───────────────────────────────────────────────────────

    pub fn default_admin_role(env: Env) -> Bytes32 {
        default_admin_role(&env)
    }
    pub fn fee_manager_role(env: Env) -> Bytes32 {
        role_hash(&env, b"FEE_MANAGER_ROLE")
    }
    pub fn dispute_resolver_role(env: Env) -> Bytes32 {
        role_hash(&env, b"DISPUTE_RESOLVER_ROLE")
    }
    pub fn upgrader_role(env: Env) -> Bytes32 {
        role_hash(&env, b"UPGRADER_ROLE")
    }

    /// Grant `role` to `account`. `caller` must hold `DEFAULT_ADMIN_ROLE`.
    pub fn grant_role(
        env: Env,
        caller: Address,
        role: Bytes32,
        account: Address,
    ) -> Result<(), ContractError> {
        only_role(&env, &default_admin_role(&env), &caller)?;
        env.storage()
            .persistent()
            .set(&DataKey::Role(role.clone(), account.clone()), &true);
        env.events()
            .publish((Symbol::new(&env, "RoleGranted"), role), (account, caller));
        Ok(())
    }

    pub fn revoke_role(
        env: Env,
        caller: Address,
        role: Bytes32,
        account: Address,
    ) -> Result<(), ContractError> {
        only_role(&env, &default_admin_role(&env), &caller)?;
        env.storage()
            .persistent()
            .remove(&DataKey::Role(role.clone(), account.clone()));
        env.events()
            .publish((Symbol::new(&env, "RoleRevoked"), role), (account, caller));
        Ok(())
    }

    pub fn has_role(env: Env, role: Bytes32, account: Address) -> bool {
        holds_role(&env, &role, &account)
    }

    // ── webhook relay (#1633) ───────────────────────────────────────────────

    /// Set the URL the off-chain relayer posts events to. Admin only.
    pub fn set_webhook(env: Env, url: String) -> Result<(), ContractError> {
        require_admin(&env)?;
        env.storage().persistent().set(&DataKey::Webhook, &url);
        env.events().publish((Symbol::new(&env, "WebhookUpdated"),), url);
        Ok(())
    }

    pub fn get_webhook(env: Env) -> Option<String> {
        env.storage().persistent().get(&DataKey::Webhook)
    }

    // ── vesting (#1634) ─────────────────────────────────────────────────────

    pub fn lock_funds_with_vesting(
        env: Env,
        session_id: Bytes32,
        buyer: Address,
        seller: Address,
        amount: i128,
        cliff_ledgers: u32,
        vesting_duration: u32,
    ) -> Result<(), ContractError> {
        if vesting_duration == 0 || cliff_ledgers > vesting_duration {
            return Err(ContractError::InvalidVesting);
        }
        Self::lock_funds(env.clone(), session_id.clone(), buyer, seller, amount)?;
        let vesting = Vesting {
            total: amount,
            claimed: 0,
            start_ledger: env.ledger().sequence(),
            cliff_ledgers,
            duration_ledgers: vesting_duration,
        };
        env.storage()
            .persistent()
            .set(&DataKey::Vesting(session_id.clone()), &vesting);
        env.events().publish(
            (Symbol::new(&env, "VestingCreated"), session_id),
            (amount, cliff_ledgers, vesting_duration),
        );
        Ok(())
    }

    /// The seller claims what has vested so far: `total * elapsed / duration`
    /// (after the cliff) minus what was already claimed. The platform fee is
    /// taken from each claim.
    pub fn claim_vested(env: Env, session_id: Bytes32) -> Result<i128, ContractError> {
        let mut session =
            load_session(&env, session_id.clone()).ok_or(ContractError::SessionNotFound)?;
        session.seller.require_auth();
        let mut vesting: Vesting = env
            .storage()
            .persistent()
            .get(&DataKey::Vesting(session_id.clone()))
            .ok_or(ContractError::InvalidVesting)?;
        if session.status != SessionStatus::Locked {
            return Err(ContractError::InvalidSessionStatus);
        }
        let vested = vested_amount(&vesting, env.ledger().sequence())?;
        let claimable = vested - vesting.claimed;
        if claimable <= 0 {
            return Err(ContractError::NothingToClaim);
        }
        let (payout, fee) = apply_fee(&env, claimable);
        let token_addr =
            read_payment_token(&env).ok_or(ContractError::PaymentTokenNotConfigured)?;
        let token = token::Client::new(&env, &token_addr);
        token.transfer(&env.current_contract_address(), &session.seller, &payout);
        transfer_treasury_fee(&env, &token, fee)?;
        vesting.claimed += claimable;
        if vesting.claimed == vesting.total {
            session.status = SessionStatus::Approved;
            save_session(&env, session_id.clone(), &session);
        }
        env.storage()
            .persistent()
            .set(&DataKey::Vesting(session_id.clone()), &vesting);
        env.events().publish(
            (Symbol::new(&env, "VestingClaimed"), session_id),
            (claimable, payout, fee),
        );
        Ok(claimable)
    }

    pub fn get_vesting(env: Env, session_id: Bytes32) -> Option<Vesting> {
        env.storage().persistent().get(&DataKey::Vesting(session_id))
    }

    // ── batching (#1635) ────────────────────────────────────────────────────
    // A Soroban invocation is atomic: returning `Err` reverts every write made
    // so far, so any failing item reverts the whole batch, and `?` stops the
    // loop at the first error.

    pub fn batch_lock_funds(
        env: Env,
        buyer: Address,
        sessions: Vec<(Bytes32, Address, i128)>,
    ) -> Result<(), ContractError> {
        for (session_id, seller, amount) in sessions.iter() {
            Self::lock_funds(env.clone(), session_id, buyer.clone(), seller, amount)?;
        }
        Ok(())
    }

    pub fn batch_approve(env: Env, session_ids: Vec<Bytes32>) -> Result<(), ContractError> {
        for session_id in session_ids.iter() {
            Self::approve_session(env.clone(), session_id)?;
        }
        Ok(())
    }

    pub fn batch_complete(env: Env, session_ids: Vec<Bytes32>) -> Result<(), ContractError> {
        for session_id in session_ids.iter() {
            Self::complete_session(env.clone(), session_id)?;
        }
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
    use soroban_sdk::testutils::{Address as _, Ledger as _};

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

    // ── RBAC, webhook, vesting, batching (#1633–#1636) ──────────────────────

    struct Fx {
        env: Env,
        id: Address,
        admin: Address,
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
        token::StellarAssetClient::new(&env, &token).mint(&buyer, &10_000);
        SkillssyncEscrowClient::new(&env, &id).set_payment_token(&token);
        Fx { env, id, admin, buyer, seller, token }
    }

    fn sid(env: &Env, n: u8) -> Bytes32 {
        BytesN::from_array(env, &[n; 32])
    }

    #[test]
    fn roles_can_be_granted_checked_and_revoked() {
        let f = fx();
        let client = SkillssyncEscrowClient::new(&f.env, &f.id);
        let manager = Address::generate(&f.env);
        let stranger = Address::generate(&f.env);
        let role = client.fee_manager_role();

        assert!(client.has_role(&client.default_admin_role(), &f.admin));
        assert!(!client.has_role(&role, &manager));
        assert_eq!(
            client.try_set_platform_fee(&stranger, &50),
            Err(Ok(ContractError::MissingRole))
        );

        client.grant_role(&f.admin, &role, &manager);
        assert!(client.has_role(&role, &manager));
        client.set_platform_fee(&manager, &50);
        assert_eq!(client.get_platform_fee(), 50);
        // A fee manager cannot resolve disputes or grant roles.
        assert_eq!(
            client.try_grant_role(&manager, &role, &stranger),
            Err(Ok(ContractError::MissingRole))
        );

        client.revoke_role(&f.admin, &role, &manager);
        assert!(!client.has_role(&role, &manager));
        assert_eq!(
            client.try_set_platform_fee(&manager, &60),
            Err(Ok(ContractError::MissingRole))
        );
    }

    #[test]
    fn the_four_predefined_roles_are_distinct() {
        let f = fx();
        let c = SkillssyncEscrowClient::new(&f.env, &f.id);
        let roles = [
            c.default_admin_role(),
            c.fee_manager_role(),
            c.dispute_resolver_role(),
            c.upgrader_role(),
        ];
        for i in 0..roles.len() {
            for j in (i + 1)..roles.len() {
                assert_ne!(roles[i], roles[j]);
            }
        }
    }

    #[test]
    fn webhook_url_is_admin_set_and_readable() {
        let f = fx();
        let client = SkillssyncEscrowClient::new(&f.env, &f.id);
        assert_eq!(client.get_webhook(), None);
        let url = String::from_str(&f.env, "https://relay.example/hook");
        client.set_webhook(&url);
        assert_eq!(client.get_webhook(), Some(url));
    }

    #[test]
    fn vesting_releases_linearly_after_the_cliff() {
        let f = fx();
        let client = SkillssyncEscrowClient::new(&f.env, &f.id);
        client.set_platform_fee(&f.admin, &0);
        let a = sid(&f.env, 1);
        client.lock_funds_with_vesting(&a, &f.buyer, &f.seller, &1_000, &10, &100);
        let t = token::Client::new(&f.env, &f.token);

        f.env.ledger().with_mut(|l| l.sequence_number += 5);
        assert_eq!(client.try_claim_vested(&a), Err(Ok(ContractError::NothingToClaim)));

        f.env.ledger().with_mut(|l| l.sequence_number += 45);
        assert_eq!(client.claim_vested(&a), 500);
        assert_eq!(t.balance(&f.seller), 500);

        f.env.ledger().with_mut(|l| l.sequence_number += 200);
        assert_eq!(client.claim_vested(&a), 500);
        assert_eq!(t.balance(&f.seller), 1_000);
        assert_eq!(client.get_session(&a).unwrap().status, SessionStatus::Approved);
    }

    #[test]
    fn a_dispute_returns_the_unvested_part_to_the_buyer() {
        let f = fx();
        let client = SkillssyncEscrowClient::new(&f.env, &f.id);
        let a = sid(&f.env, 1);
        client.lock_funds_with_vesting(&a, &f.buyer, &f.seller, &1_000, &0, &100);
        let t = token::Client::new(&f.env, &f.token);
        let before = t.balance(&f.buyer);
        f.env.ledger().with_mut(|l| l.sequence_number += 25);
        client.open_dispute(&a, &String::from_str(&f.env, "late"));
        // 25% vested stays in escrow, 75% went back.
        assert_eq!(t.balance(&f.buyer) - before, 750);
        assert_eq!(client.get_session(&a).unwrap().amount, 250);
    }

    #[test]
    fn a_vesting_session_cannot_use_the_plain_flow() {
        let f = fx();
        let client = SkillssyncEscrowClient::new(&f.env, &f.id);
        let a = sid(&f.env, 1);
        client.lock_funds_with_vesting(&a, &f.buyer, &f.seller, &1_000, &0, &100);
        assert_eq!(client.try_refund_session(&a), Err(Ok(ContractError::SessionIsVesting)));
        assert_eq!(client.try_complete_session(&a), Err(Ok(ContractError::SessionIsVesting)));
    }

    #[test]
    fn a_failing_batch_item_reverts_the_whole_batch() {
        let f = fx();
        let client = SkillssyncEscrowClient::new(&f.env, &f.id);
        let good = sid(&f.env, 1);
        let bad = sid(&f.env, 2);
        let sessions = soroban_sdk::vec![
            &f.env,
            (good.clone(), f.seller.clone(), 100i128),
            (bad, f.seller.clone(), 0i128)
        ];
        assert_eq!(
            client.try_batch_lock_funds(&f.buyer, &sessions),
            Err(Ok(ContractError::InvalidAmount))
        );
        assert_eq!(client.get_session(&good), None);

        let ok = soroban_sdk::vec![&f.env, (good.clone(), f.seller.clone(), 100i128)];
        client.batch_lock_funds(&f.buyer, &ok);
        client.batch_complete(&soroban_sdk::vec![&f.env, good.clone()]);
        client.batch_approve(&soroban_sdk::vec![&f.env, good.clone()]);
        assert_eq!(client.get_session(&good).unwrap().status, SessionStatus::Approved);
    }
}
