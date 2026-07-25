#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, Env, Address, Symbol};

// Storage key for platform fee
const PLATFORM_FEE_KEY: &str = "platform_fee";
// Storage key for admin address
const ADMIN_KEY: &str = "admin";

// Event to emit when platform fee is updated
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PlatformFeeUpdated {
    pub old_fee_bps: u32,
    pub new_fee_bps: u32,
    pub updated_by: Address,
}

#[contract]
pub struct SkillsyncContract;

#[contractimpl]
impl SkillsyncContract {
    // Initialize the contract with an admin and initial platform fee
    pub fn __constructor(env: Env, admin: Address, initial_platform_fee_bps: u32) {
        // Validate initial fee is within 0-1000 bps (0-10%)
        if initial_platform_fee_bps > 1000 {
            panic!("Platform fee must be between 0 and 1000 basis points");
        }
        
        // Store admin and initial fee
        env.storage().persistent().set(&ADMIN_KEY, &admin);
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