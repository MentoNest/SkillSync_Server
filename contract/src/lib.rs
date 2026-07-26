#![no_std]

use soroban_sdk::{contract, contractimpl, Address, Bytes32, Env, String, symbol_short, Symbol, contracttype, contractevent};

// Storage symbols
symbol_short! {TREASURY_UPDATED}
symbol_short! {ADMIN}
symbol_short! {TREASURY}
symbol_short! {DISPUTE_OPENED}
symbol_short! {DISPUTE_RESOLVED}
symbol_short! {INITIALIZED}
symbol_short! {FUNDS_LOCKED}
symbol_short! {SESSION_COMPLETED}
symbol_short! {SESSION_APPROVED}

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
pub enum SessionStatus {
    Created = 0,
    InProgress = 1,
    Completed = 2,
    Locked = 3,
use soroban_sdk::{contract, contractimpl, contracttype, Env, Address, Symbol, Bytes32, token::TokenClient};

// Storage keys
const PLATFORM_FEE_KEY: &str = "platform_fee";
const ADMIN_KEY: &str = "admin";
const TREASURY_KEY: &str = "treasury";
const SESSION_PREFIX: &str = "session_";

// Session status enum
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum SessionStatus {
    Created,
    Completed,
    Approved,
}

// Session structure
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Session {
    pub id: Bytes32,
    pub buyer: Address,
    pub seller: Address,
    pub amount: u64,
    pub status: SessionStatus,
    pub token_address: Address, // The token used for this escrow
}

// Event to emit when platform fee is updated
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PlatformFeeUpdated {
    pub old_fee_bps: u32,
    pub new_fee_bps: u32,
    pub updated_by: Address,
}

// Event to emit when session is approved
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SessionApproved {
    pub session_id: Bytes32,
    pub buyer: Address,
    pub seller: Address,
    pub total_amount: u64,
    pub platform_fee: u64,
    pub seller_payout: u64,
use soroban_sdk::{contract, contractimpl, Address, Bytes32, Env, panic_with_error, symbol_short, log};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u32)]
pub enum SessionStatus {
    Locked = 0,
    Completed = 1,
    Approved = 2,
    Refunded = 3,
    Disputed = 4,
    Resolved = 5,
}

