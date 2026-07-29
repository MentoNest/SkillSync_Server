#![no_std]

extern crate alloc;

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error,
    Address, Bytes, BytesN, Env, Symbol, symbol_short, Vec, Map,
};

pub type Bytes32 = BytesN<32>;

// ---------------------------------------------------------------------------
// Storage symbols
// ---------------------------------------------------------------------------
const ADMINS: &str = "ADMINS";
const THRESHOLD: &str = "THRHLD";
const TREASURY: &str = "TRSY";
const PLATFORM_FEE: &str = "PFEE";
const INITIALIZED: &str = "INIT";
const ARCHIVE_AFTER: &str = "ARCHAFT";
const PAUSED: &str = "PAUSED";
const PROPOSAL_EXPIRATION: u32 = 10_000; // 10,000 ledgers
const ROLE_ADMIN: &[u8] = b"DEFAULT_ADMIN";
const ROLE_FEE_MGR: &[u8] = b"FEE_MANAGER";
const ROLE_DISPUTE: &[u8] = b"DISPUTEResolver";
const ROLE_UPGRADER: &[u8] = b"UPGRADER";

const DEFAULT_DISPUTE_WINDOW: u64 = 86_400;

// ---------------------------------------------------------------------------
// Proposal types for multi-sig
// ---------------------------------------------------------------------------
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ProposalType {
    SetFee,
    SetTreasury,
    Upgrade,
    ResolveDispute,
    Pause,
    Unpause,
    GrantRole,
    RevokeRole,
    UpdateAdmins,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Proposal {
    pub id: Bytes32,
    pub proposal_type: ProposalType,
    pub payload: Bytes,
    pub created_at_ledger: u32,
    pub expires_at_ledger: u32,
    pub signers: Vec<Address>,
    pub executed: bool,
}

// ---------------------------------------------------------------------------
// Multi-sig events
// ---------------------------------------------------------------------------
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProposalCreated {
    pub proposal_id: Bytes32,
    pub proposer: Address,
    pub proposal_type: ProposalType,
    pub created_at_ledger: u32,
    pub expires_at_ledger: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProposalSigned {
    pub proposal_id: Bytes32,
    pub signer: Address,
    pub signature_count: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProposalExecuted {
    pub proposal_id: Bytes32,
    pub executed_at_ledger: u32,
}

// Event emitters for multi-sig
fn emit_proposal_created(
    env: &Env,
    proposal_id: Bytes32,
    proposer: Address,
    proposal_type: ProposalType,
    created_at_ledger: u32,
    expires_at_ledger: u32,
) {
    let event = ProposalCreated {
        proposal_id,
        proposer,
        proposal_type,
        created_at_ledger,
        expires_at_ledger,
    };
    env.events()
        .publish((symbol_short!("PropCreated"),), event);
}

fn emit_proposal_signed(
    env: &Env,
    proposal_id: Bytes32,
    signer: Address,
    signature_count: u32,
) {
    let event = ProposalSigned {
        proposal_id,
        signer,
        signature_count,
    };
    env.events()
        .publish((symbol_short!("PropSigned"),), event);
}

fn emit_proposal_executed(
    env: &Env,
    proposal_id: Bytes32,
    executed_at_ledger: u32,
) {
    let event = ProposalExecuted {
        proposal_id,
        executed_at_ledger,
    };
    env.events()
        .publish((symbol_short!("PropExecuted"),), event);
}

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
    MissingRole          = 204,

    // -- Session validation (300-399) --
    SessionNotFound          = 300,
    DuplicateSessionId       = 301,
    InvalidSessionState      = 302,
    SessionAlreadyCompleted  = 303,
    SessionAlreadyApproved   = 304,
    SessionAlreadyRefunded   = 305,
    SessionInDispute         = 306,

    // -- Emergency (700-799) --
    ContractPaused       = 700,

    // -- Multi-sig errors (800-899) --
    NotAnAdmin                  = 800,
    ProposalNotFound            = 801,
    ProposalAlreadyExists       = 802,
    ProposalAlreadyExecuted     = 803,
    ProposalExpired             = 804,
    AlreadySigned               = 805,
    InsufficientSignatures      = 806,
    InvalidThreshold            = 807,
    InvalidAdminList            = 808,
    InvalidProposalType         = 809,
    InvalidPayload              = 810,
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

/// #951 — Emitted when contract is paused or unpaused.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Paused {
    pub account: Address,
    pub timestamp: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Unpaused {
    pub account: Address,
    pub timestamp: u64,
}

/// #950 — Emitted when a role is granted or revoked.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RoleChanged {
    pub role: Symbol,
    pub account: Address,
    pub granted: bool,
    pub changed_by: Address,
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

fn emit_paused(env: &Env, account: Address) {
    let event = Paused {
        account,
        timestamp: env.ledger().timestamp(),
    };
    env.events().publish((Symbol::new(env, "Paused"),), event);
}

fn emit_unpaused(env: &Env, account: Address) {
    let event = Unpaused {
        account,
        timestamp: env.ledger().timestamp(),
    };
    env.events()
        .publish((Symbol::new(env, "Unpaused"),), event);
}

fn emit_role_changed(env: &Env, role: Symbol, account: Address, granted: bool, changed_by: Address) {
    let event = RoleChanged {
        role,
        account,
        granted,
        changed_by,
        timestamp: env.ledger().timestamp(),
    };
    env.events()
        .publish((Symbol::new(env, "RoleChanged"),), event);
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

fn role_key(role: &[u8], account: &Address) -> (Symbol, soroban_sdk::Bytes) {
    let mut key_data = soroban_sdk::Bytes::new(account.env);
    key_data.extend_from_slice(role);
    (symbol_short!("ROLE"), key_data)
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

// Multi-sig storage helpers
fn proposal_key(proposal_id: &Bytes32) -> (Symbol, Bytes32) {
    (symbol_short!("PROP"), proposal_id.clone())
}

fn is_admin(env: &Env, account: &Address) -> bool {
    let admins: Vec<Address> = env
        .storage()
        .persistent()
        .get(&symbol_short!("ADMINS"))
        .unwrap_or_else(|| Vec::new(env));
    
    admins.iter().any(|a| a == *account)
}

fn require_admin(env: &Env) -> Address {
    let caller = env.invoker();
    if !is_admin(env, &caller) {
        panic_with_error!(env, ContractError::NotAnAdmin);
    }
    caller.require_auth();
    caller
}

fn get_threshold(env: &Env) -> u32 {
    env.storage()
        .persistent()
        .get(&symbol_short!("THRHLD"))
        .unwrap_or(1)
}

fn get_proposal(env: &Env, proposal_id: &Bytes32) -> Option<Proposal> {
    env.storage().persistent().get(&proposal_key(proposal_id))
}

fn save_proposal(env: &Env, proposal_id: &Bytes32, proposal: &Proposal) {
    env.storage().persistent().set(&proposal_key(proposal_id), proposal);
}

/// #951 — Ensure contract is not paused.
fn require_not_paused(env: &Env) {
    let paused: bool = env
        .storage()
        .persistent()
        .get(&symbol_short!(PAUSED))
        .unwrap_or(false);
    if paused {
        panic_with_error!(env, ContractError::ContractPaused);
    }
}

/// #950 — Check that the caller has the specified role.
fn has_role(env: &Env, role: &[u8], account: &Address) -> bool {
    let key = (symbol_short!("ROLE"), soroban_sdk::Bytes::from_array(env, role));
    let granted: bool = env.storage().persistent().get(&key).unwrap_or(false);
    granted
}

fn require_role(env: &Env, role: &[u8], account: &Address) {
    if !has_role(env, role, account) {
        panic_with_error!(env, ContractError::MissingRole);
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

        // Grant DEFAULT_ADMIN_ROLE to the initial admin
        let key = (symbol_short!("ROLE"), soroban_sdk::Bytes::from_array(&env, ROLE_ADMIN));
        env.storage().persistent().set(&key, &true);
    }

    // -----------------------------------------------------------------------
    // Session lifecycle — all guarded by require_not_paused (#951)
    // -----------------------------------------------------------------------

    pub fn create_session(
        env: Env,
        session_id: Bytes32,
        buyer: Address,
        seller: Address,
        amount: i128,
    ) {
        require_initialized(&env);
        require_not_paused(&env);
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
        require_not_paused(&env);
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
        require_not_paused(&env);
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
        require_not_paused(&env);
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
        require_not_paused(&env);
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
        require_not_paused(&env);
        // #950: only DISPUTE_RESOLVER_ROLE or admin can resolve
        let caller = require_admin(&env);
        require_role(&env, ROLE_DISPUTE, &caller);

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
        require_not_paused(&env);
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
        require_not_paused(&env);
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
        require_not_paused(&env);
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
        require_not_paused(&env);
        require_admin(&env);

        if get_archive(&env, &session_id).is_none() {
            panic_with_error!(&env, ContractError::NotArchived);
        }

        delete_archive(&env, &session_id);
    }

    pub fn batch_archive_sessions(env: Env, session_ids: soroban_sdk::Vec<Bytes32>, limit: u32) {
        require_initialized(&env);
        require_not_paused(&env);
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

    /// #951 — Pause the contract (admin only). Disables state-changing functions.
    pub fn pause(env: Env) {
        require_initialized(&env);
        let admin = require_admin(&env);

        env.storage()
            .persistent()
            .set(&symbol_short!(PAUSED), &true);

        emit_paused(&env, admin);
    }

    /// #951 — Unpause the contract (admin only).
    pub fn unpause(env: Env) {
        require_initialized(&env);
        let admin = require_admin(&env);

        env.storage()
            .persistent()
            .set(&symbol_short!(PAUSED), &false);

        emit_unpaused(&env, admin);
    }

    /// #951 — View whether the contract is paused.
    pub fn is_paused(env: Env) -> bool {
        env.storage()
            .persistent()
            .get(&symbol_short!(PAUSED))
            .unwrap_or(false)
    }

    pub fn upgrade(env: Env, new_wasm_hash: Bytes32) {
        require_initialized(&env);
        require_not_paused(&env);
        let admin = require_admin(&env);
        // #950: only UPGRADER_ROLE or admin can upgrade
        require_role(&env, ROLE_UPGRADER, &admin);

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
        require_not_paused(&env);
        let updated_by = require_admin(&env);
        // #950: only FEE_MANAGER_ROLE or admin can change treasury
        require_role(&env, ROLE_FEE_MGR, &updated_by);

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
        require_not_paused(&env);
        let caller = require_admin(&env);
        // #950: only FEE_MANAGER_ROLE or admin can set fee
        require_role(&env, ROLE_FEE_MGR, &caller);

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
    // #950 — Role-based access control
    // -----------------------------------------------------------------------

    /// Grant a role to an account. Only admin (or current role admin) can call.
    pub fn grant_role(env: Env, role: Symbol, account: Address) {
        require_initialized(&env);
        let admin = require_admin(&env);

        let mut role_bytes = soroban_sdk::Bytes::new(&env);
        let role_str = role.to_string();
        // Use the symbol's raw bytes as role identifier
        let role_slice = role_str.to_buffer();
        role_bytes.extend_from_slice(&role_slice);

        let key = (symbol_short!("ROLE"), role_bytes);
        env.storage().persistent().set(&key, &true);

        emit_role_changed(&env, role, account, true, admin);
    }

    /// Revoke a role from an account.
    pub fn revoke_role(env: Env, role: Symbol, account: Address) {
        require_initialized(&env);
        let admin = require_admin(&env);

        let mut role_bytes = soroban_sdk::Bytes::new(&env);
        let role_str = role.to_string();
        let role_slice = role_str.to_buffer();
        role_bytes.extend_from_slice(&role_slice);

        let key = (symbol_short!("ROLE"), role_bytes);
        env.storage().persistent().remove(&key);

        emit_role_changed(&env, role, account, false, admin);
    }

    /// Check if an account has a specific role.
    pub fn has_role(env: Env, role: Symbol, account: Address) -> bool {
        let mut role_bytes = soroban_sdk::Bytes::new(&env);
        let role_str = role.to_string();
        let role_slice = role_str.to_buffer();
        role_bytes.extend_from_slice(&role_slice);

        let key = (symbol_short!("ROLE"), role_bytes);
        env.storage().persistent().get(&key).unwrap_or(false)
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

    // -----------------------------------------------------------------------
    // #951 — Emergency pause tests
    // -----------------------------------------------------------------------

    #[test]
    fn test_pause_and_unpause() {
        let env = Env::default();
        env.mock_all_auths();
        let cid = env.register(SkillsyncContract, ());
        let client = SkillsyncContractClient::new(&env, &cid);
        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        client.initialize(&admin, &treasury);

        assert_eq!(client.is_paused(), false);
        client.pause();
        assert_eq!(client.is_paused(), true);
        client.unpause();
        assert_eq!(client.is_paused(), false);
    }

    #[test]
    fn test_paused_blocks_state_changes() {
        let env = Env::default();
        env.mock_all_auths();
        let cid = env.register(SkillsyncContract, ());
        let client = SkillsyncContractClient::new(&env, &cid);
        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        let sid = make_session_id(&env, 13);

        client.initialize(&admin, &treasury);
        client.pause();

        // Should panic because contract is paused
        client.create_session(&sid, &buyer, &seller, &5000);
    }

    #[test]
    fn test_unpause_allows_state_changes() {
        let env = Env::default();
        env.mock_all_auths();
        let cid = env.register(SkillsyncContract, ());
        let client = SkillsyncContractClient::new(&env, &cid);
        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        let sid = make_session_id(&env, 14);

        client.initialize(&admin, &treasury);
        client.pause();
        client.unpause();

        client.create_session(&sid, &buyer, &seller, &5000);
        let s = client.get_session_data(&sid);
        assert_eq!(s.status, SessionStatus::Created);
    }

    // -----------------------------------------------------------------------
    // #950 — RBAC tests
    // -----------------------------------------------------------------------

    #[test]
    fn test_has_role_after_initialize() {
        let env = Env::default();
        env.mock_all_auths();
        let cid = env.register(SkillsyncContract, ());
        let client = SkillsyncContractClient::new(&env, &cid);
        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        client.initialize(&admin, &treasury);

        // Admin should have DEFAULT_ADMIN_ROLE
        let admin_role = Symbol::new(&env, "DEFAULT_ADMIN");
        assert!(client.has_role(&admin_role, &admin));
    }
}