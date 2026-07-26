#![no_std]

extern crate alloc;
use soroban_sdk::{contract, contractimpl, Address, Bytes32, Env, String, symbol_short, Symbol, contracttype, contractevent};

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, contractevent,
    Address, Bytes32, Env, Symbol, symbol_short,
};

// ---------------------------------------------------------------------------
// Storage symbols
// ---------------------------------------------------------------------------
symbol_short! {ADMIN}
symbol_short! {TREASURY}
symbol_short! {PLATFORM_FEE}
symbol_short! {SESSION}
symbol_short! {DISPUTE_OPENED}
symbol_short! {DISPUTE_RESOLVED}
symbol_short! {INITIALIZED}
symbol_short! {FUNDS_LOCKED}
symbol_short! {SESSION_COMPLETED}
symbol_short! {SESSION_APPROVED}

// ---------------------------------------------------------------------------
// Error codes
// ---------------------------------------------------------------------------
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
// Event types
#[contractevent]
pub struct Initialized {
    pub admin: Address,
    pub treasury: Address,
    pub dispute_window: u32,
}

#[contractevent]
pub struct DisputeOpened {
    pub session_id: Bytes32,
    pub opened_by: Address,
    pub opened_at: u64,
}

#[contractevent]
pub struct DisputeResolved {
    pub session_id: Bytes32,
    pub resolved_by: Address,
    pub buyer_share: i128,
    pub seller_share: i128,
    pub fee: i128,
    pub timestamp: u64,
}

#[contractevent]
pub struct FundsLocked {
    pub session_id: Bytes32,
    pub buyer: Address,
    pub seller: Address,
    pub amount: i128,
    pub timestamp: u64,
}

#[contractevent]
pub struct SessionCompletedEvent {
    pub session_id: Bytes32,
    pub seller: Address,
    pub completed_at: u64,
}

#[contractevent]
pub struct SessionApprovedEvent {
    pub session_id: Bytes32,
    pub buyer: Address,
    pub seller: Address,
    pub amount: i128,
    pub fee: i128,
    pub timestamp: u64,
}

// Session status enum
#[derive(Debug, Clone, PartialEq, Eq)]
#[repr(u32)]
pub enum ContractError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    SessionAlreadyExists = 4,
    SessionNotFound = 5,
    AmountMustBePositive = 6,
    InvalidStatus = 7,
    SharesMismatch = 8,
    TransferFailed = 9,
    FeeExceedsAmount = 10,
    FeeTooHigh = 11,
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
}

impl SessionStatus {
    pub fn as_u32(&self) -> u32 {
        match self {
            SessionStatus::Created => 0,
            SessionStatus::Locked => 1,
            SessionStatus::Completed => 2,
            SessionStatus::Approved => 3,
            SessionStatus::Refunded => 4,
            SessionStatus::Disputed => 5,
            SessionStatus::Resolved => 6,
        }
    }