// Session struct that stores all session data
#[derive(Debug, Clone)]
pub struct Session {
    pub id: Bytes32,
    pub buyer: Address,
    pub seller: Address,
    pub status: SessionStatus,
    pub dispute_opened_at: Option<u64>,
    // Add other session fields as needed
#[derive(Debug, Clone)]
pub struct Session {
    pub buyer: Address,
    pub seller: Address,
    pub amount: i128,
    pub status: SessionStatus,
    pub created_at: u64,
    pub completed_at: Option<u64>,
    pub dispute_resolved_at: Option<u64>,
}

/// Helper to get a session from storage by its ID
pub fn get_session(env: &Env, session_id: &Bytes32) -> Option<Session> {
    let session_key = (symbol_short!("session"), session_id);
    env.storage().persistent().get(&session_key)
}

/// Helper to save a session to storage
pub fn save_session(env: &Env, session_id: &Bytes32, session: &Session) {
    let session_key = (symbol_short!("session"), session_id);
    env.storage().persistent().set(&session_key, session);
}

#[contract]
pub struct SkillsyncContract;

#[contractevent]
pub struct TreasuryUpdated {
    pub old_treasury: Address,
    pub new_treasury: Address,
}

#[contractevent]
pub struct DisputeOpened {
    pub session_id: Bytes32,
    pub reason: String,
    pub opened_by: Address,
    pub opened_at: u64,
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum ContractError {
    SessionAlreadyExists = 1,
    AmountMustBePositive = 2,
    TransferFailed = 3,
}

#[contractimpl]
impl SkillsyncContract {
    pub fn initialize(env: Env, admin: Address, initial_treasury: Address) {
        // Ensure the contract isn't already initialized
        if env.storage().instance().has::<&Symbol, Address>(&ADMIN) {
            panic!("Contract is already initialized");
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

    pub fn set_treasury(env: Env, new_treasury: Address) {
        // Only admin can update treasury
        let admin: Address = env.storage().instance().get(&ADMIN).expect("Contract not initialized");
        admin.require_auth();
        
        // Validate new treasury address is valid
        new_treasury.require_auth();
        
        // Get old treasury for event
        let old_treasury: Address = env.storage().instance().get(&TREASURY).expect("Treasury not initialized");
        
        // Update treasury
        env.storage().instance().set(&TREASURY, &new_treasury);
        
        // Emit TreasuryUpdated event
        env.events().publish((TREASURY_UPDATED,), TreasuryUpdated {
            old_treasury,
            new_treasury
        });
    }

    pub fn get_treasury(env: Env) -> Address {
        env.storage().instance().get(&TREASURY).expect("Treasury not initialized")
    }

    pub fn open_dispute(env: Env, session_id: Bytes32, reason: String) {
        // Get the caller (must be buyer or seller)
        let caller = env.invoker();
        
        // Retrieve the session from storage
        let mut session: Session = env.storage().persistent()
            .get(&session_id)
            .expect("Session does not exist");
        
        // Verify caller is either buyer or seller of the session
        if !caller.eq(&session.buyer) && !caller.eq(&session.seller) {
            panic!("Only buyer or seller can open a dispute");
        }
        
        // Verify session is in Completed or Locked status
        if session.status != SessionStatus::Completed && session.status != SessionStatus::Locked {
            panic!("Dispute can only be opened on Completed or Locked sessions");
        }
        
        // Update session status to Disputed
        session.status = SessionStatus::Disputed;
        
        // Store the current timestamp when dispute was opened
        let opened_at = env.ledger().timestamp();
        session.dispute_opened_at = Some(opened_at);
        
        // Save the updated session back to storage
        env.storage().persistent().set(&session_id, &session);
        
        // Emit DisputeOpened event with reason
        env.events().publish(
            (DISPUTE_OPENED,), 
            DisputeOpened {
                session_id,
                reason,
                opened_by: caller,
                opened_at
            }
        );
    }

    // Admin-only function to resolve disputes
    pub fn resolve_dispute(env: Env, session_id: Bytes32, resolution: String) {
        // Only admin can resolve disputes
        let admin: Address = env.storage().instance().get(&ADMIN).expect("Contract not initialized");
        admin.require_auth();
        
        // Retrieve the session
        let mut session: Session = env.storage().persistent()
            .get(&session_id)
            .expect("Session does not exist");
        
        // Verify session is in Disputed status
        if session.status != SessionStatus::Disputed {
            panic!("Only disputed sessions can be resolved");
        }
        
        // Update status to Resolved
        session.status = SessionStatus::Resolved;
        
        // Save the updated session
        env.storage().persistent().set(&session_id, &session);
        
        // Could emit a DisputeResolved event here if needed
    }

    // Helper function to create a session (for testing purposes - would normally be part of your session creation flow)
    pub fn create_session(env: Env, session_id: Bytes32, buyer: Address, seller: Address, initial_status: SessionStatus) {
        let admin: Address = env.storage().instance().get(&ADMIN).expect("Contract not initialized");
        admin.require_auth();
        
        let session = Session {
            id: session_id,
            buyer,
            seller,
            status: initial_status,
            dispute_opened_at: None,
        };
        
        env.storage().persistent().set(&session_id, &session);
    }

    // Get a session's current details
    pub fn get_session(env: Env, session_id: Bytes32) -> Session {
        env.storage().persistent().get(&session_id).expect("Session does not exist")
    // Initialize the contract with an admin, treasury, and initial platform fee
    pub fn __constructor(env: Env, admin: Address, treasury: Address, initial_platform_fee_bps: u32) {
        // Validate initial fee is within 0-1000 bps (0-10%)
        if initial_platform_fee_bps > 1000 {
            panic!("Platform fee must be between 0 and 1000 basis points");
        }
        
        // Store admin, treasury, and initial fee
        env.storage().persistent().set(&ADMIN_KEY, &admin);
        env.storage().persistent().set(&TREASURY_KEY, &treasury);
        env.storage().persistent().set(&PLATFORM_FEE_KEY, &initial_platform_fee_bps);
    }

    // Admin-only function to update the platform fee
    pub fn set_platform_fee(env: Env, new_fee_bps: u32) {
        // Check that caller is the admin
        let admin: Address = env.storage().persistent().get(&ADMIN_KEY).expect("Admin not set");
        admin.require_auth();

        // Validate new fee is within 0-1000 bps (0-10%)
        if new_fee_bps > 1000 {
            panic!("Platform fee must be between 0 and 1000 basis points");
        }

        // Get current fee
        let old_fee_bps: u32 = env.storage().persistent().get(&PLATFORM_FEE_KEY).unwrap_or(0);
        
        // Only update and emit event if the fee actually changed
        if old_fee_bps != new_fee_bps {
            // Store the new fee
            env.storage().persistent().set(&PLATFORM_FEE_KEY, &new_fee_bps);

            // Emit the PlatformFeeUpdated event
            let event = PlatformFeeUpdated {
                old_fee_bps,
                new_fee_bps,
                updated_by: admin,
            };
            env.events().publish(
                (Symbol::new(&env, "PlatformFeeUpdated"),),
                event,
            );
        }
    }

    // View function to get the current platform fee
    pub fn get_platform_fee(env: Env) -> u32 {
        env.storage().persistent().get(&PLATFORM_FEE_KEY).unwrap_or(0)
    }

    // Helper function to calculate platform fee amount from a total amount
    pub fn calculate_platform_fee(env: Env, amount: u64) -> u64 {
        let fee_bps = Self::get_platform_fee(env);
        // Calculate fee: (amount * fee_bps) / 10000 (since 1bps = 1/10000)
        (amount * fee_bps as u64) / 10000
    }

    // Function to create a new session (would be called when escrow is created)
    pub fn create_session(
        env: Env,
        session_id: Bytes32,
        buyer: Address,
        seller: Address,
        amount: u64,
        token_address: Address,
    ) {
        // Create session storage key using tuple for uniqueness
        let session_key = (SESSION_PREFIX, session_id);
        
        // Check if session already exists
        if env.storage().persistent().has(&session_key) {
            panic!("Session with this ID already exists");
        }

        // Create and store the new session
        let session = Session {
            id: session_id,
            buyer,
            seller,
            amount,
            status: SessionStatus::Created,
            token_address,
        };
        
        env.storage().persistent().set(&session_key, &session);
    }

    // Function to mark a session as completed (would be called when work is done)
    pub fn mark_session_completed(env: Env, session_id: Bytes32) {
        // Get the session
        let mut session = Self::get_session(&env, &session_id);
        
        // Only buyer or seller can mark as completed
        if !env.invoker().address().eq(&session.buyer) && !env.invoker().address().eq(&session.seller) {
            panic!("Only buyer or seller can mark session as completed");
        }
        
        // Session must be in Created status
        if !matches!(session.status, SessionStatus::Created) {
            panic!("Only sessions in Created status can be marked as Completed");
        }

        // Update status
        session.status = SessionStatus::Completed;
        Self::save_session(&env, &session_id, session);
    }

    // Buyer-only function to approve a completed session and release funds
    pub fn approve_session(env: Env, session_id: Bytes32) {
        // Get the session
        let mut session = Self::get_session(&env, &session_id);
        
        // Verify that only the buyer can approve
        if !env.invoker().address().eq(&session.buyer) {
            panic!("Only the buyer can approve the session");
        }
        // Require explicit authentication from the buyer
        session.buyer.require_auth();

        // Verify session is in Completed status
        if !matches!(session.status, SessionStatus::Completed) {
            panic!("Only completed sessions can be approved");
        }

        // Get treasury address
        let treasury: Address = env.storage().persistent().get(&TREASURY_KEY).expect("Treasury not set");

        // Calculate fees and payout
        let platform_fee = Self::calculate_platform_fee(env, session.amount);
        let seller_payout = session.amount - platform_fee;

        // Initialize token client to handle transfers
        let token = TokenClient::new(&env, &session.token_address);

        // Transfer payout to seller
        token.transfer(
            &env.current_contract_address(),
            &session.seller,
            &seller_payout
        );

        // Transfer platform fee to treasury
        token.transfer(
            &env.current_contract_address(),
            &treasury,
            &platform_fee
        );

        // Update session status to Approved
        session.status = SessionStatus::Approved;
        Self::save_session(&env, &session_id, session);

        // Emit SessionApproved event
        let event = SessionApproved {
            session_id,
            buyer: session.buyer,
            seller: session.seller,
            total_amount: session.amount,
            platform_fee,
            seller_payout,
        };
        env.events().publish(
            (Symbol::new(&env, "SessionApproved"),),
            event,
        );
    }

    // Helper function to get a session from storage
    fn get_session(env: &Env, session_id: &Bytes32) -> Session {
        // Use session_id directly as part of the storage key tuple for uniqueness
        env.storage().persistent().get(&(SESSION_PREFIX, session_id)).expect("Session not found")
    }

    // Helper function to save a session to storage
    fn save_session(env: &Env, session_id: &Bytes32, session: Session) {
        // Use session_id directly as part of the storage key tuple for uniqueness
        env.storage().persistent().set(&(SESSION_PREFIX, session_id), &session);
    }

    pub fn lock_funds(env: Env, session_id: Bytes32, seller: Address, amount: i128) {
        // Revert if amount is not greater than 0
        if amount <= 0 {
            panic_with_error!(&env, ContractError::AmountMustBePositive);
        }

        // Revert if session ID already exists
        let session_key = (symbol_short!("session"), session_id);
        if env.storage().persistent().has(&session_key) {
            panic_with_error!(&env, ContractError::SessionAlreadyExists);
        }

        // Get the buyer (the caller of this function)
        let buyer = Address::from(env.current_contract_address().caller());
        
        // Require the buyer to authenticate
        buyer.require_auth();

        // Transfer native tokens from buyer to this contract
        env.ledger().transfer_native(&buyer, &env.current_contract_address(), amount);

        // Create and store the session with status = Locked
        let current_timestamp = env.ledger().timestamp();
        let session = Session {
            buyer: buyer.clone(),
            seller: seller.clone(),
            amount,
            status: SessionStatus::Locked,
            created_at: current_timestamp,
            completed_at: None,
            dispute_resolved_at: None,
        };
        save_session(&env, &session_id, &session);

        // Emit FundsLocked event
        log!(&env, "FundsLocked: session_id={:X}, buyer={:A}, seller={:A}, amount={}", session_id, buyer, seller, amount);
        env.events().publish(
            (symbol_short!("FundsLocked"), session_id.clone()),
            (buyer, seller, amount)
        );
    }

    pub fn hello(env: Env) -> Symbol {
        symbol_short!("Hello")
    }
}

// Implement conversion for SessionStatus to/from u32 for storage
impl From<u32> for SessionStatus {
    fn from(value: u32) -> Self {
        match value {
            0 => SessionStatus::Created,
            1 => SessionStatus::InProgress,
            2 => SessionStatus::Completed,
            3 => SessionStatus::Locked,
            4 => SessionStatus::Disputed,
            5 => SessionStatus::Resolved,
            _ => panic!("Invalid session status"),
        }
    }
}

impl From<SessionStatus> for u32 {
    fn from(status: SessionStatus) -> Self {
        status as u32
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::{Address, Bytes32, String};

    #[test]
    fn test_initial_treasury_set() {
        let env = Env::default();
        let contract_id = env.register_contract(None, SkillsyncContract);
        let client = SkillsyncContractClient::new(&env, &contract_id);
        
        let admin = Address::generate(&env);
        let initial_treasury = Address::generate(&env);
        
        // Mock authentication for admin and initial treasury
        env.mock_all_auths();
        
        client.initialize(admin, initial_treasury.clone());
        
        let treasury = client.get_treasury();
        assert_eq!(treasury, initial_treasury);
    }

    #[test]
    fn test_update_treasury() {
        let env = Env::default();
        let contract_id = env.register_contract(None, SkillsyncContract);
        let client = SkillsyncContractClient::new(&env, &contract_id);
        
        let admin = Address::generate(&env);
        let initial_treasury = Address::generate(&env);
        let new_treasury = Address::generate(&env);
        
        env.mock_all_auths();
        
        client.initialize(admin, initial_treasury);
        client.set_treasury(new_treasury.clone());
        
        let treasury = client.get_treasury();
        assert_eq!(treasury, new_treasury);
    }

    #[test]
    #[should_panic(expected = "Treasury not initialized")]
    fn test_get_treasury_uninitialized() {
        let env = Env::default();
        let contract_id = env.register_contract(None, SkillsyncContract);
        let client = SkillsyncContractClient::new(&env, &contract_id);
        
        client.get_treasury();
    }

    #[test]
    fn test_open_dispute_completed_session() {
        let env = Env::default();
        let contract_id = env.register_contract(None, SkillsyncContract);
        let client = SkillsyncContractClient::new(&env, &contract_id);
        
        let admin = Address::generate(&env);
        let initial_treasury = Address::generate(&env);
        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        let session_id = Bytes32::from_slice(&env, &[0u8; 32]);
        
        env.mock_all_auths();
        
        // Initialize contract
        client.initialize(admin, initial_treasury);
        
        // Create a completed session
        client.create_session(session_id, buyer.clone(), seller.clone(), SessionStatus::Completed);
        
        // Open dispute as buyer
        let reason = String::from_str(&env, "Service not delivered as described");
        client.open_dispute(session_id, reason.clone());
        
        // Verify session is now disputed
        let session = client.get_session(session_id);
        assert_eq!(session.status as u32, SessionStatus::Disputed as u32);
        assert!(session.dispute_opened_at.is_some());
    }

    #[test]
    #[should_panic(expected = "Dispute can only be opened on Completed or Locked sessions")]
    fn test_open_dispute_invalid_status() {
        let env = Env::default();
        let contract_id = env.register_contract(None, SkillsyncContract);
        let client = SkillsyncContractClient::new(&env, &contract_id);
        
        let admin = Address::generate(&env);
        let initial_treasury = Address::generate(&env);
        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        let session_id = Bytes32::from_slice(&env, &[0u8; 32]);
        
        env.mock_all_auths();
        
        // Initialize contract
        client.initialize(admin, initial_treasury);
        
        // Create an in-progress session (not completed or locked)
        client.create_session(session_id, buyer.clone(), seller.clone(), SessionStatus::InProgress);
        
        // Try to open dispute - should panic
        let reason = String::from_str(&env, "Service not delivered as described");
        client.open_dispute(session_id, reason);
    }

    #[test]
    #[should_panic(expected = "Only buyer or seller can open a dispute")]
    fn test_open_dispute_unauthorized() {
        let env = Env::default();
        let contract_id = env.register_contract(None, SkillsyncContract);
        let client = SkillsyncContractClient::new(&env, &contract_id);
        
        let admin = Address::generate(&env);
        let initial_treasury = Address::generate(&env);
        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        let unauthorized = Address::generate(&env);
        let session_id = Bytes32::from_slice(&env, &[0u8; 32]);
        
        // We can't mock all auths here because we want to test the invoker check
        env.set_invoker(unauthorized);
        
        client.initialize(admin, initial_treasury);
        client.create_session(session_id, buyer.clone(), seller.clone(), SessionStatus::Completed);
        
        // Try to open dispute as unauthorized user
        let reason = String::from_str(&env, "Invalid dispute attempt");
        client.open_dispute(session_id, reason);
    use soroban_sdk::{Address, Env};

    #[test]
    #[should_panic(expected = "Platform fee must be between 0 and 1000 basis points")]
    fn test_constructor_rejects_invalid_fee() {
        let env = Env::default();
        let admin = Address::generate(&env);
        // Try to set 1001 bps which is over the limit
        SkillsyncContract::__constructor(env, admin, 1001);
    }

    #[test]
    fn test_initial_platform_fee() {
        let env = Env::default();
        let contract_id = env.register_contract(None, SkillsyncContract);
        let admin = Address::generate(&env);
        let client = SkillsyncContractClient::new(&env, &contract_id);

        // Initialize with 250 bps (2.5%)
        client.__constructor(&admin, &250);
        
        // Check that the fee is correctly set
        let fee = client.get_platform_fee();
        assert_eq!(fee, 250);
    }

    #[test]
    fn test_update_platform_fee() {
        let env = Env::default();
        let contract_id = env.register_contract(None, SkillsyncContract);
        let admin = Address::generate(&env);
        let client = SkillsyncContractClient::new(&env, &contract_id);

        // Initialize with 0 bps
        client.__constructor(&admin, &0);
        
        // Mock admin authentication
        env.as_authority(&admin);
        
        // Update to 300 bps (3%)
        client.set_platform_fee(&300);
        
        // Check that the fee is updated
        let fee = client.get_platform_fee();
        assert_eq!(fee, 300);
    }

    #[test]
    #[should_panic(expected = "Platform fee must be between 0 and 1000 basis points")]
    fn test_set_platform_fee_rejects_invalid_fee() {
        let env = Env::default();
        let contract_id = env.register_contract(None, SkillsyncContract);
        let admin = Address::generate(&env);
        let client = SkillsyncContractClient::new(&env, &contract_id);

        client.__constructor(&admin, &100);
        
        env.as_authority(&admin);
        
        // Try to set 1500 bps which is invalid
        client.set_platform_fee(&1500);
    }

    #[test]
    fn test_calculate_platform_fee() {
        let env = Env::default();
        let contract_id = env.register_contract(None, SkillsyncContract);
        let admin = Address::generate(&env);
        let client = SkillsyncContractClient::new(&env, &contract_id);

        // Set fee to 200 bps (2%)
        client.__constructor(&admin, &200);
        
        // Calculate fee on 10000 units - should be 200
        let fee = client.calculate_platform_fee(&10000);
        assert_eq!(fee, 200);
        
        // Calculate fee on 5000 units - should be 100
        let fee = client.calculate_platform_fee(&5000);
        assert_eq!(fee, 100);
        
        // Update fee to 1000 bps (10%)
        env.as_authority(&admin);
        client.set_platform_fee(&1000);
        
        // Calculate fee on 10000 units - should be 1000
        let fee = client.calculate_platform_fee(&10000);
        assert_eq!(fee, 1000);
    use soroban_sdk::{
        symbol_short,
        testutils::{Address as _, Ledger},
        Address, Bytes32, Env,
    };

    #[test]
    #[should_panic(expected = "AmountMustBePositive")]
    fn test_lock_funds_zero_amount() {
        let env = Env::default();
        let contract_id = env.register_contract(None, SkillsyncContract);
        let client = SkillsyncContractClient::new(&env, &contract_id);

        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        let session_id = Bytes32::from([0u8; 32]);

        // Mock the caller to be the buyer
        env.set_caller(buyer.clone());
        // Fund the buyer with native tokens
        env.ledger().mint_native(&buyer, 1000);

        // This should panic because amount is 0
        client.lock_funds(session_id, seller, 0);
    }

    #[test]
    #[should_panic(expected = "SessionAlreadyExists")]
    fn test_lock_funds_duplicate_session() {
        let env = Env::default();
        let contract_id = env.register_contract(None, SkillsyncContract);
        let client = SkillsyncContractClient::new(&env, &contract_id);

        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        let session_id = Bytes32::from([0u8; 32]);

        env.set_caller(buyer.clone());
        env.ledger().mint_native(&buyer, 1000);

        // First call should succeed
        client.lock_funds(session_id.clone(), seller.clone(), 100);
        // Second call with same session_id should panic
        client.lock_funds(session_id, seller, 100);
    }

    #[test]
    fn test_lock_funds_success() {
        let env = Env::default();
        let contract_id = env.register_contract(None, SkillsyncContract);
        let client = SkillsyncContractClient::new(&env, &contract_id);

        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        let session_id = Bytes32::from([0u8; 32]);
        let amount = 100;

        env.set_caller(buyer.clone());
        env.ledger().mint_native(&buyer, 1000);

        // Call lock_funds
        client.lock_funds(session_id.clone(), seller.clone(), amount);

        // Check that the session is stored using our helper
        let stored_session = get_session(&env, &session_id).unwrap();
        assert_eq!(stored_session.status, SessionStatus::Locked);
        assert_eq!(stored_session.buyer, buyer);
        assert_eq!(stored_session.seller, seller);
        assert_eq!(stored_session.amount, amount);
        // Verify timestamp fields are properly set
        assert!(stored_session.created_at > 0);
        assert!(stored_session.completed_at.is_none());
        assert!(stored_session.dispute_resolved_at.is_none());

        // Check balances: buyer should have 1000 - 100 = 900, contract should have 100
        assert_eq!(env.ledger().balance_native(&buyer), 900);
        assert_eq!(env.ledger().balance_native(&contract_id), 100);

        // Check that the FundsLocked event was emitted
        let events = env.events().all();
        assert_eq!(events.len(), 1);
        let event = events.get(0);
        assert_eq!(event.topics(), (symbol_short!("FundsLocked"), session_id));
        assert_eq!(event.data(), (buyer, seller, amount));
    }

    #[test]
    fn test_hello() {
        let env = Env::default();
        let contract_id = env.register_contract(None, SkillsyncContract);
        let client = SkillsyncContractClient::new(&env, &contract_id);

        let msg = client.hello();
        assert_eq!(msg, symbol_short!("Hello"));
    }
}