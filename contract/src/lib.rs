#![no_std]

extern crate alloc;

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error,
    Address, BytesN, Env, Symbol, symbol_short,
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

/// Default dispute window (seconds) before a completed session may auto-refund.
const DEFAULT_DISPUTE_WINDOW: u64 = 86_400;

// ---------------------------------------------------------------------------
// Error codes
//
// Standard error codes for the contract. Codes are unique across the whole
// enum and grouped into reserved ranges by category; see
// `contract/docs/errors.md` for the full spec.
//
//   0-99    General / uncategorized errors
//   100-199 Initialization errors
//   200-299 Authorization errors
//   300-399 Session validation errors
// ---------------------------------------------------------------------------
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
pub enum ContractError {
    AlreadyInitialized   = 1,
    NotInitialized       = 2,
    Unauthorized         = 3,
    SessionAlreadyExists = 4,
    SessionNotFound      = 5,
    // -- General (0-99) --
    AmountMustBePositive = 6,
    InvalidStatus        = 7,
    TransferFailed       = 9,
    FeeExceedsAmount     = 10,
    AlreadyArchived      = 12,
    NotArchived          = 13,

    // -- Financial validation errors (#940) --------------------------------
    /// Amount is zero or negative.
    InvalidAmount           = 400,
    /// Buyer has insufficient funds.
    InsufficientBalance     = 401,
    /// Fee exceeds maximum (1000 bps).
    FeeTooHigh              = 402,
    /// Dispute split does not sum to amount.
    InvalidSplit            = 403,
    /// Arithmetic overflow detected.
    Overflow                = 404,

    // -- Timeout and dispute errors (#941) ----------------------------------
    /// Cannot auto-refund yet.
    DisputeWindowNotElapsed = 500,
    /// Dispute already exists for session.
    DisputeAlreadyOpen      = 501,
    /// No open dispute to resolve.
    DisputeNotOpen          = 502,
    /// Session not eligible for resolution.
    ResolutionNotAllowed    = 503,
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
// Archive record (minimal data — just a hash marker)
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

/// Emitted when the contract WASM is upgraded (admin-only).
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ContractUpgraded {
    pub old_wasm_hash: Bytes32,
    pub new_wasm_hash: Bytes32,
    pub upgraded_by: Address,
    pub timestamp: u64,
}

/// Emitted when a buyer successfully refunds a session (manual or auto).
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SessionRefunded {
    pub session_id: Bytes32,
    pub buyer: Address,
    pub amount: i128,
    pub timestamp: u64,
}

/// Distinct event for timeout-based auto-refunds.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AutoRefundExecuted {
    pub session_id: Bytes32,
    pub buyer: Address,
    pub amount: i128,
    pub completed_at: u64,
    pub refunded_at: u64,
}

/// Emitted when admin changes the treasury wallet.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TreasuryUpdated {
    pub old_treasury: Address,
    pub new_treasury: Address,
    pub updated_by: Address,
}

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

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------
fn session_key(session_id: &Bytes32) -> (soroban_sdk::Symbol, Bytes32) {
    (symbol_short!("SES"), session_id.clone())
}

fn archive_key(session_id: &Bytes32) -> (soroban_sdk::Symbol, Bytes32) {
    (symbol_short!("ARC"), session_id.clone())
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

    /// Initialise the contract (one-time).
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
            panic_with_error!(&env, ContractError::InvalidAmount);
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
        if session.status == SessionStatus::Disputed {
            panic_with_error!(&env, ContractError::DisputeAlreadyOpen);
        }
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
            panic_with_error!(&env, ContractError::DisputeNotOpen);
        }
        if buyer_share + seller_share != session.amount {
            panic_with_error!(&env, ContractError::InvalidSplit);
        }
        let (_after_fee, _fee) = apply_fee(&env, seller_share);
        session.status = SessionStatus::Resolved;
        save_session(&env, &session_id, &session);
    }

    // -----------------------------------------------------------------------
    // Refunds
    // -----------------------------------------------------------------------

    /// Buyer-initiated refund while the session is still Locked.
    /// Emits `SessionRefunded`.
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

    /// Timeout auto-refund for sessions stuck in Completed beyond the dispute window.
    /// Emits both `SessionRefunded` and `AutoRefundExecuted`.
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

        // SessionRefunded is emitted for both manual and auto refunds.
        emit_session_refunded(&env, session_id.clone(), buyer.clone(), amount);
        emit_auto_refund_executed(&env, session_id, buyer, amount, completed_at);
    }

    // -----------------------------------------------------------------------
    // Issue #965 — Storage cleanup and archiving
    // -----------------------------------------------------------------------

    /// Set the ledger-age after which finalised sessions may be archived.
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

    /// Move a finalised session into archive storage.
    /// The full session record is removed; only a minimal ArchivedSession
    /// (id + timestamp) is kept. Archived sessions cannot be restored.
    pub fn archive_session(env: Env, session_id: Bytes32) {
        require_initialized(&env);
        require_admin(&env);

        let session = get_session(&env, &session_id)
            .unwrap_or_else(|| panic_with_error!(&env, ContractError::SessionNotFound));

        // Only finalised sessions may be archived
        match session.status {
            SessionStatus::Approved | SessionStatus::Resolved | SessionStatus::Refunded => {}
            _ => panic_with_error!(&env, ContractError::InvalidStatus),
        }

        // Write minimal archive record
        let record = ArchivedSession {
            id: session_id.clone(),
            archived_at: env.ledger().timestamp(),
        };
        save_archive(&env, &session_id, &record);

        // Remove full session data from persistent storage
        env.storage().persistent().remove(&session_key(&session_id));
    }

    /// Permanently remove an archived session after the archive period.
    pub fn delete_archived_session(env: Env, session_id: Bytes32) {
        require_initialized(&env);
        require_admin(&env);

        if get_archive(&env, &session_id).is_none() {
            panic_with_error!(&env, ContractError::NotArchived);
        }

        delete_archive(&env, &session_id);
    }

    /// Gas-limited batch archival of finalised sessions.
    /// Callers must supply the list of session IDs to process; `limit` caps
    /// how many are actually archived in this invocation.
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

    /// Upgrade contract WASM. Admin only. Emits `ContractUpgraded`.
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

        emit_contract_upgraded(
            &env,
            old_wasm_hash,
            new_wasm_hash.clone(),
            admin,
        );

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
        // Leak env to satisfy 'static bound on client – acceptable in tests
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
        client.resolve_dispute(&sid, &3000, &3000); // 6000 != 10000
    }

    // Issue #965 — archive tests

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
        // Session is Locked (not finalised) — should panic
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

        // Both should now be archived
        let r1 = client.get_archived_session(&sid1);
        assert_eq!(r1.id, sid1);
        let r2 = client.get_archived_session(&sid2);
        assert_eq!(r2.id, sid2);
    }
}