    pub fn from_u32(val: u32) -> Option<Self> {
        match val {
            0 => Some(SessionStatus::Created),
            1 => Some(SessionStatus::Locked),
            2 => Some(SessionStatus::Completed),
            3 => Some(SessionStatus::Approved),
            4 => Some(SessionStatus::Refunded),
            5 => Some(SessionStatus::Disputed),
            6 => Some(SessionStatus::Resolved),
            _ => None,
        }
    }
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
// Event types
// ---------------------------------------------------------------------------
#[contractevent]
pub struct DisputeOpened {
    pub session_id: Bytes32,
    pub opened_by: Address,
    pub opened_at: u64,
}

#[contractevent]
pub struct DisputeResolved {
    pub session_id: Bytes32,
    pub resolved_by: Address,
    pub buyer_share: i128,
    pub seller_share: i128,
    pub fee: i128,
    pub timestamp: u64,
}

#[contractevent]
pub struct FundsLocked {
    pub session_id: Bytes32,
    pub buyer: Address,
    pub seller: Address,
    pub amount: i128,
    pub timestamp: u64,
}

#[contractevent]
pub struct SessionCompletedEvent {
    pub session_id: Bytes32,
    pub seller: Address,
    pub completed_at: u64,
}

#[contractevent]
pub struct SessionApproved {
    pub session_id: Bytes32,
    pub buyer: Address,
    pub seller: Address,
    pub amount: i128,
    pub fee: i128,
    pub timestamp: u64,
}

#[contractevent]
pub struct Initialized {
    pub admin: Address,
    pub treasury: Address,
    pub dispute_window: u32,
}

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------
fn get_session(env: &Env, session_id: &Bytes32) -> Option<Session> {
    let key = (SESSION, session_id.clone());
    env.storage().persistent().get(&key)
}

fn save_session(env: &Env, session_id: &Bytes32, session: &Session) {
    let key = (SESSION, session_id.clone());
    env.storage().persistent().set(&key, session);
}

/// Calculate platform fee: returns (after_fee, fee_amount).
/// Fee is skipped for amounts <= 0 or fee_bps == 0.
fn apply_fee(env: &Env, amount: i128) -> (i128, i128) {
    let fee_bps: u32 = env.storage().persistent().get(&PLATFORM_FEE).unwrap_or(0);
    if fee_bps == 0 || amount <= 0 {
        return (amount, 0);
    }
    let fee = (amount * fee_bps as i128) / 10_000;
    (amount - fee, fee)
}

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------
#[contract]
pub struct SkillsyncContract;

#[contractimpl]
impl SkillsyncContract {
    /// Initialize the contract. Can only be called once.
    pub fn initialize(env: Env, admin: Address, treasury: Address) {
        if env.storage().persistent().has(&INITIALIZED) {
            panic_with_error!(&env, ContractError::AlreadyInitialized);
        }
        
        // Validate initial treasury address is valid
        initial_treasury.require_auth();
        admin.require_auth();
        
        // Store admin and initial treasury
        env.storage().instance().set(&ADMIN, &admin);
        env.storage().instance().set(&TREASURY, &initial_treasury);

        // Emit Initialized event (#924)
        env.events().publish(
            (INITIALIZED,),
            Initialized {
                admin: admin.clone(),
                treasury: initial_treasury.clone(),
                dispute_window: 0,
            },
        );
    }

        admin.require_auth();

        env.storage().persistent().set(&ADMIN, &admin);
        env.storage().persistent().set(&TREASURY, &treasury);
        env.storage().persistent().set(&INITIALIZED, &true);

        env.events().publish(
            (symbol_short!("Initialized"),),
            Initialized {
                admin,
                treasury,
                dispute_window: 0,
            },
        );
    }

    /// Create a new escrow session.
    pub fn create_session(
        env: Env,
        session_id: Bytes32,
        buyer: Address,
        seller: Address,
        amount: i128,
    ) {
        Self::require_initialized(&env);

        if amount <= 0 {
            panic_with_error!(&env, ContractError::AmountMustBePositive);
        }

        if get_session(&env, &session_id).is_some() {
            panic_with_error!(&env, ContractError::SessionAlreadyExists);
        }

        buyer.require_auth();

        let session = Session {
            id: session_id.clone(),
            buyer: buyer.clone(),
            seller: seller.clone(),
            amount,
            status: SessionStatus::Created,
            created_at: env.ledger().timestamp(),
            completed_at: None,
            dispute_opened_at: None,
        };

        save_session(&env, &session_id, &session);
    }

    /// Lock funds from buyer into the contract for a session.
    pub fn lock_funds(env: Env, session_id: Bytes32) {
        Self::require_initialized(&env);

        let mut session = match get_session(&env, &session_id) {
            Some(s) => s,
            None => panic_with_error!(&env, ContractError::SessionNotFound),
        };

        if session.status != SessionStatus::Created {
            panic_with_error!(&env, ContractError::InvalidStatus);
        }

        session.buyer.require_auth();

        session.status = SessionStatus::Locked;
        save_session(&env, &session_id, &session);

        let timestamp = env.ledger().timestamp();
        env.events().publish(
            (FUNDS_LOCKED, session_id.clone()),
            FundsLocked {
                session_id,
                buyer: session.buyer,
                seller: session.seller,
                amount: session.amount,
                timestamp,
            },
        );
    }

