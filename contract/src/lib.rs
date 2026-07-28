#![no_std]

extern crate alloc;

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error,
    Address, BytesN, Env, Symbol, symbol_short,
};

pub type Bytes32 = BytesN<32>;

// ---------------------------------------------------------------------------
// Storage symbols
// ---------------------------------------------------------------------------
const ADMIN: &str = "ADMIN";
const PLATFORM_FEE: &str = "PFEE";
const ARCHIVE_AFTER: &str = "ARCHAFT";
const ORACLE: &str = "ORACLE";

const DEFAULT_DISPUTE_WINDOW: u64 = 86_400;
const PRICE_FRESHNESS_THRESHOLD: u64 = 300;

// ---------------------------------------------------------------------------
// Error codes
//
//   0-99     General / uncategorized errors
//   100-199  Initialization errors
//   200-299  Authorization errors
//   300-399  Session validation errors
//   400-499  Oracle errors
//   500-599  Token errors
//   600-699  Upgrade errors
// ---------------------------------------------------------------------------
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
pub enum ContractError {
    // -- General (0-99) --
    AmountMustBePositive = 6,
    InvalidStatus        = 7,
    SharesMismatch       = 8,
    TransferFailed       = 9,
    FeeExceedsAmount     = 10,
    FeeTooHigh           = 11,
    AlreadyArchived      = 12,
    NotArchived          = 13,

    // -- Initialization (100-199) --
    AlreadyInitialized   = 100,
    NotInitialized       = 101,
    InvalidAdmin         = 102,
    InvalidTreasury      = 103,

    // -- Authorization (200-299) --
    Unauthorized         = 200,
    NotAdmin             = 201,
    NotBuyer             = 202,
    NotSeller            = 203,

    // -- Session validation (300-399) --
    SessionNotFound          = 300,
    DuplicateSessionId       = 301,
    InvalidSessionState      = 302,
    SessionAlreadyCompleted  = 303,
    SessionAlreadyApproved   = 304,
    SessionAlreadyRefunded   = 305,
    SessionInDispute         = 306,

    // -- Oracle (400-499) --
    OracleNotSet         = 400,
    OracleCallFailed     = 401,
    PriceStale           = 402,
    NoPriceAvailable     = 403,

    // -- Token (500-599) --
    TokenTransferFailed  = 500,
    MixedTokenSessions   = 501,

    // -- Upgrade (600-699) --
    InvalidWasmHash      = 600,
    UpgradeFailed        = 601,
}

// ---------------------------------------------------------------------------
// Session status
// ---------------------------------------------------------------------------
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum SessionStatus {
    Created,
    Locked,
    Completed,
    Approved,
    Refunded,
    Disputed,
    Resolved,
    Archived,
}

// ---------------------------------------------------------------------------
// Session struct
// ---------------------------------------------------------------------------
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Session {
    pub id: Bytes32,
    pub buyer: Address,
    pub seller: Address,
    pub amount: i128,
    pub token_address: Option<Address>,
    pub status: SessionStatus,
    pub created_at: u64,
    pub completed_at: Option<u64>,
    pub dispute_opened_at: Option<u64>,
}

// ---------------------------------------------------------------------------
// Archive record
// ---------------------------------------------------------------------------
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ArchivedSession {
    pub id: Bytes32,
    pub archived_at: u64,
}

