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
    // Add a new data key for the native token address
    #[contracttype]
    #[derive(Clone, Copy, PartialEq, Eq)]
    enum DataKey {
        Treasury,
        Admin,
        NativeToken,
        Session(Bytes32),
    }

    // Initialize the contract with initial admin, treasury, and native token address
    pub fn initialize(env: Env, admin: Address, initial_treasury: Address, native_token: Address) {
        // Ensure the contract hasn't been initialized yet
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("Contract already initialized");
        }
        
        // Only admin needs to authorize the initialization
        admin.require_auth();
        
        // Store the initial values
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Treasury, &initial_treasury);
        env.storage().instance().set(&DataKey::NativeToken, &native_token);
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

    // Get native token address
    pub fn get_native_token(env: Env) -> Address {
        env.storage().instance().get(&DataKey::NativeToken).expect("Native token not set")
    }

    // Lock funds into a new escrow session - caller must be the buyer
    pub fn lock_funds(env: Env, session_id: Bytes32, seller: Address, amount: i128) {
        // Check if amount is greater than 0
        if amount <= 0 {
            panic!("Amount must be greater than 0");
        }

        // Check if session ID already exists
        let session_key = DataKey::Session(session_id.clone());
        if env.storage().instance().has(&session_key) {
            panic!("Session with this ID already exists");
        }

        // Get the buyer (the caller of this function)
        let buyer = env.invoker();
        buyer.require_auth();

        // Get the native token client and transfer funds from buyer to contract
        let native_token_address: Address = env.storage().instance().get(&DataKey::NativeToken).expect("Native token not set");
        let token = TokenClient::new(&env, &native_token_address);
        token.transfer(&buyer, &env.current_contract_address(), &amount);

        // Create and store the new escrow session
        let session = EscrowSession {
            session_id: session_id.clone(),
            buyer: buyer.clone(),
            seller: seller.clone(),
            amount,
            status: SessionStatus::Locked,
        };
        env.storage().instance().set(&session_key, &session);

        // Emit the FundsLocked event
        env.events().publish(
            (Symbol::new(&env, "FundsLocked"),),
            FundsLocked {
                session_id,
                buyer,
                seller,
                amount,
            },
        );
    }
}

#[cfg(test)]
mod tests;