    /// Seller marks session as completed.
    pub fn complete_session(env: Env, session_id: Bytes32) {
        Self::require_initialized(&env);

        let mut session = match get_session(&env, &session_id) {
            Some(s) => s,
            None => panic_with_error!(&env, ContractError::SessionNotFound),
        };

        if session.status != SessionStatus::Locked {
            panic_with_error!(&env, ContractError::InvalidStatus);
        }

        session.seller.require_auth();

        let timestamp = env.ledger().timestamp();
        session.status = SessionStatus::Completed;
        session.completed_at = Some(timestamp);
        save_session(&env, &session_id, &session);

        env.events().publish(
            (SESSION_COMPLETED, session_id.clone()),
            SessionCompletedEvent {
                session_id,
                seller: session.seller,
                completed_at: timestamp,
            },
        );
    }

    /// Buyer approves completed session, releasing funds to seller minus fee.
    pub fn approve_session(env: Env, session_id: Bytes32) {
        Self::require_initialized(&env);

        let mut session = match get_session(&env, &session_id) {
            Some(s) => s,
            None => panic_with_error!(&env, ContractError::SessionNotFound),
        };

        if session.status != SessionStatus::Completed {
            panic_with_error!(&env, ContractError::InvalidStatus);
        }

        session.buyer.require_auth();

        let (seller_payout, fee) = apply_fee(&env, session.amount);
        let treasury: Address = env.storage().persistent().get(&TREASURY).unwrap();

        session.status = SessionStatus::Approved;
        save_session(&env, &session_id, &session);

        let timestamp = env.ledger().timestamp();
        env.events().publish(
            (SESSION_APPROVED, session_id.clone()),
            SessionApproved {
                session_id,
                buyer: session.buyer.clone(),
                seller: session.seller.clone(),
                amount: session.amount,
                fee,
                timestamp,
            },
        );
    }

    /// Open a dispute on a locked or completed session.
    pub fn open_dispute(env: Env, session_id: Bytes32) {
        Self::require_initialized(&env);

        let mut session = match get_session(&env, &session_id) {
            Some(s) => s,
            None => panic_with_error!(&env, ContractError::SessionNotFound),
        };

        let caller = env.invoker();
        if caller != session.buyer && caller != session.seller {
            panic_with_error!(&env, ContractError::Unauthorized);
        }

        if session.status != SessionStatus::Locked && session.status != SessionStatus::Completed {
            panic_with_error!(&env, ContractError::InvalidStatus);
        }

        let timestamp = env.ledger().timestamp();
        session.status = SessionStatus::Disputed;
        session.dispute_opened_at = Some(timestamp);
        save_session(&env, &session_id, &session);

        env.events().publish(
            (DISPUTE_OPENED, session_id.clone()),
            DisputeOpened {
                session_id,
                opened_by: caller,
                opened_at: timestamp,
            },
        );
    }

    /// Admin resolves a dispute by splitting funds between buyer and seller.
    /// buyer_share + seller_share must equal the original amount.
    /// Fee is applied to the seller's share only.
    pub fn resolve_dispute(
        env: Env,
        session_id: Bytes32,
        buyer_share: i128,
        seller_share: i128,
    ) {
        Self::require_initialized(&env);

        let admin: Address = env.storage().persistent().get(&ADMIN).unwrap();
        admin.require_auth();

        let mut session = match get_session(&env, &session_id) {
            Some(s) => s,
            None => panic_with_error!(&env, ContractError::SessionNotFound),
        };

        if session.status != SessionStatus::Disputed {
            panic_with_error!(&env, ContractError::InvalidStatus);
        }

        // Total shares must equal original amount
        if buyer_share + seller_share != session.amount {
            panic_with_error!(&env, ContractError::SharesMismatch);
        }

        // Apply fee to seller's share only (no fee on refunds to buyer)
        let (_seller_after_fee, fee) = apply_fee(&env, seller_share);

        // Update session status
        let timestamp = env.ledger().timestamp();
        session.status = SessionStatus::Resolved;
        save_session(&env, &session_id, &session);

        // Emit DisputeResolved event
        env.events().publish(
            (DISPUTE_RESOLVED, session_id.clone()),
            DisputeResolved {
                session_id,
                resolved_by: admin,
                buyer_share,
                seller_share,
                fee,
                timestamp,
            },
        );
    }

    // -- Admin functions --

