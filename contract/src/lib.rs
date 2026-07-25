#![no_std]

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
}

#[contract]
pub struct SkillsyncContract;

#[contractimpl]
impl SkillsyncContract {
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

    pub fn hello(env: Env) -> Symbol {
        Symbol::new(&env, "Hello")
    }
}

#[cfg(test)]
mod test {
    use super::*;
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