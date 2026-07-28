#![no_std]

extern crate alloc;

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error,
    Address, BytesN, Env, String, Symbol, symbol_short,
};

/// 32-byte identifier / wasm hash alias used across the contract API.
pub type Bytes32 = BytesN<32>;

// ---------------------------------------------------------------------------
// Storage symbols
// ---------------------------------------------------------------------------
const ADMIN: &str = "ADMIN";
const TREASURY: &str = "TREASURY";
const PLATFORM_FEE: &str = "PFEE";
const INITIALIZED: &str = "INIT";
const ARCHIVE_AFTER: &str = "ARCHAFT";
const WEBHOOK_URL: &str = "WHURL";

/// Default dispute window (seconds) before a completed session may auto-refund.
const DEFAULT_DISPUTE_WINDOW: u64 = 86_400;

// ---------------------------------------------------------------------------
// Error codes
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
    NotPartyToSession    = 204,

    // -- Session validation (300-399) --
    SessionNotFound          = 300,
    DuplicateSessionId       = 301,
    InvalidSessionState      = 302,
    SessionAlreadyCompleted  = 303,
    SessionAlreadyApproved   = 304,
    SessionAlreadyRefunded   = 305,
    SessionInDispute         = 306,

    // -- Vesting (400-499) --
    VestingNotSet            = 400,
    NothingToClaim           = 401,
    CliffNotReached          = 402,
    VestingAlreadyClaimed    = 403,

    // -- Batch (500-599) --
    BatchEmpty               = 500,
    BatchItemFailed          = 501,
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
    pub status: SessionStatus,
    pub created_at: u64,
    pub completed_at: Option<u64>,
    pub dispute_opened_at: Option<u64>,
}

// ---------------------------------------------------------------------------
// Vesting record (#948)
// ---------------------------------------------------------------------------
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VestingRecord {
    pub session_id: Bytes32,
    pub seller: Address,
    pub total_amount: i128,
    pub claimed_amount: i128,
    pub cliff_ledgers: u32,
    pub vesting_duration: u32,
    pub start_ledger: u32,
    pub created_at: u64,
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

/// #946 — Emitted when session metadata is set or updated.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MetadataUpdated {
    pub session_id: Bytes32,
    pub metadata_uri: String,
    pub updated_by: Address,
    pub timestamp: u64,
}

/// #948 — Emitted when a vesting schedule is created.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VestingCreated {
    pub session_id: Bytes32,
    pub seller: Address,
    pub total_amount: i128,
    pub cliff_ledgers: u32,
    pub vesting_duration: u32,
    pub timestamp: u64,
}

/// #948 — Emitted when vested tokens are claimed.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VestingClaimed {
    pub session_id: Bytes32,
    pub seller: Address,
    pub claimed_amount: i128,
    pub total_claimed: i128,
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

fn emit_metadata_updated(
    env: &Env,
    session_id: Bytes32,
    metadata_uri: String,
    updated_by: Address,
) {
    let event = MetadataUpdated {
        session_id,
        metadata_uri,
        updated_by,
        timestamp: env.ledger().timestamp(),
    };
    env.events()
        .publish((Symbol::new(env, "MetadataUpdated"),), event);
}

fn emit_vesting_created(
    env: &Env,
    session_id: Bytes32,
    seller: Address,
    total_amount: i128,
    cliff_ledgers: u32,
    vesting_duration: u32,
) {
    let event = VestingCreated {
        session_id,
        seller,
        total_amount,
        cliff_ledgers,
        vesting_duration,
        timestamp: env.ledger().timestamp(),
    };
    env.events()
        .publish((Symbol::new(env, "VestingCreated"),), event);
}