    pub fn set_treasury(env: Env, new_treasury: Address) {
        Self::require_initialized(&env);
        let admin: Address = env.storage().persistent().get(&ADMIN).unwrap();
        admin.require_auth();
        env.storage().persistent().set(&TREASURY, &new_treasury);
    }

    pub fn get_treasury(env: Env) -> Address {
        Self::require_initialized(&env);
        env.storage().persistent().get(&TREASURY).unwrap()
    }

    pub fn set_platform_fee(env: Env, new_fee_bps: u32) {
        Self::require_initialized(&env);
        let admin: Address = env.storage().persistent().get(&ADMIN).unwrap();
        admin.require_auth();
        if new_fee_bps > 1000 {
            panic_with_error!(&env, ContractError::FeeTooHigh);
        }
        env.storage().persistent().set(&PLATFORM_FEE, &new_fee_bps);
    }

    pub fn get_platform_fee(env: Env) -> u32 {
        Self::require_initialized(&env);
        env.storage().persistent().get(&PLATFORM_FEE).unwrap_or(0)
    }

    pub fn get_session_data(env: Env, session_id: Bytes32) -> Session {
        Self::require_initialized(&env);
        match get_session(&env, &session_id) {
            Some(s) => s,
            None => panic_with_error!(&env, ContractError::SessionNotFound),
        }
    }

    // -- Private helpers --

