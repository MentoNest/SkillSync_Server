#![no_std]

extern crate alloc;

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error,
    Address, BytesN, Env, String, Symbol, symbol_short,
    Address, Bytes, BytesN, Env, String, Symbol, symbol_short, Vec, Map,
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
const WEBHOOK_URL: &str = "WHURL";
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
    /// Milestone percentage does not sum to 10000 bps (100%).
    MilestoneSumInvalid     = 405,
    /// Milestone index out of bounds.
    MilestoneNotFound       = 406,
    /// Milestone already released.
    MilestoneAlreadyReleased = 407,
    /// Cannot release milestone during dispute.
    MilestoneLockedByDispute = 408,
    /// Rating must be between 1 and 5.
    InvalidRating           = 409,
    /// Rating already submitted for this party in this session.
    RatingAlreadySubmitted  = 410,
    /// Session not yet approved; ratings not allowed.
    SessionNotApproved      = 411,
    /// Insurance pool is not active.
    InsurancePoolInactive   = 412,
    /// Insurance claim not found.
    ClaimNotFound           = 413,
    /// Claim already resolved.
    ClaimAlreadyResolved    = 414,

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
    NotPartyToSession    = 204,
    MissingRole          = 204,

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
    // -- Emergency (700-799) --
    ContractPaused       = 701,
    ReentrancyDetected   = 700,

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
    // -- Rate limiting (800-899) --
    RateLimitExceeded    = 800,
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
    pub released_amount: i128,
}

