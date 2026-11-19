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
    pub fn initialize(env: Env, admin: Address, treasury: Address) -> Result<(), ContractError> {
        if env.storage().instance().has(&DataKey::Initialized) {
            return Err(ContractError::AlreadyInitialized);
        }
        admin.require_auth();
        env.storage().persistent().set(&DataKey::Admin, &admin);
        env.storage().persistent().set(&DataKey::Treasury, &treasury);
        env.storage()
            .persistent()
            .set(&DataKey::PlatformFeeBps, &DEFAULT_PLATFORM_FEE_BPS);
        env.storage()
            .persistent()
            .set(&DataKey::DisputeWindow, &DEFAULT_DISPUTE_WINDOW_LEDGERS);
        env.storage().instance().set(&DataKey::Initialized, &true);
        env.events()
            .publish((Symbol::new(&env, "initialized"),), (admin, treasury));
        Ok(())
    }

    pub fn set_platform_fee(env: Env, new_fee_bps: u32) -> Result<(), ContractError> {
        require_admin(&env)?;
        if new_fee_bps > MAX_PLATFORM_FEE_BPS {
            return Err(ContractError::InvalidPlatformFee);
        }
        env.storage()
            .persistent()
            .set(&DataKey::PlatformFeeBps, &new_fee_bps);
        env.events().publish(
            (Symbol::new(&env, "platform_fee_updated"),),
            new_fee_bps,
        );
        Ok(())
    }

    pub fn get_platform_fee(env: Env) -> u32 {
        read_platform_fee(&env)
    }

    pub fn set_treasury(env: Env, new_treasury: Address) -> Result<(), ContractError> {
        require_admin(&env)?;
        env.storage()
            .persistent()
            .set(&DataKey::Treasury, &new_treasury);
        env.events()
            .publish((Symbol::new(&env, "treasury_updated"),), new_treasury);
        Ok(())
    }

    pub fn get_treasury(env: Env) -> Option<Address> {
        read_treasury(&env)
    }

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
}
