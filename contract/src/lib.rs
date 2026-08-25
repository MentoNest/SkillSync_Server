use soroban_sdk::{contract, contractimpl, contracttype, Address, Bytes32, Env, Symbol, token::TokenClient};

// Data keys for storing contract state
#[contracttype]
#[derive(Clone, Copy, PartialEq, Eq)]
enum DataKey {
    Treasury,    // Stores the treasury address
    Admin,       // Stores the admin address
    Session(Bytes32), // Stores escrow sessions by session ID
}

// Session status enum
#[contracttype]
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum SessionStatus {
    Locked,
    // We can add more statuses later like Completed, Refunded, etc.
}

// Escrow session structure
#[contracttype]
#[derive(Clone)]
pub struct EscrowSession {
    pub session_id: Bytes32,
    pub buyer: Address,
    pub seller: Address,
    pub amount: i128,
    pub status: SessionStatus,
}

// Event definitions
#[contracttype]
#[derive(Clone)]
pub struct TreasuryUpdated {
    pub old_treasury: Address,
    pub new_treasury: Address,
}

#[contracttype]
#[derive(Clone)]
pub struct FundsLocked {
    pub session_id: Bytes32,
    pub buyer: Address,
    pub seller: Address,
    pub amount: i128,
}

#[contract]
pub struct SkillSyncContract;

#[contractimpl]
impl SkillSyncContract {
    // Initialize the contract with initial admin and treasury addresses
    pub fn initialize(env: Env, admin: Address, initial_treasury: Address) {
        // Ensure the contract hasn't been initialized yet
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("Contract already initialized");
        }
        
        // Only admin needs to authorize the initialization
        admin.require_auth();
        
        // Store the initial values
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Treasury, &initial_treasury);
    }

    // Set new treasury address - admin only
    pub fn set_treasury(env: Env, new_treasury: Address) {
        // Check if caller is the admin
        let admin: Address = env.storage().instance().get(&DataKey::Admin).expect("Admin not set");
        admin.require_auth();
        
        // Get current treasury to emit event
        let old_treasury: Address = env.storage().instance().get(&DataKey::Treasury).expect("Treasury not set");
        
        // Update the treasury
        env.storage().instance().set(&DataKey::Treasury, &new_treasury);
        
        // Emit the TreasuryUpdated event
        env.events().publish(
            (Symbol::new(&env, "TreasuryUpdated"),),
            TreasuryUpdated {
                old_treasury,
                new_treasury,
            },
        );
    }

    // Get the current treasury address - view function
    pub fn get_treasury(env: Env) -> Address {
        env.storage().instance().get(&DataKey::Treasury).expect("Treasury not set")
    }

    // Optional: Get admin address (could be useful)
    pub fn get_admin(env: Env) -> Address {
        env.storage().instance().get(&DataKey::Admin).expect("Admin not set")
    }
}

#[cfg(test)]
mod tests;