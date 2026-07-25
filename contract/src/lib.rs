#![no_std]

use soroban_sdk::{contract, contractimpl, Address, Env, symbol_short, Symbol};

symbol_short! {TREASURY_UPDATED}
symbol_short! {ADMIN}
symbol_short! {TREASURY}

#[contract]
pub struct SkillsyncContract;

#[contractevent]
pub struct TreasuryUpdated {
    pub old_treasury: Address,
    pub new_treasury: Address,
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

    pub fn hello(env: Env) -> Symbol {
        Symbol::new(&env, "Hello")
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::Address;

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
    fn test_hello() {
        let env = Env::default();
        let contract_id = env.register_contract(None, SkillsyncContract);
        let client = SkillsyncContractClient::new(&env, &contract_id);

        let msg = client.hello();
        assert_eq!(msg, Symbol::new(&env, "Hello"));
    }
}