#![no_std]

use soroban_sdk::{contract, contractimpl, Address, Bytes32, Env, String, symbol_short, Symbol};

// Storage symbols
symbol_short! {TREASURY_UPDATED}
symbol_short! {ADMIN}
symbol_short! {TREASURY}
symbol_short! {DISPUTE_OPENED}

// Session status enum
#[derive(Debug, Clone, PartialEq, Eq)]
#[repr(u32)]
pub enum SessionStatus {
    Created = 0,
    InProgress = 1,
    Completed = 2,
    Locked = 3,
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
    }

    pub fn hello(env: Env) -> Symbol {
        Symbol::new(&env, "Hello")
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
    }

    #[test]
    fn test_hello() {
        let env = Env::default();
        let contract_id = env.register_contract(None, SkillsyncContract);
        let client = SkillsyncContractClient::new(&env, &contract_id);

        let msg = client.hello();
        assert_eq!(msg, Symbol::new(&env, "Hello"));
    }
}