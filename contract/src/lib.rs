#![no_std]

extern crate alloc;

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype,
    Address, Bytes32, Env, symbol_short,
};

// ---------------------------------------------------------------------------
// Storage symbols
// ---------------------------------------------------------------------------
const ADMIN: &str = "ADMIN";
const TREASURY: &str = "TREASURY";
const PLATFORM_FEE: &str = "PFEE";
const INITIALIZED: &str = "INIT";
const ARCHIVE_AFTER: &str = "ARCHAFT";

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

    // -- Session validation (300-399) --
    SessionNotFound      = 300,
    SessionAlreadyExists = 301,
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
            panic_with_error!(&env, ContractError::AmountMustBePositive);
        }
        if get_session(&env, &session_id).is_some() {
            panic_with_error!(&env, ContractError::SessionAlreadyExists);
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

    pub fn set_treasury(env: Env, new_treasury: Address) {
        require_initialized(&env);
        require_admin(&env);
        env.storage()
            .persistent()
            .set(&symbol_short!("TRSY"), &new_treasury);
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
    use soroban_sdk::{testutils::Address as _, Env, Bytes32};

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