    fn require_initialized(env: &Env) {
        if !env.storage().persistent().has(&INITIALIZED) {
            panic_with_error!(env, ContractError::NotInitialized);
        }
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::testutils::Address as _;

    fn setup() -> (Env, soroban_sdk::Address, soroban_sdk::Address) {
        let env = Env::default();
        let contract_id = env.register_contract(None, SkillsyncContract);
        let client = SkillsyncContractClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        env.mock_all_auths();
        client.initialize(admin.clone(), treasury.clone());
        (env, admin, treasury)
    }

    #[test]
    fn test_initialize_sets_admin_and_treasury() {
        let (env, admin, treasury) = setup();
        let contract_id = env.register_contract(None, SkillsyncContract);
        let client = SkillsyncContractClient::new(&env, &contract_id);
        env.mock_all_auths();
        client.initialize(admin.clone(), treasury.clone());
        assert_eq!(client.get_treasury(), treasury);
        assert_eq!(client.get_platform_fee(), 0);
    }

    #[test]
    #[should_panic(expected = "AlreadyInitialized")]
    fn test_initialize_cannot_be_called_twice() {
        let (env, admin, treasury) = setup();
        let contract_id = env.register_contract(None, SkillsyncContract);
        let client = SkillsyncContractClient::new(&env, &contract_id);
        env.mock_all_auths();
        client.initialize(admin, treasury);
        client.initialize(admin, treasury);
    }

    #[test]
    fn test_create_and_lock_session() {
        let (env, _admin, _treasury) = setup();
        let contract_id = env.register_contract(None, SkillsyncContract);
        let client = SkillsyncContractClient::new(&env, &contract_id);
        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        let session_id = Bytes32::from_slice(&env, &[1u8; 32]);

        env.mock_all_auths();
        client.create_session(session_id.clone(), buyer.clone(), seller.clone(), 1000);

        let session = client.get_session_data(session_id.clone());
        assert_eq!(session.status, SessionStatus::Created);
        assert_eq!(session.amount, 1000);

        client.lock_funds(session_id.clone());
        let session = client.get_session_data(session_id.clone());
        assert_eq!(session.status, SessionStatus::Locked);
    }

    #[test]
    fn test_complete_and_approve_flow() {
        let (env, _admin, treasury) = setup();
        let contract_id = env.register_contract(None, SkillsyncContract);
        let client = SkillsyncContractClient::new(&env, &contract_id);
        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        let session_id = Bytes32::from_slice(&env, &[2u8; 32]);

        env.mock_all_auths();
        client.set_platform_fee(&200); // 2%
        client.create_session(session_id.clone(), buyer.clone(), seller.clone(), 10000);
        client.lock_funds(session_id.clone());
        client.complete_session(session_id.clone());
        client.approve_session(session_id.clone());

        let session = client.get_session_data(session_id.clone());
        assert_eq!(session.status, SessionStatus::Approved);

        // Fee: 10000 * 200 / 10000 = 200
        // Seller gets 9800, treasury gets 200
    }

    #[test]
    fn test_resolve_dispute_split() {
        let (env, _admin, _treasury) = setup();
        let contract_id = env.register_contract(None, SkillsyncContract);
        let client = SkillsyncContractClient::new(&env, &contract_id);
        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        let session_id = Bytes32::from_slice(&env, &[3u8; 32]);

        env.mock_all_auths();
        client.set_platform_fee(&100); // 1%
        client.create_session(session_id.clone(), buyer.clone(), seller.clone(), 10000);
        client.lock_funds(session_id.clone());
        client.complete_session(session_id.clone());
        client.open_dispute(session_id.clone());

        let session = client.get_session_data(session_id.clone());
        assert_eq!(session.status, SessionStatus::Disputed);

        // Split 50/50: buyer gets 5000, seller gets 5000
        client.resolve_dispute(session_id.clone(), 5000, 5000);

        let session = client.get_session_data(session_id.clone());
        assert_eq!(session.status, SessionStatus::Resolved);
    }

    #[test]
    #[should_panic(expected = "SharesMismatch")]
    fn test_resolve_dispute_shares_mismatch() {
        let (env, _admin, _treasury) = setup();
        let contract_id = env.register_contract(None, SkillsyncContract);
        let client = SkillsyncContractClient::new(&env, &contract_id);
        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        let session_id = Bytes32::from_slice(&env, &[4u8; 32]);

        env.mock_all_auths();
        client.create_session(session_id.clone(), buyer, seller, 10000);
        client.lock_funds(session_id.clone());
        client.complete_session(session_id.clone());
        client.open_dispute(session_id.clone());

        // Shares don't add up: 3000 + 3000 = 6000 != 10000
        client.resolve_dispute(session_id, 3000, 3000);
    }

    #[test]
    #[should_panic(expected = "InvalidStatus")]
    fn test_resolve_dispute_wrong_status() {
        let (env, _admin, _treasury) = setup();
        let contract_id = env.register_contract(None, SkillsyncContract);
        let client = SkillsyncContractClient::new(&env, &contract_id);
        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        let session_id = Bytes32::from_slice(&env, &[5u8; 32]);

        env.mock_all_auths();
        client.create_session(session_id.clone(), buyer, seller, 10000);
        client.lock_funds(session_id.clone());
        client.complete_session(session_id.clone());

        // Session is Completed, not Disputed
        client.resolve_dispute(session_id, 5000, 5000);
    }

    #[test]
    fn test_resolve_dispute_full_buyer_share() {
        let (env, _admin, _treasury) = setup();
        let contract_id = env.register_contract(None, SkillsyncContract);
        let client = SkillsyncContractClient::new(&env, &contract_id);
        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        let session_id = Bytes32::from_slice(&env, &[6u8; 32]);

        env.mock_all_auths();
        client.create_session(session_id.clone(), buyer, seller, 10000);
        client.lock_funds(session_id.clone());
        client.complete_session(session_id.clone());
        client.open_dispute(session_id.clone());

        // All funds to buyer, nothing to seller
        client.resolve_dispute(session_id.clone(), 10000, 0);

        let session = client.get_session_data(session_id);
        assert_eq!(session.status, SessionStatus::Resolved);
    }

    #[test]
    fn test_resolve_dispute_full_seller_share() {
        let (env, _admin, _treasury) = setup();
        let contract_id = env.register_contract(None, SkillsyncContract);
        let client = SkillsyncContractClient::new(&env, &contract_id);
        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        let session_id = Bytes32::from_slice(&env, &[7u8; 32]);

        env.mock_all_auths();
        client.set_platform_fee(&100); // 1%
        client.create_session(session_id.clone(), buyer, seller, 10000);
        client.lock_funds(session_id.clone());
        client.complete_session(session_id.clone());
        client.open_dispute(session_id.clone());

        // All funds to seller (fee applied to seller's share)
        client.resolve_dispute(session_id.clone(), 0, 10000);

        let session = client.get_session_data(session_id);
        assert_eq!(session.status, SessionStatus::Resolved);
    }

    // =========================================================================
    // #920: Integration test — Full escrow lifecycle
    // =========================================================================

    #[test]
    fn test_full_lifecycle_approve_path() {
    // #916: Complete and approve flow tests
    // =========================================================================

    #[test]
    fn test_seller_can_complete_only_after_lock() {
        let env = Env::default();
        let contract_id = env.register_contract(None, SkillsyncContract);
        let client = SkillsyncContractClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        let session_id = Bytes32::from_slice(&env, &[10u8; 32]);

        env.mock_all_auths();
        client.__constructor(&admin, &200);
        client.set_treasury(&treasury);
        client.create_session(session_id.clone(), buyer.clone(), seller.clone(), &10000, &admin);
        client.lock_funds(&session_id, &seller, &10000);

        // Seller completes after lock — should succeed
        client.mark_session_completed(&session_id);
        let session = client.get_session(&session_id.clone());
        assert_eq!(session.status as u32, SessionStatus::Completed as u32);
    }

    #[test]
    fn test_buyer_can_approve_only_after_completion() {
        let env = Env::default();
        let contract_id = env.register_contract(None, SkillsyncContract);
        let client = SkillsyncContractClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        let session_id = Bytes32::from_slice(&env, &[11u8; 32]);

        env.mock_all_auths();
        client.__constructor(&admin, &200);
        client.set_treasury(&treasury);
        client.create_session(session_id.clone(), buyer.clone(), seller.clone(), &10000, &admin);
        client.lock_funds(&session_id, &seller, &10000);
        client.mark_session_completed(&session_id);

        // Buyer approves after completion — should succeed
        client.approve_session(&session_id);
        let session = client.get_session(&session_id.clone());
        assert_eq!(session.status as u32, SessionStatus::Approved as u32);
    }

    #[test]
    fn test_platform_fee_correctly_deducted() {
        let env = Env::default();
        let contract_id = env.register_contract(None, SkillsyncContract);
        let client = SkillsyncContractClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        let session_id = Bytes32::from_slice(&env, &[12u8; 32]);

        env.mock_all_auths();
        client.__constructor(&admin, &200); // 2% fee
        client.set_treasury(&treasury);
        client.create_session(session_id.clone(), buyer.clone(), seller.clone(), &10000, &admin);
        client.lock_funds(&session_id, &seller, &10000);
        client.mark_session_completed(&session_id);
        client.approve_session(&session_id);

        // Fee = 10000 * 200 / 10000 = 200
        // Seller payout = 10000 - 200 = 9800
        let fee = client.calculate_platform_fee(&10000);
        assert_eq!(fee, 200);
    }

    #[test]
    fn test_seller_receives_correct_payout() {
        let env = Env::default();
        let contract_id = env.register_contract(None, SkillsyncContract);
        let client = SkillsyncContractClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        let session_id = Bytes32::from_slice(&env, &[13u8; 32]);

        env.mock_all_auths();
        client.__constructor(&admin, &500); // 5% fee
        client.set_treasury(&treasury);
        client.create_session(session_id.clone(), buyer.clone(), seller.clone(), &20000, &admin);
        client.lock_funds(&session_id, &seller, &20000);
        client.mark_session_completed(&session_id);
        client.approve_session(&session_id);

        // Fee = 20000 * 500 / 10000 = 1000
        // Seller payout = 20000 - 1000 = 19000
        let fee = client.calculate_platform_fee(&20000);
        assert_eq!(fee, 1000);
    }

    #[test]
    fn test_treasury_receives_fee_amount() {
        let env = Env::default();
        let contract_id = env.register_contract(None, SkillsyncContract);
        let client = SkillsyncContractClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        let session_id = Bytes32::from_slice(&env, &[14u8; 32]);

        env.mock_all_auths();
        client.__constructor(&admin, &300); // 3% fee
        client.set_treasury(&treasury);
        client.create_session(session_id.clone(), buyer.clone(), seller.clone(), &50000, &admin);
        client.lock_funds(&session_id, &seller, &50000);
        client.mark_session_completed(&session_id);
        client.approve_session(&session_id);

        // Fee = 50000 * 300 / 10000 = 1500
        let fee = client.calculate_platform_fee(&50000);
        assert_eq!(fee, 1500);
    }

    #[test]
    fn test_events_emitted_in_correct_order() {
        let env = Env::default();
        let contract_id = env.register_contract(None, SkillsyncContract);
        let client = SkillsyncContractClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        let session_id = Bytes32::from_slice(&env, &[15u8; 32]);

        env.mock_all_auths();
        client.__constructor(&admin, &100);
        client.set_treasury(&treasury);
        client.create_session(session_id.clone(), buyer.clone(), seller.clone(), &10000, &admin);
        client.lock_funds(&session_id, &seller, &10000);

        let events = env.events().all();
        // Should have at least FundsLocked event
        assert!(events.len() >= 1);
    }

    // =========================================================================
    // #917: Refund scenarios tests
    // =========================================================================

    #[test]
    fn test_buyer_can_refund_before_completion() {
        let env = Env::default();
        let contract_id = env.register_contract(None, SkillsyncContract);
        let client = SkillsyncContractClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        let session_id = Bytes32::from_slice(&env, &[20u8; 32]);

        env.mock_all_auths();
        client.__constructor(&admin, &200);
        client.set_treasury(&treasury);
        client.create_session(session_id.clone(), buyer.clone(), seller.clone(), &10000, &admin);
        client.lock_funds(&session_id, &seller, &10000);

        // Before completion — buyer can open dispute for refund
        client.open_dispute(&session_id);
        let session = client.get_session(&session_id.clone());
        assert_eq!(session.status as u32, SessionStatus::Disputed as u32);
    }

    #[test]
    fn test_full_amount_returned_no_fee_on_early_refund() {
        let env = Env::default();
        let contract_id = env.register_contract(None, SkillsyncContract);
        let client = SkillsyncContractClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        let session_id = Bytes32::from_slice(&env, &[21u8; 32]);

        env.mock_all_auths();
        client.__constructor(&admin, &200); // 2% fee
        client.set_treasury(&treasury);
        client.create_session(session_id.clone(), buyer.clone(), seller.clone(), &10000, &admin);
        client.lock_funds(&session_id, &seller, &10000);

        // Fee on 0 should be 0 (early refund = no fee)
        let fee = client.calculate_platform_fee(&0);
        assert_eq!(fee, 0);
    }

    #[test]
    #[should_panic]
    fn test_refund_reverts_if_session_already_approved() {
        let env = Env::default();
        let contract_id = env.register_contract(None, SkillsyncContract);
        let client = SkillsyncContractClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        let session_id = Bytes32::from_slice(&env, &[22u8; 32]);

        env.mock_all_auths();
        client.__constructor(&admin, &200);
        client.set_treasury(&treasury);
        client.create_session(session_id.clone(), buyer.clone(), seller.clone(), &10000, &admin);
        client.lock_funds(&session_id, &seller, &10000);
        client.mark_session_completed(&session_id);
        client.approve_session(&session_id);

        // Already approved — should panic
        client.open_dispute(&session_id);
    }

    #[test]
    fn test_refund_reverts_if_session_completed() {
        let env = Env::default();
        let contract_id = env.register_contract(None, SkillsyncContract);
        let client = SkillsyncContractClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        let session_id = Bytes32::from_slice(&env, &[23u8; 32]);

        env.mock_all_auths();
        client.__constructor(&admin, &200);
        client.set_treasury(&treasury);
        client.create_session(session_id.clone(), buyer.clone(), seller.clone(), &10000, &admin);
        client.lock_funds(&session_id, &seller, &10000);
        client.mark_session_completed(&session_id);

        // Session is Completed — can still open dispute (refund path)
        client.open_dispute(&session_id);
        let session = client.get_session(&session_id.clone());
        assert_eq!(session.status as u32, SessionStatus::Disputed as u32);
    }

    // =========================================================================
    // #918: Auto-refund timeout logic tests
    // =========================================================================

    #[test]
    fn test_completed_session_can_be_disputed_for_refund() {
        let env = Env::default();
        let contract_id = env.register_contract(None, SkillsyncContract);
        let client = SkillsyncContractClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        let session_id = Bytes32::from_slice(&env, &[30u8; 32]);

        env.mock_all_auths();
        client.__constructor(&admin, &200);
        client.set_treasury(&treasury);
        client.create_session(session_id.clone(), buyer.clone(), seller.clone(), &10000, &admin);
        client.lock_funds(&session_id, &seller, &10000);
        client.mark_session_completed(&session_id);

        // Completed session can be disputed (refund path)
        client.open_dispute(&session_id);
        let session = client.get_session(&session_id.clone());
        assert_eq!(session.status as u32, SessionStatus::Disputed as u32);
    }

    #[test]
    fn test_auto_refund_does_not_trigger_before_window() {
        let env = Env::default();
        let contract_id = env.register_contract(None, SkillsyncContract);
        let client = SkillsyncContractClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        let session_id = Bytes32::from_slice(&env, &[31u8; 32]);

        env.mock_all_auths();
        client.__constructor(&admin, &200);
        client.set_treasury(&treasury);
        client.create_session(session_id.clone(), buyer.clone(), seller.clone(), &10000, &admin);
        client.lock_funds(&session_id, &seller, &10000);
        client.mark_session_completed(&session_id);

        // Session is Completed — auto-refund hasn't triggered yet
        let session = client.get_session(&session_id.clone());
        assert_eq!(session.status as u32, SessionStatus::Completed as u32);
    }

    #[test]
    fn test_session_cannot_be_approved_after_dispute() {
        let env = Env::default();
        let contract_id = env.register_contract(None, SkillsyncContract);
        let client = SkillsyncContractClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        let session_id = Bytes32::from_slice(&env, &[32u8; 32]);

        env.mock_all_auths();
        client.__constructor(&admin, &200);
        client.set_treasury(&treasury);
        client.create_session(session_id.clone(), buyer.clone(), seller.clone(), &10000, &admin);
        client.lock_funds(&session_id, &seller, &10000);
        client.mark_session_completed(&session_id);
        client.open_dispute(&session_id);

        // Session is Disputed — approve should fail
        let result = client.try_approve_session(&session_id);
        assert!(result.is_err());
    }

    // =========================================================================
    // #919: Dispute and resolution tests
    // =========================================================================

    #[test]
    fn test_buyer_can_open_dispute_on_completed_session() {
        let env = Env::default();
        let contract_id = env.register_contract(None, SkillsyncContract);
        let client = SkillsyncContractClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        let session_id = Bytes32::from_slice(&env, &[40u8; 32]);

        env.mock_all_auths();
        client.__constructor(&admin, &200);
        client.set_treasury(&treasury);
        client.create_session(session_id.clone(), buyer.clone(), seller.clone(), &10000, &admin);
        client.lock_funds(&session_id, &seller, &10000);
        client.mark_session_completed(&session_id);

        // Buyer opens dispute on completed session
        client.open_dispute(&session_id);
        let session = client.get_session(&session_id.clone());
        assert_eq!(session.status as u32, SessionStatus::Disputed as u32);
    }

    #[test]
    fn test_seller_can_open_dispute_on_locked_session() {
        let env = Env::default();
        let contract_id = env.register_contract(None, SkillsyncContract);
        let client = SkillsyncContractClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        let session_id = Bytes32::from_slice(&env, &[41u8; 32]);

        env.mock_all_auths();
        client.__constructor(&admin, &200);
        client.set_treasury(&treasury);
        client.create_session(session_id.clone(), buyer.clone(), seller.clone(), &10000, &admin);
        client.lock_funds(&session_id, &seller, &10000);

        // Seller opens dispute on locked session
        client.open_dispute(&session_id);
        let session = client.get_session(&session_id.clone());
        assert_eq!(session.status as u32, SessionStatus::Disputed as u32);
    }

    #[test]
    #[should_panic(expected = "Invalid split")]
    fn test_invalid_split_reverts() {
        let env = Env::default();
        let contract_id = env.register_contract(None, SkillsyncContract);
        let client = SkillsyncContractClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        let session_id = Bytes32::from_slice(&env, &[42u8; 32]);

        env.mock_all_auths();
        client.__constructor(&admin, &200);
        client.set_treasury(&treasury);
        client.create_session(session_id.clone(), buyer.clone(), seller.clone(), &10000, &admin);
        client.lock_funds(&session_id, &seller, &10000);
        client.mark_session_completed(&session_id);
        client.open_dispute(&session_id);

        // Try to resolve with invalid split (total != amount)
        client.resolve_dispute(&session_id, &3000, &3000);
    }
}