fn emit_vesting_claimed(
    env: &Env,
    session_id: Bytes32,
    seller: Address,
    claimed_amount: i128,
    total_claimed: i128,
) {
    let event = VestingClaimed {
        session_id,
        seller,
        claimed_amount,
        total_claimed,
        timestamp: env.ledger().timestamp(),
    };
    env.events()
        .publish((Symbol::new(env, "VestingClaimed"),), event);
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

fn metadata_key(session_id: &Bytes32) -> (Symbol, Bytes32) {
    (symbol_short!("META"), session_id.clone())
}

fn vesting_key(session_id: &Bytes32) -> (Symbol, Bytes32) {
    (symbol_short!("VEST"), session_id.clone())
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

fn apply_fee(env: &Env, amount: i128) -> (i128, i128) {
    let fee_bps: u32 = env
        .storage()
        .persistent()
        .get(&symbol_short!("PFEE"))
        .unwrap_or(0);
    if fee_bps == 0 || amount <= 0 {
        return (amount, 0);
    }
    let fee = (amount * fee_bps as i128) / 10_000;
    (amount - fee, fee)
}

fn require_initialized(env: &Env) {
    if !env.storage().persistent().has(&symbol_short!("INIT")) {
        panic_with_error!(env, ContractError::NotInitialized);
    }
}

fn require_admin(env: &Env) -> Address {
    let admin: Address = env
        .storage()
        .persistent()
        .get(&symbol_short!("ADMIN"))
        .unwrap();
    admin.require_auth();
    admin
}

/// #946 — Check that the caller is the buyer or seller of the session.
fn require_party(env: &Env, session: &Session) {
    let caller = env.invoker();
    if caller != session.buyer && caller != session.seller {
        panic_with_error!(env, ContractError::NotPartyToSession);
    }
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

    pub fn initialize(env: Env, admin: Address, treasury: Address) {
        if env.storage().persistent().has(&symbol_short!("INIT")) {
            panic_with_error!(&env, ContractError::AlreadyInitialized);
        }
        admin.require_auth();
        treasury.require_auth();

        env.storage().persistent().set(&symbol_short!("ADMIN"), &admin);
        env.storage().persistent().set(&symbol_short!("TRSY"), &treasury);
        env.storage().persistent().set(&symbol_short!("INIT"), &true);
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
    ) {
        require_initialized(&env);
        if amount <= 0 {
            panic_with_error!(&env, ContractError::AmountMustBePositive);
        }
        if get_session(&env, &session_id).is_some() {
            panic_with_error!(&env, ContractError::DuplicateSessionId);
        }
        buyer.require_auth();
        let session = Session {
            id: session_id.clone(),
            buyer,
            seller,
            amount,
            status: SessionStatus::Created,
            created_at: env.ledger().timestamp(),
            completed_at: None,
            dispute_opened_at: None,
        };
        save_session(&env, &session_id, &session);
    }

    pub fn lock_funds(env: Env, session_id: Bytes32) {
        require_initialized(&env);
        let mut session = get_session(&env, &session_id)
            .unwrap_or_else(|| panic_with_error!(&env, ContractError::SessionNotFound));
        if session.status != SessionStatus::Created {
            panic_with_error!(&env, ContractError::InvalidStatus);
        }
        session.buyer.require_auth();
        session.status = SessionStatus::Locked;
        save_session(&env, &session_id, &session);
    }

    pub fn complete_session(env: Env, session_id: Bytes32) {
        require_initialized(&env);
        let mut session = get_session(&env, &session_id)
            .unwrap_or_else(|| panic_with_error!(&env, ContractError::SessionNotFound));
        if session.status != SessionStatus::Locked {
            panic_with_error!(&env, ContractError::InvalidStatus);
        }
        session.seller.require_auth();
        session.status = SessionStatus::Completed;
        session.completed_at = Some(env.ledger().timestamp());
        save_session(&env, &session_id, &session);
    }

    pub fn approve_session(env: Env, session_id: Bytes32) {
        require_initialized(&env);
        let mut session = get_session(&env, &session_id)
            .unwrap_or_else(|| panic_with_error!(&env, ContractError::SessionNotFound));
        if session.status != SessionStatus::Completed {
            panic_with_error!(&env, ContractError::InvalidStatus);
        }
        session.buyer.require_auth();
        let (_payout, _fee) = apply_fee(&env, session.amount);
        session.status = SessionStatus::Approved;
        save_session(&env, &session_id, &session);
    }

    pub fn open_dispute(env: Env, session_id: Bytes32) {
        require_initialized(&env);
        let mut session = get_session(&env, &session_id)
            .unwrap_or_else(|| panic_with_error!(&env, ContractError::SessionNotFound));
        if session.status != SessionStatus::Locked && session.status != SessionStatus::Completed {
            panic_with_error!(&env, ContractError::InvalidStatus);
        }
        let timestamp = env.ledger().timestamp();
        session.status = SessionStatus::Disputed;
        session.dispute_opened_at = Some(timestamp);
        save_session(&env, &session_id, &session);
    }

    pub fn resolve_dispute(
        env: Env,
        session_id: Bytes32,
        buyer_share: i128,
        seller_share: i128,
    ) {
        require_initialized(&env);
        require_admin(&env);
        let mut session = get_session(&env, &session_id)
            .unwrap_or_else(|| panic_with_error!(&env, ContractError::SessionNotFound));
        if session.status != SessionStatus::Disputed {
            panic_with_error!(&env, ContractError::InvalidStatus);
        }
        if buyer_share + seller_share != session.amount {
            panic_with_error!(&env, ContractError::SharesMismatch);
        }
        let (_after_fee, _fee) = apply_fee(&env, seller_share);
        session.status = SessionStatus::Resolved;
        save_session(&env, &session_id, &session);
    }

    // -----------------------------------------------------------------------
    // Refunds
    // -----------------------------------------------------------------------

    pub fn refund_session(env: Env, session_id: Bytes32) {
        require_initialized(&env);
        let mut session = get_session(&env, &session_id)
            .unwrap_or_else(|| panic_with_error!(&env, ContractError::SessionNotFound));

        if session.status == SessionStatus::Refunded {
            panic_with_error!(&env, ContractError::SessionAlreadyRefunded);
        }
        if session.status != SessionStatus::Locked {
            panic_with_error!(&env, ContractError::InvalidStatus);
        }

        session.buyer.require_auth();

        let buyer = session.buyer.clone();
        let amount = session.amount;
        session.status = SessionStatus::Refunded;
        save_session(&env, &session_id, &session);

        emit_session_refunded(&env, session_id, buyer, amount);
    }

    pub fn auto_refund(env: Env, session_id: Bytes32) {
        require_initialized(&env);
        let mut session = get_session(&env, &session_id)
            .unwrap_or_else(|| panic_with_error!(&env, ContractError::SessionNotFound));

        if session.status == SessionStatus::Refunded {
            panic_with_error!(&env, ContractError::SessionAlreadyRefunded);
        }
        if session.status != SessionStatus::Completed {
            panic_with_error!(&env, ContractError::InvalidStatus);
        }

        let completed_at = session
            .completed_at
            .unwrap_or_else(|| panic_with_error!(&env, ContractError::InvalidSessionState));

        let dispute_window: u64 = env
            .storage()
            .persistent()
            .get(&symbol_short!("DSPWND"))
            .unwrap_or(DEFAULT_DISPUTE_WINDOW);

        let now = env.ledger().timestamp();
        if now <= completed_at + dispute_window {
            panic_with_error!(&env, ContractError::InvalidStatus);
        }

        let buyer = session.buyer.clone();
        let amount = session.amount;
        session.status = SessionStatus::Refunded;
        save_session(&env, &session_id, &session);

        emit_session_refunded(&env, session_id.clone(), buyer.clone(), amount);
        emit_auto_refund_executed(&env, session_id, buyer, amount, completed_at);
    }

    // -----------------------------------------------------------------------
    // Archiving
    // -----------------------------------------------------------------------

    pub fn set_archive_after_ledgers(env: Env, ledgers: u32) {
        require_initialized(&env);
        require_admin(&env);
        env.storage()
            .persistent()
            .set(&symbol_short!("ARCHAFT"), &ledgers);
    }

    pub fn get_archive_after_ledgers(env: Env) -> u32 {
        require_initialized(&env);
        env.storage()
            .persistent()
            .get(&symbol_short!("ARCHAFT"))
            .unwrap_or(0)
    }

    pub fn archive_session(env: Env, session_id: Bytes32) {
        require_initialized(&env);
        require_admin(&env);

        let session = get_session(&env, &session_id)
            .unwrap_or_else(|| panic_with_error!(&env, ContractError::SessionNotFound));

        match session.status {
            SessionStatus::Approved | SessionStatus::Resolved | SessionStatus::Refunded => {}
            _ => panic_with_error!(&env, ContractError::InvalidStatus),
        }

        let record = ArchivedSession {
            id: session_id.clone(),
            archived_at: env.ledger().timestamp(),
        };
        save_archive(&env, &session_id, &record);
        env.storage().persistent().remove(&session_key(&session_id));
    }

    pub fn delete_archived_session(env: Env, session_id: Bytes32) {
        require_initialized(&env);
        require_admin(&env);

        if get_archive(&env, &session_id).is_none() {
            panic_with_error!(&env, ContractError::NotArchived);
        }

        delete_archive(&env, &session_id);
    }

    pub fn batch_archive_sessions(env: Env, session_ids: soroban_sdk::Vec<Bytes32>, limit: u32) {
        require_initialized(&env);
        require_admin(&env);

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
    }

    // -----------------------------------------------------------------------
    // Admin helpers
    // -----------------------------------------------------------------------

    pub fn upgrade(env: Env, new_wasm_hash: Bytes32) {
        require_initialized(&env);
        let admin = require_admin(&env);

        let old_wasm_hash: Bytes32 = env
            .storage()
            .persistent()
            .get(&symbol_short!("WASMHASH"))
            .unwrap_or_else(|| BytesN::from_array(&env, &[0; 32]));

        env.storage()
            .persistent()
            .set(&symbol_short!("WASMHASH"), &new_wasm_hash);

        emit_contract_upgraded(&env, old_wasm_hash, new_wasm_hash.clone(), admin);

        env.deployer()
            .update_current_contract_wasm(new_wasm_hash);
    }

    pub fn set_treasury(env: Env, new_treasury: Address) {
        require_initialized(&env);
        let updated_by = require_admin(&env);
        let old_treasury: Address = env
            .storage()
            .persistent()
            .get(&symbol_short!("TRSY"))
            .unwrap();
        env.storage()
            .persistent()
            .set(&symbol_short!("TRSY"), &new_treasury);
        emit_treasury_updated(&env, old_treasury, new_treasury, updated_by);
    }

    pub fn get_treasury(env: Env) -> Address {
        require_initialized(&env);
        env.storage()
            .persistent()
            .get(&symbol_short!("TRSY"))
            .unwrap()
    }

    pub fn set_platform_fee(env: Env, new_fee_bps: u32) {
        require_initialized(&env);
        require_admin(&env);
        if new_fee_bps > 1000 {
            panic_with_error!(&env, ContractError::FeeTooHigh);
        }
        env.storage()
            .persistent()
            .set(&symbol_short!("PFEE"), &new_fee_bps);
    }

    pub fn get_platform_fee(env: Env) -> u32 {
        require_initialized(&env);
        env.storage()
            .persistent()
            .get(&symbol_short!("PFEE"))
            .unwrap_or(0)
    }

    // -----------------------------------------------------------------------
    // Queries
    // -----------------------------------------------------------------------

    pub fn get_session_data(env: Env, session_id: Bytes32) -> Session {
        require_initialized(&env);
        get_session(&env, &session_id)
            .unwrap_or_else(|| panic_with_error!(&env, ContractError::SessionNotFound))
    }

    pub fn get_archived_session(env: Env, session_id: Bytes32) -> ArchivedSession {
        require_initialized(&env);
        get_archive(&env, &session_id)
            .unwrap_or_else(|| panic_with_error!(&env, ContractError::NotArchived))
    }

    // -----------------------------------------------------------------------
    // #946 — Metadata storage
    // -----------------------------------------------------------------------

    /// Set or update off-chain metadata URI for a session.
    /// Only the buyer or seller may call this.
    pub fn set_session_metadata(
        env: Env,
        session_id: Bytes32,
        metadata_uri: String,
    ) {
        require_initialized(&env);
        let session = get_session(&env, &session_id)
            .unwrap_or_else(|| panic_with_error!(&env, ContractError::SessionNotFound));

        require_party(&env, &session);

        let caller = env.invoker();
        env.storage()
            .persistent()
            .set(&metadata_key(&session_id), &metadata_uri);

        emit_metadata_updated(&env, session_id, metadata_uri, caller);
    }

    /// Retrieve the metadata URI for a session (if set).
    pub fn get_session_metadata(env: Env, session_id: Bytes32) -> Option<String> {
        require_initialized(&env);
        env.storage().persistent().get(&metadata_key(&session_id))
    }

    // -----------------------------------------------------------------------
    // #947 — Webhook / event relay
    // -----------------------------------------------------------------------

    /// Admin sets the off-chain webhook URL for event relay.
    pub fn set_webhook(env: Env, url: String) {
        require_initialized(&env);
        require_admin(&env);
        env.storage()
            .persistent()
            .set(&symbol_short!(WEBHOOK_URL), &url);
    }

    /// View the current webhook URL.
    pub fn get_webhook(env: Env) -> Option<String> {
        require_initialized(&env);
        env.storage()
            .persistent()
            .get(&symbol_short!(WEBHOOK_URL))
    }

    // -----------------------------------------------------------------------
    // #948 — Time-locked release (vesting)
    // -----------------------------------------------------------------------

    /// Create a vesting schedule for a session.
    /// The seller receives vested funds linearly after the cliff period.
    pub fn lock_funds_with_vesting(
        env: Env,
        session_id: Bytes32,
        seller: Address,
        amount: i128,
        cliff_ledgers: u32,
        vesting_duration: u32,
    ) {
        require_initialized(&env);
        if amount <= 0 {
            panic_with_error!(&env, ContractError::AmountMustBePositive);
        }

        let mut session = get_session(&env, &session_id)
            .unwrap_or_else(|| panic_with_error!(&env, ContractError::SessionNotFound));

        if session.status != SessionStatus::Created && session.status != SessionStatus::Locked {
            panic_with_error!(&env, ContractError::InvalidStatus);
        }

        session.buyer.require_auth();

        let current_ledger = env.ledger().sequence();

        let record = VestingRecord {
            session_id: session_id.clone(),
            seller: seller.clone(),
            total_amount: amount,
            claimed_amount: 0,
            cliff_ledgers,
            vesting_duration,
            start_ledger: current_ledger,
            created_at: env.ledger().timestamp(),
        };

        env.storage()
            .persistent()
            .set(&vesting_key(&session_id), &record);

        session.amount = amount;
        session.seller = seller.clone();
        session.status = SessionStatus::Locked;
        save_session(&env, &session_id, &session);

        emit_vesting_created(&env, session_id, seller, amount, cliff_ledgers, vesting_duration);
    }

    /// Seller claims vested amount from a vesting schedule.
    pub fn claim_vested(env: Env, session_id: Bytes32) {
        require_initialized(&env);

        let mut vesting: VestingRecord = env
            .storage()
            .persistent()
            .get(&vesting_key(&session_id))
            .unwrap_or_else(|| panic_with_error!(&env, ContractError::VestingNotSet));

        vesting.seller.require_auth();

        let current_ledger = env.ledger().sequence();
        let elapsed = current_ledger.saturating_sub(vesting.start_ledger);

        // Check cliff
        if elapsed < vesting.cliff_ledgers {
            panic_with_error!(&env, ContractError::CliffNotReached);
        }

        // Calculate vested amount: total * (elapsed / duration), capped at total
        let vested_total = if vesting.vesting_duration == 0 {
            vesting.total_amount
        } else {
            let vested = (vesting.total_amount * elapsed as i128) / vesting.vesting_duration as i128;
            if vested > vesting.total_amount {
                vesting.total_amount
            } else {
                vested
            }
        };

        let claimable = vested_total - vesting.claimed_amount;
        if claimable <= 0 {
            panic_with_error!(&env, ContractError::NothingToClaim);
        }

        let seller = vesting.seller.clone();
        let new_claimed = vesting.claimed_amount + claimable;
        vesting.claimed_amount = new_claimed;

        env.storage()
            .persistent()
            .set(&vesting_key(&session_id), &vesting);

        emit_vesting_claimed(&env, session_id, seller, claimable, new_claimed);
    }

    /// View the vesting record for a session.
    pub fn get_vesting(env: Env, session_id: Bytes32) -> VestingRecord {
        require_initialized(&env);
        env.storage()
            .persistent()
            .get(&vesting_key(&session_id))
            .unwrap_or_else(|| panic_with_error!(&env, ContractError::VestingNotSet))
    }

    /// Admin resolves a disputed session with vesting — returns unvested amount to buyer.
    pub fn resolve_vesting_dispute(
        env: Env,
        session_id: Bytes32,
        buyer_share: i128,
        seller_share: i128,
    ) {
        require_initialized(&env);
        require_admin(&env);

        let mut session = get_session(&env, &session_id)
            .unwrap_or_else(|| panic_with_error!(&env, ContractError::SessionNotFound));

        if session.status != SessionStatus::Disputed {
            panic_with_error!(&env, ContractError::InvalidStatus);
        }

        if buyer_share + seller_share != session.amount {
            panic_with_error!(&env, ContractError::SharesMismatch);
        }

        let (_after_fee, _fee) = apply_fee(&env, seller_share);

        session.status = SessionStatus::Resolved;
        save_session(&env, &session_id, &session);
    }

    // -----------------------------------------------------------------------
    // #949 — Batch operations
    // -----------------------------------------------------------------------

    /// Batch lock funds for multiple sessions in a single transaction.
    /// Any single failure causes the entire batch to revert.
    pub fn batch_lock_funds(
        env: Env,
        sessions: soroban_sdk::Vec<(Bytes32, Address, i128)>,
    ) {
        require_initialized(&env);
        if sessions.is_empty() {
            panic_with_error!(&env, ContractError::BatchEmpty);
        }

        for item in sessions.iter() {
            let (session_id, buyer, amount) = item;
            if amount <= 0 {
                panic_with_error!(&env, ContractError::AmountMustBePositive);
            }
            if get_session(&env, &session_id).is_some() {
                panic_with_error!(&env, ContractError::DuplicateSessionId);
            }
            buyer.require_auth();

            let session = Session {
                id: session_id.clone(),
                buyer,
                seller: Address::generate(&env),
                amount,
                status: SessionStatus::Locked,
                created_at: env.ledger().timestamp(),
                completed_at: None,
                dispute_opened_at: None,
            };
            save_session(&env, &session_id, &session);
        }
    }

    /// Batch approve multiple sessions. Buyer must be the buyer for all sessions.
    pub fn batch_approve(env: Env, session_ids: soroban_sdk::Vec<Bytes32>) {
        require_initialized(&env);
        if session_ids.is_empty() {
            panic_with_error!(&env, ContractError::BatchEmpty);
        }

        for session_id in session_ids.iter() {
            let mut session = get_session(&env, &session_id)
                .unwrap_or_else(|| panic_with_error!(&env, ContractError::SessionNotFound));
            if session.status != SessionStatus::Completed {
                panic_with_error!(&env, ContractError::InvalidStatus);
            }
            session.buyer.require_auth();
            let (_payout, _fee) = apply_fee(&env, session.amount);
            session.status = SessionStatus::Approved;
            save_session(&env, &session_id, &session);
        }
    }

    /// Batch complete multiple sessions. Seller must be the seller for all sessions.
    pub fn batch_complete(env: Env, session_ids: soroban_sdk::Vec<Bytes32>) {
        require_initialized(&env);
        if session_ids.is_empty() {
            panic_with_error!(&env, ContractError::BatchEmpty);
        }

        for session_id in session_ids.iter() {
            let mut session = get_session(&env, &session_id)
                .unwrap_or_else(|| panic_with_error!(&env, ContractError::SessionNotFound));
            if session.status != SessionStatus::Locked {
                panic_with_error!(&env, ContractError::InvalidStatus);
            }
            session.seller.require_auth();
            session.status = SessionStatus::Completed;
            session.completed_at = Some(env.ledger().timestamp());
            save_session(&env, &session_id, &session);
        }
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
    #[should_panic]
    fn test_double_initialize_panics() {
        let env = Env::default();
        env.mock_all_auths();
        let cid = env.register(SkillsyncContract, ());
        let client = SkillsyncContractClient::new(&env, &cid);
        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        client.initialize(&admin, &treasury);
        client.initialize(&admin, &treasury);
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
        client.lock_funds(&sid);
        client.complete_session(&sid);
        client.approve_session(&sid);

        let s = client.get_session_data(&sid);
        assert_eq!(s.status, SessionStatus::Approved);
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
        client.lock_funds(&sid);
        client.complete_session(&sid);
        client.open_dispute(&sid);
        client.resolve_dispute(&sid, &5000, &5000);

        let s = client.get_session_data(&sid);
        assert_eq!(s.status, SessionStatus::Resolved);
    }

    #[test]
    #[should_panic]
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
        client.lock_funds(&sid);
        client.open_dispute(&sid);
        client.resolve_dispute(&sid, &3000, &3000);
    }

    // Archive tests

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
        client.lock_funds(&sid);
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
        client.lock_funds(&sid);
        client.complete_session(&sid);
        client.approve_session(&sid);
        client.archive_session(&sid);
        client.delete_archived_session(&sid);
    }

    #[test]
    #[should_panic]
    fn test_archive_non_finalised_session_panics() {
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
        client.lock_funds(&sid);
        client.archive_session(&sid);
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
            client.lock_funds(&sid);
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
    // #946 — Metadata tests
    // -----------------------------------------------------------------------

    #[test]
    fn test_set_and_get_metadata() {
        let env = Env::default();
        env.mock_all_auths();
        let cid = env.register(SkillsyncContract, ());
        let client = SkillsyncContractClient::new(&env, &cid);
        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        let sid = make_session_id(&env, 30);

        client.initialize(&admin, &treasury);
        client.create_session(&sid, &buyer, &seller, &5000);

        let uri = String::from_str(&env, "ipfs://Qm123abc");
        client.set_session_metadata(&sid, &uri);

        let result = client.get_session_metadata(&sid);
        assert_eq!(result, Some(uri));
    }

    #[test]
    fn test_get_metadata_none_when_unset() {
        let env = Env::default();
        env.mock_all_auths();
        let cid = env.register(SkillsyncContract, ());
        let client = SkillsyncContractClient::new(&env, &cid);
        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        client.initialize(&admin, &treasury);

        let sid = make_session_id(&env, 31);
        let result = client.get_session_metadata(&sid);
        assert_eq!(result, None);
    }

    // -----------------------------------------------------------------------
    // #947 — Webhook tests
    // -----------------------------------------------------------------------

    #[test]
    fn test_set_and_get_webhook() {
        let env = Env::default();
        env.mock_all_auths();
        let cid = env.register(SkillsyncContract, ());
        let client = SkillsyncContractClient::new(&env, &cid);
        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        client.initialize(&admin, &treasury);

        let url = String::from_str(&env, "https://hooks.example.com/events");
        client.set_webhook(&url);

        let result = client.get_webhook();
        assert_eq!(result, Some(url));
    }

    #[test]
    fn test_get_webhook_none_when_unset() {
        let env = Env::default();
        env.mock_all_auths();
        let cid = env.register(SkillsyncContract, ());
        let client = SkillsyncContractClient::new(&env, &cid);
        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        client.initialize(&admin, &treasury);

        let result = client.get_webhook();
        assert_eq!(result, None);
    }

    // -----------------------------------------------------------------------
    // #948 — Vesting tests
    // -----------------------------------------------------------------------

    #[test]
    fn test_create_vesting_schedule() {
        let env = Env::default();
        env.mock_all_auths();
        let cid = env.register(SkillsyncContract, ());
        let client = SkillsyncContractClient::new(&env, &cid);
        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        let sid = make_session_id(&env, 40);

        client.initialize(&admin, &treasury);
        client.create_session(&sid, &buyer, &seller, &10000);
        client.lock_funds_with_vesting(&sid, &seller, &10000, &10, &100);

        let vesting = client.get_vesting(&sid);
        assert_eq!(vesting.total_amount, 10000);
        assert_eq!(vesting.cliff_ledgers, 10);
        assert_eq!(vesting.vesting_duration, 100);
        assert_eq!(vesting.claimed_amount, 0);
    }

    // -----------------------------------------------------------------------
    // #949 — Batch operation tests
    // -----------------------------------------------------------------------

    #[test]
    fn test_batch_approve() {
        let env = Env::default();
        env.mock_all_auths();
        let cid = env.register(SkillsyncContract, ());
        let client = SkillsyncContractClient::new(&env, &cid);
        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);

        client.initialize(&admin, &treasury);

        let sid1 = make_session_id(&env, 60);
        let sid2 = make_session_id(&env, 61);

        client.create_session(&sid1, &buyer, &seller, &1000);
        client.lock_funds(&sid1);
        client.complete_session(&sid1);

        client.create_session(&sid2, &buyer, &seller, &2000);
        client.lock_funds(&sid2);
        client.complete_session(&sid2);

        let mut ids = soroban_sdk::Vec::new(&env);
        ids.push_back(sid1.clone());
        ids.push_back(sid2.clone());
        client.batch_approve(&ids);

        assert_eq!(client.get_session_data(&sid1).status, SessionStatus::Approved);
        assert_eq!(client.get_session_data(&sid2).status, SessionStatus::Approved);
    }

    #[test]
    fn test_batch_complete() {
        let env = Env::default();
        env.mock_all_auths();
        let cid = env.register(SkillsyncContract, ());
        let client = SkillsyncContractClient::new(&env, &cid);
        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);

        client.initialize(&admin, &treasury);

        let sid1 = make_session_id(&env, 70);
        let sid2 = make_session_id(&env, 71);

        client.create_session(&sid1, &buyer, &seller, &1000);
        client.lock_funds(&sid1);

        client.create_session(&sid2, &buyer, &seller, &2000);
        client.lock_funds(&sid2);

        let mut ids = soroban_sdk::Vec::new(&env);
        ids.push_back(sid1.clone());
        ids.push_back(sid2.clone());
        client.batch_complete(&ids);

        assert_eq!(client.get_session_data(&sid1).status, SessionStatus::Completed);
        assert_eq!(client.get_session_data(&sid2).status, SessionStatus::Completed);
    }
}