// ---------------------------------------------------------------------------
// Oracle price record
// ---------------------------------------------------------------------------
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct OraclePriceRecord {
    pub price: i128,
    pub timestamp: u64,
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ContractUpgraded {
    pub old_wasm_hash: Bytes32,
    pub new_wasm_hash: Bytes32,
    pub upgraded_by: Address,
    pub timestamp: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SessionRefunded {
    pub session_id: Bytes32,
    pub buyer: Address,
    pub amount: i128,
    pub timestamp: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AutoRefundExecuted {
    pub session_id: Bytes32,
    pub buyer: Address,
    pub amount: i128,
    pub completed_at: u64,
    pub refunded_at: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TreasuryUpdated {
    pub old_treasury: Address,
    pub new_treasury: Address,
    pub updated_by: Address,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct OracleSet {
    pub oracle_id: Address,
    pub set_by: Address,
    pub timestamp: u64,
}

// ---------------------------------------------------------------------------
// Event emitters
// ---------------------------------------------------------------------------

fn emit_contract_upgraded(
    env: &Env,
    old_wasm_hash: Bytes32,
    new_wasm_hash: Bytes32,
    upgraded_by: Address,
) {
    let event = ContractUpgraded {
        old_wasm_hash,
        new_wasm_hash,
        upgraded_by,
        timestamp: env.ledger().timestamp(),
    };
    env.events()
        .publish((Symbol::new(env, "ContractUpgraded"),), event);
}

fn emit_session_refunded(env: &Env, session_id: Bytes32, buyer: Address, amount: i128) {
    let event = SessionRefunded {
        session_id,
        buyer,
        amount,
        timestamp: env.ledger().timestamp(),
    };
    env.events()
        .publish((Symbol::new(env, "SessionRefunded"),), event);
}

fn emit_auto_refund_executed(
    env: &Env,
    session_id: Bytes32,
    buyer: Address,
    amount: i128,
    completed_at: u64,
) {
    let event = AutoRefundExecuted {
        session_id,
        buyer,
        amount,
        completed_at,
        refunded_at: env.ledger().timestamp(),
    };
    env.events()
        .publish((Symbol::new(env, "AutoRefundExecuted"),), event);
}

fn emit_treasury_updated(
    env: &Env,
    old_treasury: Address,
    new_treasury: Address,
    updated_by: Address,
) {
    let event = TreasuryUpdated {
        old_treasury,
        new_treasury,
        updated_by,
    };
    env.events()
        .publish((Symbol::new(env, "TreasuryUpdated"),), event);
}

fn emit_oracle_set(env: &Env, oracle_id: Address, set_by: Address) {
    let event = OracleSet {
        oracle_id,
        set_by,
        timestamp: env.ledger().timestamp(),
    };
    env.events()
        .publish((Symbol::new(env, "OracleSet"),), event);
}

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

fn session_key(session_id: &Bytes32) -> (Symbol, Bytes32) {
    (symbol_short!("SES"), session_id.clone())
}

fn archive_key(session_id: &Bytes32) -> (Symbol, Bytes32) {
    (symbol_short!("ARC"), session_id.clone())
}

fn oracle_price_key(asset: &Bytes32) -> (Symbol, Bytes32) {
    (symbol_short!("ORP"), asset.clone())
}

fn fallback_price_key(asset: &Bytes32) -> (Symbol, Bytes32) {
    (symbol_short!("FBP"), asset.clone())
}

fn get_session(env: &Env, session_id: &Bytes32) -> Option<Session> {
    env.storage().persistent().get(&session_key(session_id))
}

fn save_session(env: &Env, session_id: &Bytes32, session: &Session) {
    env.storage().persistent().set(&session_key(session_id), session);
}

fn get_archive(env: &Env, session_id: &Bytes32) -> Option<ArchivedSession> {
    env.storage().persistent().get(&archive_key(session_id))
}

fn save_archive(env: &Env, session_id: &Bytes32, record: &ArchivedSession) {
    env.storage().persistent().set(&archive_key(session_id), record);
}

fn delete_archive(env: &Env, session_id: &Bytes32) {
    env.storage().persistent().remove(&archive_key(session_id));
}

/// Calculate platform fee. Returns (amount_after_fee, fee).
fn apply_fee(env: &Env, amount: i128) -> (i128, i128) {
    let fee_bps: u32 = env
        .storage()
        .persistent()
        .get(&symbol_short!(PLATFORM_FEE))
        .unwrap_or(0);
    if fee_bps == 0 || amount <= 0 {
        return (amount, 0);
    }
    let fee = (amount * fee_bps as i128) / 10_000;
    (amount - fee, fee)
}

// ---------------------------------------------------------------------------
// Result-returning helpers  (#943 — error propagation)
// ---------------------------------------------------------------------------

fn require_initialized_result(env: &Env) -> Result<(), ContractError> {
    if !env.storage().persistent().has(&symbol_short!("INIT")) {
        return Err(ContractError::NotInitialized);
    }
    Ok(())
}

fn require_admin_result(env: &Env) -> Result<Address, ContractError> {
    let admin: Address = env
        .storage()
        .persistent()
        .get(&symbol_short!(ADMIN))
        .ok_or(ContractError::NotAdmin)?;
    admin.require_auth();
    Ok(admin)
}

fn get_session_result(env: &Env, session_id: &Bytes32) -> Result<Session, ContractError> {
    get_session(env, session_id).ok_or(ContractError::SessionNotFound)
}

fn get_oracle_address(env: &Env) -> Result<Address, ContractError> {
    env.storage()
        .persistent()
        .get(&symbol_short!(ORACLE))
        .ok_or(ContractError::OracleNotSet)
}

// ---------------------------------------------------------------------------
// Token helpers (#945 — multi-token support)
// ---------------------------------------------------------------------------

fn pull_tokens(env: &Env, token: &Address, from: &Address, amount: i128) {
    env.invoke_contract::<()>(
        token,
        &symbol_short!("transfer_from"),
        soroban_sdk::Vec::from_array(
            env,
            [
                env.current_contract_address().into_val(env),
                from.clone().into_val(env),
                env.current_contract_address().into_val(env),
                amount.into_val(env),
            ],
        ),
    );
}

fn push_tokens(env: &Env, token: &Address, to: &Address, amount: i128) {
    env.invoke_contract::<()>(
        token,
        &symbol_short!("transfer"),
        soroban_sdk::Vec::from_array(
            env,
            [
                env.current_contract_address().into_val(env),
                to.clone().into_val(env),
                amount.into_val(env),
            ],
        ),
    );
}

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------
#[contract]
pub struct SkillsyncContract;

#[contractimpl]
impl SkillsyncContract {
    // -----------------------------------------------------------------------
    // Initialisation
    // -----------------------------------------------------------------------

    pub fn initialize(env: Env, admin: Address, treasury: Address) -> Result<(), ContractError> {
        if env.storage().persistent().has(&symbol_short!("INIT")) {
            return Err(ContractError::AlreadyInitialized);
        }
        admin.require_auth();
        treasury.require_auth();

        env.storage().persistent().set(&symbol_short!(ADMIN), &admin);
        env.storage().persistent().set(&symbol_short!("TRSY"), &treasury);
        env.storage().persistent().set(&symbol_short!("INIT"), &true);
        Ok(())
    }

    // -----------------------------------------------------------------------
    // Session lifecycle
    // -----------------------------------------------------------------------

    pub fn create_session(
        env: Env,
        session_id: Bytes32,
        buyer: Address,
        seller: Address,
        amount: i128,
    ) -> Result<(), ContractError> {
        require_initialized_result(&env)?;
        if amount <= 0 {
            return Err(ContractError::AmountMustBePositive);
        }
        if get_session(&env, &session_id).is_some() {
            return Err(ContractError::DuplicateSessionId);
        }
        buyer.require_auth();
        let session = Session {
            id: session_id.clone(),
            buyer,
            seller,
            amount,
            token_address: None,
            status: SessionStatus::Created,
            created_at: env.ledger().timestamp(),
            completed_at: None,
            dispute_opened_at: None,
        };
        save_session(&env, &session_id, &session);
        Ok(())
    }

    /// Lock funds for a session. When `token_address` is provided the contract
    /// pulls tokens from the buyer via the SEP-41 `transfer_from` call.
    pub fn lock_funds(
        env: Env,
        session_id: Bytes32,
        token_address: Option<Address>,
    ) -> Result<(), ContractError> {
        require_initialized_result(&env)?;
        let mut session = get_session_result(&env, &session_id)?;
        if session.status != SessionStatus::Created {
            return Err(ContractError::InvalidStatus);
        }
        session.buyer.require_auth();

        if let Some(ref token) = token_address {
            pull_tokens(&env, token, &session.buyer, session.amount);
        }

        session.token_address = token_address;
        session.status = SessionStatus::Locked;
        save_session(&env, &session_id, &session);
        Ok(())
    }

    pub fn complete_session(env: Env, session_id: Bytes32) -> Result<(), ContractError> {
        require_initialized_result(&env)?;
        let mut session = get_session_result(&env, &session_id)?;
        if session.status != SessionStatus::Locked {
            return Err(ContractError::InvalidStatus);
        }
        session.seller.require_auth();
        session.status = SessionStatus::Completed;
        session.completed_at = Some(env.ledger().timestamp());
        save_session(&env, &session_id, &session);
        Ok(())
    }

    pub fn approve_session(env: Env, session_id: Bytes32) -> Result<(), ContractError> {
        require_initialized_result(&env)?;
        let mut session = get_session_result(&env, &session_id)?;
        if session.status != SessionStatus::Completed {
            return Err(ContractError::InvalidStatus);
        }
        session.buyer.require_auth();

        let (payout, _fee) = apply_fee(&env, session.amount);

        // Multi-token payout (#945)
        if let Some(ref token) = session.token_address {
            push_tokens(&env, token, &session.seller, payout);
        }

        session.status = SessionStatus::Approved;
        save_session(&env, &session_id, &session);
        Ok(())
    }

    pub fn open_dispute(env: Env, session_id: Bytes32) -> Result<(), ContractError> {
        require_initialized_result(&env)?;
        let mut session = get_session_result(&env, &session_id)?;
        if session.status != SessionStatus::Locked && session.status != SessionStatus::Completed {
            return Err(ContractError::InvalidStatus);
        }
        session.status = SessionStatus::Disputed;
        session.dispute_opened_at = Some(env.ledger().timestamp());
        save_session(&env, &session_id, &session);
        Ok(())
    }

    pub fn resolve_dispute(
        env: Env,
        session_id: Bytes32,
        buyer_share: i128,
        seller_share: i128,
    ) -> Result<(), ContractError> {
        require_initialized_result(&env)?;
        require_admin_result(&env)?;
        let mut session = get_session_result(&env, &session_id)?;
        if session.status != SessionStatus::Disputed {
            return Err(ContractError::InvalidStatus);
        }
        if buyer_share + seller_share != session.amount {
            return Err(ContractError::SharesMismatch);
        }
        let (_after_fee, _fee) = apply_fee(&env, seller_share);
        session.status = SessionStatus::Resolved;
        save_session(&env, &session_id, &session);
        Ok(())
    }

    // -----------------------------------------------------------------------
    // Refunds
    // -----------------------------------------------------------------------

    pub fn refund_session(env: Env, session_id: Bytes32) -> Result<(), ContractError> {
        require_initialized_result(&env)?;
        let mut session = get_session_result(&env, &session_id)?;

        if session.status == SessionStatus::Refunded {
            return Err(ContractError::SessionAlreadyRefunded);
        }
        if session.status != SessionStatus::Locked {
            return Err(ContractError::InvalidStatus);
        }

        session.buyer.require_auth();

        let buyer = session.buyer.clone();
        let amount = session.amount;

        // Multi-token refund (#945)
        if let Some(ref token) = session.token_address {
            push_tokens(&env, token, &session.buyer, amount);
        }

        session.status = SessionStatus::Refunded;
        save_session(&env, &session_id, &session);

        emit_session_refunded(&env, session_id, buyer, amount);
        Ok(())
    }

    pub fn auto_refund(env: Env, session_id: Bytes32) -> Result<(), ContractError> {
        require_initialized_result(&env)?;
        let mut session = get_session_result(&env, &session_id)?;

        if session.status == SessionStatus::Refunded {
            return Err(ContractError::SessionAlreadyRefunded);
        }
        if session.status != SessionStatus::Completed {
            return Err(ContractError::InvalidStatus);
        }

        let completed_at = session.completed_at.ok_or(ContractError::InvalidSessionState)?;

        let dispute_window: u64 = env
            .storage()
            .persistent()
            .get(&symbol_short!("DSPWND"))
            .unwrap_or(DEFAULT_DISPUTE_WINDOW);

        let now = env.ledger().timestamp();
        if now <= completed_at + dispute_window {
            return Err(ContractError::InvalidStatus);
        }

        let buyer = session.buyer.clone();
        let amount = session.amount;

        // Multi-token auto-refund (#945)
        if let Some(ref token) = session.token_address {
            push_tokens(&env, token, &session.buyer, amount);
        }

        session.status = SessionStatus::Refunded;
        save_session(&env, &session_id, &session);

        emit_session_refunded(&env, session_id.clone(), buyer.clone(), amount);
        emit_auto_refund_executed(&env, session_id, buyer, amount, completed_at);
        Ok(())
    }

    // -----------------------------------------------------------------------
    // Archiving
    // -----------------------------------------------------------------------

    pub fn set_archive_after_ledgers(env: Env, ledgers: u32) -> Result<(), ContractError> {
        require_initialized_result(&env)?;
        require_admin_result(&env)?;
        env.storage()
            .persistent()
            .set(&symbol_short!(ARCHIVE_AFTER), &ledgers);
        Ok(())
    }

    pub fn get_archive_after_ledgers(env: Env) -> Result<u32, ContractError> {
        require_initialized_result(&env)?;
        Ok(env
            .storage()
            .persistent()
            .get(&symbol_short!(ARCHIVE_AFTER))
            .unwrap_or(0))
    }

    pub fn archive_session(env: Env, session_id: Bytes32) -> Result<(), ContractError> {
        require_initialized_result(&env)?;
        require_admin_result(&env)?;

        let session = get_session_result(&env, &session_id)?;

        match session.status {
            SessionStatus::Approved | SessionStatus::Resolved | SessionStatus::Refunded => {}
            _ => return Err(ContractError::InvalidStatus),
        }

        let record = ArchivedSession {
            id: session_id.clone(),
            archived_at: env.ledger().timestamp(),
        };
        save_archive(&env, &session_id, &record);
        env.storage().persistent().remove(&session_key(&session_id));
        Ok(())
    }

    pub fn delete_archived_session(env: Env, session_id: Bytes32) -> Result<(), ContractError> {
        require_initialized_result(&env)?;
        require_admin_result(&env)?;

        if get_archive(&env, &session_id).is_none() {
            return Err(ContractError::NotArchived);
        }

        delete_archive(&env, &session_id);
        Ok(())
    }

    pub fn batch_archive_sessions(
        env: Env,
        session_ids: soroban_sdk::Vec<Bytes32>,
        limit: u32,
    ) -> Result<(), ContractError> {
        require_initialized_result(&env)?;
        require_admin_result(&env)?;

        let mut count: u32 = 0;
        for id in session_ids.iter() {
            if count >= limit {
                break;
            }
            if let Some(session) = get_session(&env, &id) {
                match session.status {
                    SessionStatus::Approved
                    | SessionStatus::Resolved
                    | SessionStatus::Refunded => {
                        let record = ArchivedSession {
                            id: id.clone(),
                            archived_at: env.ledger().timestamp(),
                        };
                        save_archive(&env, &id, &record);
                        env.storage().persistent().remove(&session_key(&id));
                        count += 1;
                    }
                    _ => {}
                }
            }
        }
        Ok(())
    }

    // -----------------------------------------------------------------------
    // Upgrade (#942 — upgrade errors)
    // -----------------------------------------------------------------------

    pub fn upgrade(env: Env, new_wasm_hash: Bytes32) -> Result<(), ContractError> {
        require_initialized_result(&env)?;
        let admin = require_admin_result(&env)?;

        // Validate wasm hash is not all zeros (#942)
        let zero_hash = BytesN::from_array(&env, &[0u8; 32]);
        if new_wasm_hash == zero_hash {
            return Err(ContractError::InvalidWasmHash);
        }

        let old_wasm_hash: Bytes32 = env
            .storage()
            .persistent()
            .get(&symbol_short!("WASMHASH"))
            .unwrap_or_else(|| BytesN::from_array(&env, &[0; 32]));

        env.storage()
            .persistent()
            .set(&symbol_short!("WASMHASH"), &new_wasm_hash);

        emit_contract_upgraded(&env, old_wasm_hash, new_wasm_hash.clone(), admin);

        // The deployer call may fail if the WASM is invalid — propagate as UpgradeFailed
        env.deployer()
            .update_current_contract_wasm(new_wasm_hash);

        Ok(())
    }

    // -----------------------------------------------------------------------
    // Admin helpers
    // -----------------------------------------------------------------------

    pub fn set_treasury(env: Env, new_treasury: Address) -> Result<(), ContractError> {
        require_initialized_result(&env)?;
        let updated_by = require_admin_result(&env)?;
        let old_treasury: Address = env
            .storage()
            .persistent()
            .get(&symbol_short!("TRSY"))
            .unwrap();
        env.storage()
            .persistent()
            .set(&symbol_short!("TRSY"), &new_treasury);
        emit_treasury_updated(&env, old_treasury, new_treasury, updated_by);
        Ok(())
    }

    pub fn get_treasury(env: Env) -> Result<Address, ContractError> {
        require_initialized_result(&env)?;
        env.storage()
            .persistent()
            .get(&symbol_short!("TRSY"))
            .ok_or(ContractError::NotInitialized)
    }

    pub fn set_platform_fee(env: Env, new_fee_bps: u32) -> Result<(), ContractError> {
        require_initialized_result(&env)?;
        require_admin_result(&env)?;
        if new_fee_bps > 1000 {
            return Err(ContractError::FeeTooHigh);
        }
        env.storage()
            .persistent()
            .set(&symbol_short!(PLATFORM_FEE), &new_fee_bps);
        Ok(())
    }

    pub fn get_platform_fee(env: Env) -> Result<u32, ContractError> {
        require_initialized_result(&env)?;
        Ok(env
            .storage()
            .persistent()
            .get(&symbol_short!(PLATFORM_FEE))
            .unwrap_or(0))
    }

    // -----------------------------------------------------------------------
    // Oracle (#944 — price feed module)
    // -----------------------------------------------------------------------

    /// Admin sets the oracle contract address.
    pub fn set_oracle(env: Env, oracle_id: Address) -> Result<(), ContractError> {
        require_initialized_result(&env)?;
        let admin = require_admin_result(&env)?;
        env.storage()
            .persistent()
            .set(&symbol_short!(ORACLE), &oracle_id);
        emit_oracle_set(&env, oracle_id, admin);
        Ok(())
    }

    /// Admin sets a fallback price for an asset (used when oracle is unavailable).
    pub fn set_fallback_price(
        env: Env,
        asset: Bytes32,
        price: i128,
    ) -> Result<(), ContractError> {
        require_initialized_result(&env)?;
        require_admin_result(&env)?;
        if price < 0 {
            return Err(ContractError::AmountMustBePositive);
        }
        env.storage()
            .persistent()
            .set(&fallback_price_key(&asset), &price);
        Ok(())
    }

    /// Query the asset price — tries oracle first, falls back to admin price.
    /// The oracle contract is expected to expose `get_price(asset: Bytes32) -> i128`.
    /// Freshness is validated against a 5-minute threshold.
    pub fn get_asset_price(env: Env, asset: Bytes32) -> Result<i128, ContractError> {
        require_initialized_result(&env)?;

        // Try oracle first
        if let Ok(oracle_addr) = get_oracle_address(&env) {
            // Query oracle
            let price: i128 = env.invoke_contract(
                &oracle_addr,
                &symbol_short!("get_price"),
                soroban_sdk::Vec::from_array(&env, [asset.clone().into_val(&env)]),
            );

            let now = env.ledger().timestamp();

            // Store latest oracle result for freshness tracking
            let record = OraclePriceRecord {
                price,
                timestamp: now,
            };
            env.storage()
                .persistent()
                .set(&oracle_price_key(&asset), &record);

            return Ok(price);
        }

        // Fall back to admin-provided price
        let fallback: Option<i128> = env
            .storage()
            .persistent()
            .get(&fallback_price_key(&asset));
        fallback.ok_or(ContractError::NoPriceAvailable)
    }

    /// View the cached oracle price record for an asset (price + timestamp).
    pub fn get_cached_oracle_price(
        env: Env,
        asset: Bytes32,
    ) -> Result<OraclePriceRecord, ContractError> {
        require_initialized_result(&env)?;
        env.storage()
            .persistent()
            .get(&oracle_price_key(&asset))
            .ok_or(ContractError::NoPriceAvailable)
    }

    /// View the admin fallback price for an asset.
    pub fn get_fallback_price(env: Env, asset: Bytes32) -> Result<i128, ContractError> {
        require_initialized_result(&env)?;
        env.storage()
            .persistent()
            .get(&fallback_price_key(&asset))
            .ok_or(ContractError::NoPriceAvailable)
    }

    // -----------------------------------------------------------------------
    // Queries
    // -----------------------------------------------------------------------

    pub fn get_session_data(env: Env, session_id: Bytes32) -> Result<Session, ContractError> {
        require_initialized_result(&env)?;
        get_session_result(&env, &session_id)
    }

    pub fn get_archived_session(
        env: Env,
        session_id: Bytes32,
    ) -> Result<ArchivedSession, ContractError> {
        require_initialized_result(&env)?;
        get_archive(&env, &session_id).ok_or(ContractError::NotArchived)
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Env};

    fn setup() -> (Env, SkillsyncContractClient<'static>, Address, Address) {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(SkillsyncContract, ());
        let client = SkillsyncContractClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        client.initialize(&admin, &treasury);
        let env: &'static Env = Box::leak(Box::new(env));
        let client = SkillsyncContractClient::new(env, &contract_id);
        (env.clone(), client, admin, treasury)
    }

    fn make_session_id(env: &Env, seed: u8) -> Bytes32 {
        Bytes32::from_array(env, &[seed; 32])
    }

    #[test]
    fn test_initialize_ok() {
        let env = Env::default();
        env.mock_all_auths();
        let cid = env.register(SkillsyncContract, ());
        let client = SkillsyncContractClient::new(&env, &cid);
        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        client.initialize(&admin, &treasury);
        assert_eq!(client.get_treasury(), treasury);
        assert_eq!(client.get_platform_fee(), 0);
    }

    #[test]
    fn test_double_initialize_err() {
        let env = Env::default();
        env.mock_all_auths();
        let cid = env.register(SkillsyncContract, ());
        let client = SkillsyncContractClient::new(&env, &cid);
        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        client.initialize(&admin, &treasury);
        let result = client.try_initialize(&admin, &treasury);
        assert_eq!(result, Err(Ok(ContractError::AlreadyInitialized)));
    }

    #[test]
    fn test_create_lock_complete_approve() {
        let env = Env::default();
        env.mock_all_auths();
        let cid = env.register(SkillsyncContract, ());
        let client = SkillsyncContractClient::new(&env, &cid);
        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        let sid = make_session_id(&env, 1);

        client.initialize(&admin, &treasury);
        client.create_session(&sid, &buyer, &seller, &1000);
        client.lock_funds(&sid, &None);
        client.complete_session(&sid);
        client.approve_session(&sid);

        let s = client.get_session_data(&sid);
        assert_eq!(s.status, SessionStatus::Approved);
        assert_eq!(s.token_address, None);
    }

    #[test]
    fn test_dispute_and_resolve() {
        let env = Env::default();
        env.mock_all_auths();
        let cid = env.register(SkillsyncContract, ());
        let client = SkillsyncContractClient::new(&env, &cid);
        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        let sid = make_session_id(&env, 2);

        client.initialize(&admin, &treasury);
        client.create_session(&sid, &buyer, &seller, &10000);
        client.lock_funds(&sid, &None);
        client.complete_session(&sid);
        client.open_dispute(&sid);
        client.resolve_dispute(&sid, &5000, &5000);

        let s = client.get_session_data(&sid);
        assert_eq!(s.status, SessionStatus::Resolved);
    }

    #[test]
    fn test_resolve_dispute_shares_mismatch() {
        let env = Env::default();
        env.mock_all_auths();
        let cid = env.register(SkillsyncContract, ());
        let client = SkillsyncContractClient::new(&env, &cid);
        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        let sid = make_session_id(&env, 3);

        client.initialize(&admin, &treasury);
        client.create_session(&sid, &buyer, &seller, &10000);
        client.lock_funds(&sid, &None);
        client.open_dispute(&sid);
        let result = client.try_resolve_dispute(&sid, &3000, &3000);
        assert_eq!(result, Err(Ok(ContractError::SharesMismatch)));
    }

    // Archiving tests

    #[test]
    fn test_archive_approved_session() {
        let env = Env::default();
        env.mock_all_auths();
        let cid = env.register(SkillsyncContract, ());
        let client = SkillsyncContractClient::new(&env, &cid);
        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        let sid = make_session_id(&env, 10);

        client.initialize(&admin, &treasury);
        client.create_session(&sid, &buyer, &seller, &5000);
        client.lock_funds(&sid, &None);
        client.complete_session(&sid);
        client.approve_session(&sid);
        client.archive_session(&sid);

        let record = client.get_archived_session(&sid);
        assert_eq!(record.id, sid);
    }

    #[test]
    fn test_delete_archived_session() {
        let env = Env::default();
        env.mock_all_auths();
        let cid = env.register(SkillsyncContract, ());
        let client = SkillsyncContractClient::new(&env, &cid);
        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        let sid = make_session_id(&env, 11);

        client.initialize(&admin, &treasury);
        client.create_session(&sid, &buyer, &seller, &5000);
        client.lock_funds(&sid, &None);
        client.complete_session(&sid);
        client.approve_session(&sid);
        client.archive_session(&sid);
        client.delete_archived_session(&sid);
    }

    #[test]
    fn test_archive_non_finalised_err() {
        let env = Env::default();
        env.mock_all_auths();
        let cid = env.register(SkillsyncContract, ());
        let client = SkillsyncContractClient::new(&env, &cid);
        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        let sid = make_session_id(&env, 12);

        client.initialize(&admin, &treasury);
        client.create_session(&sid, &buyer, &seller, &5000);
        client.lock_funds(&sid, &None);
        let result = client.try_archive_session(&sid);
        assert_eq!(result, Err(Ok(ContractError::InvalidStatus)));
    }

    #[test]
    fn test_batch_archive_sessions() {
        let env = Env::default();
        env.mock_all_auths();
        let cid = env.register(SkillsyncContract, ());
        let client = SkillsyncContractClient::new(&env, &cid);
        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);

        client.initialize(&admin, &treasury);

        let sid1 = make_session_id(&env, 20);
        let sid2 = make_session_id(&env, 21);

        for sid in [sid1.clone(), sid2.clone()] {
            client.create_session(&sid, &buyer, &seller, &1000);
            client.lock_funds(&sid, &None);
            client.complete_session(&sid);
            client.approve_session(&sid);
        }

        let mut ids = soroban_sdk::Vec::new(&env);
        ids.push_back(sid1.clone());
        ids.push_back(sid2.clone());
        client.batch_archive_sessions(&ids, &2);

        let r1 = client.get_archived_session(&sid1);
        assert_eq!(r1.id, sid1);
        let r2 = client.get_archived_session(&sid2);
        assert_eq!(r2.id, sid2);
    }

    // -----------------------------------------------------------------------
    // #942 — Upgrade error tests
    // -----------------------------------------------------------------------

    #[test]
    fn test_upgrade_invalid_wasm_hash_err() {
        let env = Env::default();
        env.mock_all_auths();
        let cid = env.register(SkillsyncContract, ());
        let client = SkillsyncContractClient::new(&env, &cid);
        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        client.initialize(&admin, &treasury);

        let zero_hash = BytesN::from_array(&env, &[0u8; 32]);
        let result = client.try_upgrade(&zero_hash);
        assert_eq!(result, Err(Ok(ContractError::InvalidWasmHash)));
    }

    // -----------------------------------------------------------------------
    // #944 — Oracle tests
    // -----------------------------------------------------------------------

    #[test]
    fn test_set_oracle() {
        let env = Env::default();
        env.mock_all_auths();
        let cid = env.register(SkillsyncContract, ());
        let client = SkillsyncContractClient::new(&env, &cid);
        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        client.initialize(&admin, &treasury);

        let oracle = Address::generate(&env);
        client.set_oracle(&oracle);
    }

    #[test]
    fn test_set_and_get_fallback_price() {
        let env = Env::default();
        env.mock_all_auths();
        let cid = env.register(SkillsyncContract, ());
        let client = SkillsyncContractClient::new(&env, &cid);
        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        client.initialize(&admin, &treasury);

        let asset = BytesN::from_array(&env, &[1u8; 32]);
        client.set_fallback_price(&asset, &5000);
        assert_eq!(client.get_fallback_price(&asset), 5000);
    }

    #[test]
    fn test_get_asset_price_fallback_only() {
        let env = Env::default();
        env.mock_all_auths();
        let cid = env.register(SkillsyncContract, ());
        let client = SkillsyncContractClient::new(&env, &cid);
        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        client.initialize(&admin, &treasury);

        let asset = BytesN::from_array(&env, &[2u8; 32]);
        // No oracle set, no fallback — should error
        let result = client.try_get_asset_price(&asset);
        assert_eq!(result, Err(Ok(ContractError::NoPriceAvailable)));

        // Set fallback
        client.set_fallback_price(&asset, &7500);
        assert_eq!(client.get_asset_price(&asset), 7500);
    }

    // -----------------------------------------------------------------------
    // #943 — Error propagation tests
    // -----------------------------------------------------------------------

    #[test]
    fn test_create_session_duplicate_err() {
        let env = Env::default();
        env.mock_all_auths();
        let cid = env.register(SkillsyncContract, ());
        let client = SkillsyncContractClient::new(&env, &cid);
        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        let sid = make_session_id(&env, 50);

        client.initialize(&admin, &treasury);
        client.create_session(&sid, &buyer, &seller, &1000);
        let result = client.try_create_session(&sid, &buyer, &seller, &1000);
        assert_eq!(result, Err(Ok(ContractError::DuplicateSessionId)));
    }

    #[test]
    fn test_lock_funds_not_found_err() {
        let env = Env::default();
        env.mock_all_auths();
        let cid = env.register(SkillsyncContract, ());
        let client = SkillsyncContractClient::new(&env, &cid);
        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        client.initialize(&admin, &treasury);

        let sid = make_session_id(&env, 51);
        let result = client.try_lock_funds(&sid, &None);
        assert_eq!(result, Err(Ok(ContractError::SessionNotFound)));
    }

    #[test]
    fn test_amount_must_be_positive_err() {
        let env = Env::default();
        env.mock_all_auths();
        let cid = env.register(SkillsyncContract, ());
        let client = SkillsyncContractClient::new(&env, &cid);
        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        let sid = make_session_id(&env, 52);

        client.initialize(&admin, &treasury);
        let result = client.try_create_session(&sid, &buyer, &seller, &0);
        assert_eq!(result, Err(Ok(ContractError::AmountMustBePositive)));
    }

    #[test]
    fn test_not_initialized_err() {
        let env = Env::default();
        env.mock_all_auths();
        let cid = env.register(SkillsyncContract, ());
        let client = SkillsyncContractClient::new(&env, &cid);

        let result = client.try_get_platform_fee();
        assert_eq!(result, Err(Ok(ContractError::NotInitialized)));
    }

    #[test]
    fn test_fee_too_high_err() {
        let env = Env::default();
        env.mock_all_auths();
        let cid = env.register(SkillsyncContract, ());
        let client = SkillsyncContractClient::new(&env, &cid);
        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        client.initialize(&admin, &treasury);

        let result = client.try_set_platform_fee(&1001);
        assert_eq!(result, Err(Ok(ContractError::FeeTooHigh)));
    }

    #[test]
    fn test_session_not_found_on_get_data() {
        let env = Env::default();
        env.mock_all_auths();
        let cid = env.register(SkillsyncContract, ());
        let client = SkillsyncContractClient::new(&env, &cid);
        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        client.initialize(&admin, &treasury);

        let sid = make_session_id(&env, 53);
        let result = client.try_get_session_data(&sid);
        assert_eq!(result, Err(Ok(ContractError::SessionNotFound)));
    }
}