// ---------------------------------------------------------------------------
// Milestone types (Issue 1)
// ---------------------------------------------------------------------------
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Milestone {
    pub percentage_bps: u32,
    pub description: String,
    pub released: bool,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MilestoneReleased {
    pub session_id: Bytes32,
    pub milestone_index: u32,
    pub amount: i128,
}

// ---------------------------------------------------------------------------
// Rating types (Issue 2)
// ---------------------------------------------------------------------------
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Rating {
    pub from: Address,
    pub to: Address,
    pub session_id: Bytes32,
    pub rating: u8,
    pub comment: String,
    pub timestamp: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RatingSubmitted {
    pub session_id: Bytes32,
    pub from: Address,
    pub to: Address,
    pub rating: u8,
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
// Insurance pool types (Issue 3)
// ---------------------------------------------------------------------------
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ClaimStatus {
    Pending,
    Approved,
    Rejected,
    Paid,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct InsuranceClaim {
    pub id: Bytes32,
    pub session_id: Bytes32,
    pub claimant: Address,
    pub amount: i128,
    pub status: ClaimStatus,
    pub created_at: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct InsuranceContributed {
    pub contributor: Address,
    pub amount: i128,
    pub timestamp: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct InsuranceClaimFiled {
    pub claim_id: Bytes32,
    pub session_id: Bytes32,
    pub claimant: Address,
    pub amount: i128,
    pub timestamp: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct InsuranceClaimResolved {
    pub claim_id: Bytes32,
    pub status: ClaimStatus,
    pub resolved_by: Address,
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

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RateLimitHit {
    pub address: Address,
    pub current_count: u32,
    pub max_sessions: u32,
    pub window_ledger: u32,
    pub timestamp: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RateLimitUpdated {
    pub max_sessions: u32,
    pub window_ledgers: u32,
    pub updated_by: Address,
    pub timestamp: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct WhitelistUpdated {
    pub address: Address,
    pub added: bool,
    pub updated_by: Address,
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

fn emit_rate_limit_hit(env: &Env, address: Address, current_count: u32, max_sessions: u32, window_ledger: u32) {
    let event = RateLimitHit {
        address,
        current_count,
        max_sessions,
        window_ledger,
        timestamp: env.ledger().timestamp(),
    };
    env.events()
        .publish((Symbol::new(env, "RateLimitHit"),), event);
}

fn emit_rate_limit_updated(env: &Env, max_sessions: u32, window_ledgers: u32, updated_by: Address) {
    let event = RateLimitUpdated {
        max_sessions,
        window_ledgers,
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
        .publish((Symbol::new(env, "RateLimitUpdated"),), event);
}

fn emit_whitelist_updated(env: &Env, address: Address, added: bool, updated_by: Address) {
    let event = WhitelistUpdated {
        address,
        added,
        updated_by,
        timestamp: env.ledger().timestamp(),
    };
    env.events()
        .publish((Symbol::new(env, "WhitelistUpdated"),), event);
}

// Milestone event emitters
fn emit_milestone_released(env: &Env, session_id: Bytes32, milestone_index: u32, amount: i128) {
    let event = MilestoneReleased {
        session_id,
        milestone_index,
        amount,
    };
    env.events()
        .publish((Symbol::new(env, "MilestoneReleased"),), event);
}

// Rating event emitters
fn emit_rating_submitted(env: &Env, session_id: Bytes32, from: Address, to: Address, rating: u8) {
    let event = RatingSubmitted {
        session_id,
        from,
        to,
        rating,
    };
    env.events()
        .publish((Symbol::new(env, "RatingSubmitted"),), event);
}

// Insurance pool event emitters
fn emit_insurance_contributed(env: &Env, contributor: Address, amount: i128) {
    let event = InsuranceContributed {
        contributor,
        amount,
        timestamp: env.ledger().timestamp(),
    };
    env.events()
        .publish((Symbol::new(env, "InsuranceContributed"),), event);
}

fn emit_insurance_claim_filed(env: &Env, claim_id: Bytes32, session_id: Bytes32, claimant: Address, amount: i128) {
    let event = InsuranceClaimFiled {
        claim_id,
        session_id,
        claimant,
        amount,
        timestamp: env.ledger().timestamp(),
    };
    env.events()
        .publish((Symbol::new(env, "InsuranceClaimFiled"),), event);
}

fn emit_insurance_claim_resolved(env: &Env, claim_id: Bytes32, status: ClaimStatus, resolved_by: Address) {
    let event = InsuranceClaimResolved {
        claim_id,
        status,
        resolved_by,
        timestamp: env.ledger().timestamp(),
    };
    env.events()
        .publish((Symbol::new(env, "InsuranceClaimResolved"),), event);
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
fn role_key(role: &[u8], account: &Address) -> (Symbol, soroban_sdk::Bytes) {
    let mut key_data = soroban_sdk::Bytes::new(account.env);
    key_data.extend_from_slice(role);
    (symbol_short!("ROLE"), key_data)
}

fn session_count_key(address: &Address, window_ledger: u32) -> (Symbol, Address, u32) {
    (symbol_short!("SESSCNT"), address.clone(), window_ledger)
}

fn whitelist_key(address: &Address) -> (Symbol, Address) {
    (symbol_short!("WHITELST"), address.clone())
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

// Milestone storage helpers
fn milestone_key(session_id: &Bytes32) -> (Symbol, Bytes32) {
    (symbol_short!("MILE"), session_id.clone())
}

fn save_milestones(env: &Env, session_id: &Bytes32, milestones: &Vec<Milestone>) {
    env.storage().persistent().set(&milestone_key(session_id), milestones);
}

fn get_milestones(env: &Env, session_id: &Bytes32) -> Option<Vec<Milestone>> {
    env.storage().persistent().get(&milestone_key(session_id))
}

// Rating storage helpers
fn rating_key(session_id: &Bytes32, from: &Address, to: &Address) -> (Symbol, Bytes32, Address, Address) {
    (symbol_short!("RAT"), session_id.clone(), from.clone(), to.clone())
}

fn user_rating_key(address: &Address) -> (Symbol, Address) {
    (symbol_short!("RATAGG"), address.clone())
}

fn save_rating(env: &Env, session_id: &Bytes32, from: &Address, to: &Address, rating: &Rating) {
    env.storage().persistent().set(&rating_key(session_id, from, to), rating);
}

fn get_rating(env: &Env, session_id: &Bytes32, from: &Address, to: &Address) -> Option<Rating> {
    env.storage().persistent().get(&rating_key(session_id, from, to))
}

fn get_user_rating_aggregate(env: &Env, address: &Address) -> (u64, u32) {
    env.storage().persistent().get(&user_rating_key(address)).unwrap_or((0, 0))
}

fn set_user_rating_aggregate(env: &Env, address: &Address, total: u64, count: u32) {
    env.storage().persistent().set(&user_rating_key(address), &(total, count));
}

// Insurance pool storage helpers
const INSURANCE_POOL_BALANCE: &str = "INSPOOL";
const INSURANCE_CLAIM_COUNT: &str = "INSCLMCT";

fn insurance_claim_key(claim_id: &Bytes32) -> (Symbol, Bytes32) {
    (symbol_short!("INSCLM"), claim_id.clone())
}

fn save_insurance_claim(env: &Env, claim_id: &Bytes32, claim: &InsuranceClaim) {
    env.storage().persistent().set(&insurance_claim_key(claim_id), claim);
}

fn get_insurance_claim(env: &Env, claim_id: &Bytes32) -> Option<InsuranceClaim> {
    env.storage().persistent().get(&insurance_claim_key(claim_id))
}

fn next_claim_id(env: &Env) -> Bytes32 {
    let count: u32 = env.storage().persistent().get(&symbol_short!(INSURANCE_CLAIM_COUNT)).unwrap_or(0);
    let new_count = count + 1;
    env.storage().persistent().set(&symbol_short!(INSURANCE_CLAIM_COUNT), &new_count);
    let mut bytes = [0u8; 32];
    bytes[0] = (count >> 24) as u8;
    bytes[1] = ((count >> 16) & 0xff) as u8;
    bytes[2] = ((count >> 8) & 0xff) as u8;
    bytes[3] = (count & 0xff) as u8;
    Bytes32::from_array(env, &bytes)
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
// Reentrancy guard
// ---------------------------------------------------------------------------
const REENTRANCY_GUARD: &str = "REENTRANT";

fn enter_reentrancy_guard(env: &Env) {
    let is_entered: bool = env.storage().persistent().get(&symbol_short!(REENTRANCY_GUARD)).unwrap_or(false);
    if is_entered {
        panic_with_error!(env, ContractError::ReentrancyDetected);
    }
    env.storage().persistent().set(&symbol_short!(REENTRANCY_GUARD), &true);
}

fn exit_reentrancy_guard(env: &Env) {
    env.storage().persistent().remove(&symbol_short!(REENTRANCY_GUARD));
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
            released_amount: 0,
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

        // Check rate limiting
        let max_sessions: u32 = env.storage().persistent().get(&symbol_short!("MAXSESS")).unwrap_or(0);
        let window_ledgers: u32 = env.storage().persistent().get(&symbol_short!("WINDLED")).unwrap_or(0);
        
        if max_sessions > 0 && window_ledgers > 0 {
            let is_whitelisted: bool = env.storage().persistent().get(&whitelist_key(&session.buyer)).unwrap_or(false);
            if !is_whitelisted {
                let current_ledger = env.ledger().sequence();
                let current_window = current_ledger / window_ledgers;
                let count_key = session_count_key(&session.buyer, current_window);
                let current_count: u32 = env.storage().temporary().get(&count_key).unwrap_or(0);
                
                if current_count >= max_sessions {
                    emit_rate_limit_hit(&env, session.buyer.clone(), current_count, max_sessions, current_window);
                    panic_with_error!(&env, ContractError::RateLimitExceeded);
                }
                
                // Increment count and extend temporary storage lifetime
                env.storage().temporary().set(&count_key, &(current_count + 1));
                env.storage().temporary().extend_ttl(&count_key, window_ledgers, window_ledgers);
            }
        }

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
        require_not_paused(&env);
        // #950: only DISPUTE_RESOLVER_ROLE or admin can resolve
        let caller = require_admin(&env);
        require_role(&env, ROLE_DISPUTE, &caller);

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

    // -----------------------------------------------------------------------
    // Rate limiting
    // -----------------------------------------------------------------------

    pub fn set_rate_limit(env: Env, max_sessions: u32, window_ledgers: u32) {
        require_initialized(&env);
        require_not_paused(&env);
        let admin = require_admin(&env);
        
        env.storage().persistent().set(&symbol_short!("MAXSESS"), &max_sessions);
        env.storage().persistent().set(&symbol_short!("WINDLED"), &window_ledgers);
        
        emit_rate_limit_updated(&env, max_sessions, window_ledgers, admin);
    }

    pub fn get_rate_limit(env: Env) -> (u32, u32) {
        require_initialized(&env);
        let max_sessions: u32 = env.storage().persistent().get(&symbol_short!("MAXSESS")).unwrap_or(0);
        let window_ledgers: u32 = env.storage().persistent().get(&symbol_short!("WINDLED")).unwrap_or(0);
        (max_sessions, window_ledgers)
    }

    pub fn add_to_whitelist(env: Env, address: Address) {
        require_initialized(&env);
        require_not_paused(&env);
        let admin = require_admin(&env);
        
        env.storage().persistent().set(&whitelist_key(&address), &true);
        emit_whitelist_updated(&env, address, true, admin);
    }

    pub fn remove_from_whitelist(env: Env, address: Address) {
        require_initialized(&env);
        require_not_paused(&env);
        let admin = require_admin(&env);
        
        env.storage().persistent().remove(&whitelist_key(&address));
        emit_whitelist_updated(&env, address, false, admin);
    }

    pub fn is_whitelisted(env: Env, address: Address) -> bool {
        require_initialized(&env);
        env.storage().persistent().get(&whitelist_key(&address)).unwrap_or(false)
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
    // Issue 1 — Milestone-based partial release escrow
    // -----------------------------------------------------------------------

    pub fn lock_funds_with_milestones(
        env: Env,
        session_id: Bytes32,
        seller: Address,
        total_amount: i128,
        milestones: Vec<Milestone>,
    ) {
        require_initialized(&env);
        require_not_paused(&env);
        if total_amount <= 0 {
            panic_with_error!(&env, ContractError::InvalidAmount);
        }
        if get_session(&env, &session_id).is_some() {
            panic_with_error!(&env, ContractError::DuplicateSessionId);
        }
        if milestones.is_empty() {
            panic_with_error!(&env, ContractError::InvalidAmount);
        }
        let mut total_bps: u64 = 0;
        for m in milestones.iter() {
            total_bps += m.percentage_bps as u64;
        }
        if total_bps != 10_000 {
            panic_with_error!(&env, ContractError::MilestoneSumInvalid);
        }
        let buyer = env.invoker();
        buyer.require_auth();
        let session = Session {
            id: session_id.clone(),
            buyer: buyer.clone(),
            seller: seller.clone(),
            amount: total_amount,
            status: SessionStatus::Locked,
            created_at: env.ledger().timestamp(),
            completed_at: None,
            dispute_opened_at: None,
            released_amount: 0,
        };
        save_session(&env, &session_id, &session);
        save_milestones(&env, &session_id, &milestones);
    }

    pub fn release_milestone(env: Env, session_id: Bytes32, milestone_index: u32) {
        require_initialized(&env);
        require_not_paused(&env);
        let mut session = get_session(&env, &session_id)
            .unwrap_or_else(|| panic_with_error!(&env, ContractError::SessionNotFound));
        if session.status == SessionStatus::Disputed {
            panic_with_error!(&env, ContractError::MilestoneLockedByDispute);
        }
        if session.status != SessionStatus::Locked {
            panic_with_error!(&env, ContractError::InvalidStatus);
        }
        let buyer = session.buyer.clone();
        buyer.require_auth();
        let milestones = get_milestones(&env, &session_id)
            .unwrap_or_else(|| panic_with_error!(&env, ContractError::InvalidStatus));
        if milestone_index as usize >= milestones.len() {
            panic_with_error!(&env, ContractError::MilestoneNotFound);
        }
        let mut milestones = milestones;
        let milestone = &mut milestones[milestone_index as usize];
        if milestone.released {
            panic_with_error!(&env, ContractError::MilestoneAlreadyReleased);
        }
        let amount = (session.amount * milestone.percentage_bps as i128) / 10_000;
        milestone.released = true;
        session.released_amount += amount;
        save_session(&env, &session_id, &session);
        save_milestones(&env, &session_id, &milestones);
        emit_milestone_released(&env, session_id, milestone_index, amount);
    }

    // -----------------------------------------------------------------------
    // Issue 2 — Buyer and seller ratings / reputation
    // -----------------------------------------------------------------------

    pub fn rate_counterparty(
        env: Env,
        session_id: Bytes32,
        rating: u8,
        comment: String,
    ) {
        require_initialized(&env);
        require_not_paused(&env);
        if rating < 1 || rating > 5 {
            panic_with_error!(&env, ContractError::InvalidRating);
        }
        let caller = env.invoker();
        caller.require_auth();
        let session = get_session(&env, &session_id)
            .unwrap_or_else(|| panic_with_error!(&env, ContractError::SessionNotFound));
        if session.status != SessionStatus::Approved {
            panic_with_error!(&env, ContractError::SessionNotApproved);
        }
        // Determine who is rating whom
        let (from, to): (Address, Address) = if caller == session.buyer {
            (caller, session.seller)
        } else if caller == session.seller {
            (caller, session.buyer)
        } else {
            panic_with_error!(&env, ContractError::Unauthorized);
        };
        // Check if rating already exists
        if get_rating(&env, &session_id, &from, &to).is_some() {
            panic_with_error!(&env, ContractError::RatingAlreadySubmitted);
        }
        let timestamp = env.ledger().timestamp();
        let rating_entry = Rating {
            from: from.clone(),
            to: to.clone(),
            session_id: session_id.clone(),
            rating,
            comment,
            timestamp,
        };
        save_rating(&env, &session_id, &from, &to, &rating_entry);
        // Update user rating aggregate
        let (current_total, current_count) = get_user_rating_aggregate(&env, &to);
        let new_total = current_total + rating as u64;
        let new_count = current_count + 1;
        set_user_rating_aggregate(&env, &to, new_total, new_count);
        emit_rating_submitted(&env, session_id, from, to, rating);
    }

    pub fn get_user_rating(env: Env, address: Address) -> (u64, u32) {
        require_initialized(&env);
        let (total, count) = get_user_rating_aggregate(&env, &address);
        if count == 0 {
            return (0, 0);
        }
        (total / count as u64, count)
    }

    // -----------------------------------------------------------------------
    // Issue 3 — Smart contract insurance pool
    // -----------------------------------------------------------------------

    pub fn contribute_to_insurance_pool(env: Env, amount: i128) {
        require_initialized(&env);
        require_not_paused(&env);
        if amount <= 0 {
            panic_with_error!(&env, ContractError::InvalidAmount);
        }
        let contributor = env.invoker();
        contributor.require_auth();
        let current_balance: i128 = env
            .storage()
            .persistent()
            .get(&symbol_short!(INSURANCE_POOL_BALANCE))
            .unwrap_or(0);
        env.storage()
            .persistent()
            .set(&symbol_short!(INSURANCE_POOL_BALANCE), &(current_balance + amount));
        emit_insurance_contributed(&env, contributor, amount);
    }

    pub fn file_insurance_claim(
        env: Env,
        session_id: Bytes32,
        claim_amount: i128,
    ) {
        require_initialized(&env);
        require_not_paused(&env);
        if claim_amount <= 0 {
            panic_with_error!(&env, ContractError::InvalidAmount);
        }
        let session = get_session(&env, &session_id)
            .unwrap_or_else(|| panic_with_error!(&env, ContractError::SessionNotFound));
        let claimant = env.invoker();
        if claimant != session.buyer && claimant != session.seller {
            panic_with_error!(&env, ContractError::Unauthorized);
        }
        let pool_balance: i128 = env
            .storage()
            .persistent()
            .get(&symbol_short!(INSURANCE_POOL_BALANCE))
            .unwrap_or(0);
        if pool_balance < claim_amount {
            panic_with_error!(&env, ContractError::InsufficientBalance);
        }
        let claim_id = next_claim_id(&env);
        let claim = InsuranceClaim {
            id: claim_id.clone(),
            session_id: session_id.clone(),
            claimant: claimant.clone(),
            amount: claim_amount,
            status: ClaimStatus::Pending,
            created_at: env.ledger().timestamp(),
        };
        save_insurance_claim(&env, &claim_id, &claim);
        emit_insurance_claim_filed(&env, claim_id, session_id, claimant, claim_amount);
    }

    pub fn resolve_insurance_claim(
        env: Env,
        claim_id: Bytes32,
        approved: bool,
    ) {
        require_initialized(&env);
        require_not_paused(&env);
        let caller = require_admin(&env);
        let mut claim = get_insurance_claim(&env, &claim_id)
            .unwrap_or_else(|| panic_with_error!(&env, ContractError::ClaimNotFound));
        if claim.status != ClaimStatus::Pending {
            panic_with_error!(&env, ContractError::ClaimAlreadyResolved);
        }
        if approved {
            let pool_balance: i128 = env
                .storage()
                .persistent()
                .get(&symbol_short!(INSURANCE_POOL_BALANCE))
                .unwrap_or(0);
            if pool_balance < claim.amount {
                panic_with_error!(&env, ContractError::InsufficientBalance);
            }
            env.storage()
                .persistent()
                .set(&symbol_short!(INSURANCE_POOL_BALANCE), &(pool_balance - claim.amount));
            claim.status = ClaimStatus::Paid;
        } else {
            claim.status = ClaimStatus::Rejected;
        }
        save_insurance_claim(&env, &claim_id, &claim);
        emit_insurance_claim_resolved(&env, claim_id, claim.status, caller);
    }

    pub fn get_insurance_pool_balance(env: Env) -> i128 {
        require_initialized(&env);
        env.storage()
            .persistent()
            .get(&symbol_short!(INSURANCE_POOL_BALANCE))
            .unwrap_or(0)
    }

    pub fn get_insurance_claim(env: Env, claim_id: Bytes32) -> InsuranceClaim {
        require_initialized(&env);
        get_insurance_claim(&env, &claim_id)
            .unwrap_or_else(|| panic_with_error!(&env, ContractError::ClaimNotFound))
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
        client.open_dispute(&sid);
        client.resolve_dispute(&sid, &3000, &3000);
    }

    // Archive tests
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

    // -----------------------------------------------------------------------
    // Issue 1 — Milestone-based partial release escrow tests
    // -----------------------------------------------------------------------

    #[test]
    fn test_milestone_lock_and_release() {
        let env = Env::default();
        env.mock_all_auths();
        let cid = env.register(SkillsyncContract, ());
        let client = SkillsyncContractClient::new(&env, &cid);
        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        let sid = make_session_id(&env, 20);

        client.initialize(&admin, &treasury);

        let milestones = Vec::from_array(&env, [
            Milestone {
                percentage_bps: 3000,
                description: String::from("30% upfront"),
                released: false,
            },
            Milestone {
                percentage_bps: 4000,
                description: String::from("40% on delivery"),
                released: false,
            },
            Milestone {
                percentage_bps: 3000,
                description: String::from("30% on验收"),
                released: false,
            },
        ]);

        client.lock_funds_with_milestones(&sid, &seller, &10000, &milestones);

        let session = client.get_session_data(&sid);
        assert_eq!(session.status, SessionStatus::Locked);
        assert_eq!(session.released_amount, 0);

        // Release first milestone (30% = 3000)
        client.release_milestone(&sid, &0);
        let session = client.get_session_data(&sid);
        assert_eq!(session.released_amount, 3000);

        // Release second milestone (40% = 4000)
        client.release_milestone(&sid, &1);
        let session = client.get_session_data(&sid);
        assert_eq!(session.released_amount, 7000);

        // Release third milestone (30% = 3000)
        client.release_milestone(&sid, &2);
        let session = client.get_session_data(&sid);
        assert_eq!(session.released_amount, 10000);
    }

    #[test]
    #[should_panic]
    fn test_milestone_sum_must_be_10000() {
        let env = Env::default();
        env.mock_all_auths();
        let cid = env.register(SkillsyncContract, ());
        let client = SkillsyncContractClient::new(&env, &cid);
        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        let seller = Address::generate(&env);
        let sid = make_session_id(&env, 21);

        client.initialize(&admin, &treasury);

        let milestones = Vec::from_array(&env, [
            Milestone {
                percentage_bps: 5000,
                description: String::from("50%"),
                released: false,
            },
            Milestone {
                percentage_bps: 4000,
                description: String::from("40%"),
                released: false,
            },
        ]);

        client.lock_funds_with_milestones(&sid, &seller, &10000, &milestones);
    }

    #[test]
    #[should_panic]
    fn test_release_milestone_paused_by_dispute() {
        let env = Env::default();
        env.mock_all_auths();
        let cid = env.register(SkillsyncContract, ());
        let client = SkillsyncContractClient::new(&env, &cid);
        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        let sid = make_session_id(&env, 22);

        client.initialize(&admin, &treasury);

        let milestones = Vec::from_array(&env, [
            Milestone {
                percentage_bps: 5000,
                description: String::from("50%"),
                released: false,
            },
            Milestone {
                percentage_bps: 5000,
                description: String::from("50%"),
                released: false,
            },
        ]);

        client.lock_funds_with_milestones(&sid, &seller, &10000, &milestones);
        client.open_dispute(&sid);
        client.release_milestone(&sid, &0);
    }

    #[test]
    #[should_panic]
    fn test_cannot_release_already_released_milestone() {
        let env = Env::default();
        env.mock_all_auths();
        let cid = env.register(SkillsyncContract, ());
        let client = SkillsyncContractClient::new(&env, &cid);
        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        let sid = make_session_id(&env, 23);

        client.initialize(&admin, &treasury);

        let milestones = Vec::from_array(&env, [
            Milestone {
                percentage_bps: 10000,
                description: String::from("100%"),
                released: false,
            },
        ]);

        client.lock_funds_with_milestones(&sid, &seller, &10000, &milestones);
        client.release_milestone(&sid, &0);
        client.release_milestone(&sid, &0);
    }

    #[test]
    #[should_panic]
    fn test_release_milestone_not_buyer() {
        let env = Env::default();
        env.mock_all_auths();
        let cid = env.register(SkillsyncContract, ());
        let client = SkillsyncContractClient::new(&env, &cid);
        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        let other = Address::generate(&env);
        let sid = make_session_id(&env, 24);

        client.initialize(&admin, &treasury);

        let milestones = Vec::from_array(&env, [
            Milestone {
                percentage_bps: 10000,
                description: String::from("100%"),
                released: false,
            },
        ]);

        client.lock_funds_with_milestones(&sid, &seller, &10000, &milestones);
        // other is not the buyer, should panic
        client.release_milestone(&sid, &0);
    }

    // -----------------------------------------------------------------------
    // Issue 2 — Ratings / reputation tests
    // -----------------------------------------------------------------------

    #[test]
    fn test_rate_counterparty() {
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
        client.create_session(&sid, &buyer, &seller, &1000);
        client.lock_funds(&sid);
        client.complete_session(&sid);
        client.approve_session(&sid);

        // Buyer rates seller
        client.rate_counterparty(&sid, &5, &String::from("Great session!"));

        // Seller rates buyer
        client.rate_counterparty(&sid, &4, &String::from("Good buyer"));

        // Check buyer rating
        let (avg, count) = client.get_user_rating(&buyer);
        assert_eq!(count, 1);
        assert_eq!(avg, 4);

        // Check seller rating
        let (avg, count) = client.get_user_rating(&seller);
        assert_eq!(count, 1);
        assert_eq!(avg, 5);
    }

    #[test]
    #[should_panic]
    fn test_rate_before_approved_panics() {
        let env = Env::default();
        env.mock_all_auths();
        let cid = env.register(SkillsyncContract, ());
        let client = SkillsyncContractClient::new(&env, &cid);
        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        let sid = make_session_id(&env, 31);

        client.initialize(&admin, &treasury);
        client.create_session(&sid, &buyer, &seller, &1000);
        client.lock_funds(&sid);
        client.complete_session(&sid);
        // Not yet approved, should panic
        client.rate_counterparty(&sid, &5, &String::from("Too early"));
    }

    #[test]
    #[should_panic]
    fn test_cannot_rate_twice() {
        let env = Env::default();
        env.mock_all_auths();
        let cid = env.register(SkillsyncContract, ());
        let client = SkillsyncContractClient::new(&env, &cid);
        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        let sid = make_session_id(&env, 32);

        client.initialize(&admin, &treasury);
        client.create_session(&sid, &buyer, &seller, &1000);
        client.lock_funds(&sid);
        client.complete_session(&sid);
        client.approve_session(&sid);

        client.rate_counterparty(&sid, &5, &String::from("First rating"));
        client.rate_counterparty(&sid, &3, &String::from("Second rating"));
    }

    #[test]
    #[should_panic]
    fn test_rating_out_of_range() {
        let env = Env::default();
        env.mock_all_auths();
        let cid = env.register(SkillsyncContract, ());
        let client = SkillsyncContractClient::new(&env, &cid);
        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        let sid = make_session_id(&env, 33);

        client.initialize(&admin, &treasury);
        client.create_session(&sid, &buyer, &seller, &1000);
        client.lock_funds(&sid);
        client.archive_session(&sid);
        client.complete_session(&sid);
        client.approve_session(&sid);

        client.rate_counterparty(&sid, &6, &String::from("Invalid rating"));
    }

    // -----------------------------------------------------------------------
    // Issue 3 — Insurance pool tests
    // -----------------------------------------------------------------------

    #[test]
    fn test_insurance_pool_contribute_and_claim() {
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

        // Contribute to pool
        client.contribute_to_insurance_pool(&5000);
        assert_eq!(client.get_insurance_pool_balance(), 5000);

        // Create and lock a session
        client.create_session(&sid, &buyer, &seller, &10000);
        client.lock_funds(&sid);

        // File a claim
        client.file_insurance_claim(&sid, &3000);

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
        // Resolve claim (approve)
        let claim_id = Bytes32::from_array(&env, &[0u8; 32]);
        client.resolve_insurance_claim(&claim_id, true);

        let claim = client.get_insurance_claim(&claim_id);
        assert_eq!(claim.status, ClaimStatus::Paid);
        assert_eq!(client.get_insurance_pool_balance(), 2000);
    }

    #[test]
    #[should_panic]
    fn test_insurance_claim_without_pool_funds() {
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
        let sid = make_session_id(&env, 41);

        client.initialize(&admin, &treasury);

        // Create and lock a session
        client.create_session(&sid, &buyer, &seller, &10000);
        client.lock_funds(&sid);

        // File a claim without any pool contributions
        client.file_insurance_claim(&sid, &3000);
    }

    #[test]
    #[should_panic]
    fn test_insurance_claim_by_unauthorized() {
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
        let other = Address::generate(&env);
        let sid = make_session_id(&env, 42);

        client.initialize(&admin, &treasury);

        // Create and lock a session
        client.create_session(&sid, &buyer, &seller, &10000);
        client.lock_funds(&sid);

        // Other is not party to the session
        client.file_insurance_claim(&sid, &3000);
    }
}
