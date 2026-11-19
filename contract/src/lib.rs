#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, token, Address, Bytes32, Env, Symbol,
};

#[contract]
pub struct SkillssyncEscrow;

const DEFAULT_PLATFORM_FEE_BPS: u32 = 100;
const DEFAULT_DISPUTE_WINDOW_LEDGERS: u32 = 1000;
const MAX_PLATFORM_FEE_BPS: u32 = 1000;

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    Admin,
    Treasury,
    PlatformFeeBps,
    DisputeWindow,
    PaymentToken,
    Initialized,
    WasmHash,
    Session(Bytes32),
}

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum SessionStatus {
    Locked,
    Completed,
    Approved,
    Refunded,
    Disputed,
    Resolved,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Session {
    pub buyer: Address,
    pub seller: Address,
    pub amount: i128,
    pub status: SessionStatus,
    pub created_at: u64,
    pub completed_at: u64,
    pub dispute_resolved_at: u64,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum ContractError {
    AlreadyInitialized = 1,
    Unauthorized = 2,
    InvalidPlatformFee = 3,
    InvalidAmount = 4,
    DuplicateSessionId = 5,
    SessionNotFound = 6,
    InvalidSessionStatus = 7,
    PaymentTokenNotConfigured = 8,
}

fn read_admin(env: &Env) -> Option<Address> {
    env.storage().persistent().get(&DataKey::Admin)
}

fn require_admin(env: &Env) -> Result<Address, ContractError> {
    let admin = read_admin(env).ok_or(ContractError::Unauthorized)?;
    admin.require_auth();
    Ok(admin)
}

fn read_treasury(env: &Env) -> Option<Address> {
    env.storage().persistent().get(&DataKey::Treasury)
}

fn read_platform_fee(env: &Env) -> u32 {
    env.storage()
        .persistent()
        .get(&DataKey::PlatformFeeBps)
        .unwrap_or(DEFAULT_PLATFORM_FEE_BPS)
}

fn read_dispute_window(env: &Env) -> u32 {
    env.storage()
        .persistent()
        .get(&DataKey::DisputeWindow)
        .unwrap_or(DEFAULT_DISPUTE_WINDOW_LEDGERS)
}

fn read_payment_token(env: &Env) -> Option<Address> {
    env.storage().persistent().get(&DataKey::PaymentToken)
}

fn load_session(env: &Env, session_id: Bytes32) -> Option<Session> {
    env.storage().persistent().get(&DataKey::Session(session_id))
}

fn save_session(env: &Env, session_id: Bytes32, session: &Session) {
    env.storage()
        .persistent()
        .set(&DataKey::Session(session_id), session);
}

fn session_exists(env: &Env, session_id: Bytes32) -> bool {
    env.storage()
        .persistent()
        .has(&DataKey::Session(session_id))
}

#[contractimpl]
impl SkillssyncEscrow {
    pub fn set_payment_token(env: Env, token: Address) -> Result<(), ContractError> {
        require_admin(&env)?;
        env.storage().persistent().set(&DataKey::PaymentToken, &token);
        env.events()
            .publish((Symbol::new(&env, "payment_token_updated"),), token);
        Ok(())
    }

    pub fn get_payment_token(env: Env) -> Option<Address> {
        read_payment_token(&env)
    }

    pub fn set_dispute_window(env: Env, window_ledgers: u32) -> Result<(), ContractError> {
        require_admin(&env)?;
        env.storage()
            .persistent()
            .set(&DataKey::DisputeWindow, &window_ledgers);
        env.events().publish(
            (Symbol::new(&env, "dispute_window_updated"),),
            window_ledgers,
        );
        Ok(())
    }

    pub fn get_dispute_window(env: Env) -> u32 {
        read_dispute_window(&env)
    }

    pub fn upgrade(env: Env, new_wasm_hash: Bytes32) -> Result<(), ContractError> {
        require_admin(&env)?;
        let old_hash = env
            .storage()
            .instance()
            .get::<_, Bytes32>(&DataKey::WasmHash)
            .unwrap_or_else(|| Bytes32::from_array(&env, &[0u8; 32]));
        env.events().publish(
            (Symbol::new(&env, "contract_upgraded"),),
            (old_hash, new_wasm_hash.clone()),
        );
        env.storage()
            .instance()
            .set(&DataKey::WasmHash, &new_wasm_hash);
        env.deployer().update_current_contract_wasm(new_wasm_hash);
        Ok(())
    }

    pub fn lock_funds(
        env: Env,
        session_id: Bytes32,
        buyer: Address,
        seller: Address,
        amount: i128,
    ) -> Result<(), ContractError> {
        if amount <= 0 {
            return Err(ContractError::InvalidAmount);
        }
        if session_exists(&env, session_id.clone()) {
            return Err(ContractError::DuplicateSessionId);
        }
        buyer.require_auth();
        let token_addr =
            read_payment_token(&env).ok_or(ContractError::PaymentTokenNotConfigured)?;
        let token = token::Client::new(&env, &token_addr);
        token.transfer(&buyer, &env.current_contract_address(), &amount);
        let session = Session {
            buyer: buyer.clone(),
            seller: seller.clone(),
            amount,
            status: SessionStatus::Locked,
            created_at: env.ledger().timestamp(),
            completed_at: 0,
            dispute_resolved_at: 0,
        };
        save_session(&env, session_id.clone(), &session);
        env.events().publish(
            (Symbol::new(&env, "funds_locked"),),
            (session_id, buyer, seller, amount),
        );
        Ok(())
    }

    pub fn get_session(env: Env, session_id: Bytes32) -> Option<Session> {
        load_session(&env, session_id)
    }
}
