use soroban_sdk::{contracttype, Address, BytesN, Env};

use crate::errors::ContractError;
use crate::types::Session;

/// Default dispute window, in ledgers.
pub const DEFAULT_DISPUTE_WINDOW_LEDGERS: u32 = 1000;

const DAY_IN_LEDGERS: u32 = 17_280;
const BUMP_THRESHOLD: u32 = 30 * DAY_IN_LEDGERS;
const BUMP_TO: u32 = 60 * DAY_IN_LEDGERS;

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    Treasury,
    Initialized,
    Token,
    PlatformFee,
    DisputeWindow,
    WasmHash,
    Session(BytesN<32>),
    InsurancePool,
    InsurancePremiumRate,
    InsuranceCoveragePercentage,
    InsurancePoolBalance,
}

fn bump_instance(env: &Env) {
    env.storage().instance().extend_ttl(BUMP_THRESHOLD, BUMP_TO);
}

pub fn is_initialized(env: &Env) -> bool {
    env.storage().instance().has(&DataKey::Initialized)
}

pub fn set_initialized(env: &Env) {
    env.storage().instance().set(&DataKey::Initialized, &true);
    bump_instance(env);
}

pub fn get_admin(env: &Env) -> Option<Address> {
    env.storage().instance().get(&DataKey::Admin)
}

pub fn set_admin(env: &Env, admin: &Address) {
    env.storage().instance().set(&DataKey::Admin, admin);
    bump_instance(env);
}

pub fn get_treasury(env: &Env) -> Option<Address> {
    env.storage().instance().get(&DataKey::Treasury)
}

pub fn set_treasury(env: &Env, treasury: &Address) {
    env.storage().instance().set(&DataKey::Treasury, treasury);
    bump_instance(env);
}

pub fn get_token(env: &Env) -> Option<Address> {
    env.storage().instance().get(&DataKey::Token)
}

pub fn set_token(env: &Env, token: &Address) {
    env.storage().instance().set(&DataKey::Token, token);
    bump_instance(env);
}

pub fn get_platform_fee(env: &Env) -> u32 {
    env.storage().instance().get(&DataKey::PlatformFee).unwrap_or(0)
}

pub fn set_platform_fee(env: &Env, fee_bps: u32) {
    env.storage().instance().set(&DataKey::PlatformFee, &fee_bps);
    bump_instance(env);
}

pub fn get_dispute_window(env: &Env) -> u32 {
    env.storage()
        .instance()
        .get(&DataKey::DisputeWindow)
        .unwrap_or(DEFAULT_DISPUTE_WINDOW_LEDGERS)
}

pub fn set_dispute_window(env: &Env, window_ledgers: u32) {
    env.storage()
        .instance()
        .set(&DataKey::DisputeWindow, &window_ledgers);
    bump_instance(env);
}

pub fn get_insurance_premium_rate(env: &Env) -> u32 {
    env.storage()
        .instance()
        .get(&DataKey::InsurancePremiumRate)
        .unwrap_or(100) // 100 bps = 1% default
}

pub fn set_insurance_premium_rate(env: &Env, rate_bps: u32) {
    env.storage()
        .instance()
        .set(&DataKey::InsurancePremiumRate, &rate_bps);
    bump_instance(env);
}

pub fn get_insurance_coverage_percentage(env: &Env) -> u32 {
    env.storage()
        .instance()
        .get(&DataKey::InsuranceCoveragePercentage)
        .unwrap_or(100) // 100% default
}

pub fn set_insurance_coverage_percentage(env: &Env, percentage: u32) {
    env.storage()
        .instance()
        .set(&DataKey::InsuranceCoveragePercentage, &percentage);
    bump_instance(env);
}

pub fn get_insurance_pool(env: &Env) -> Option<Address> {
    env.storage().instance().get(&DataKey::InsurancePool)
}

pub fn set_insurance_pool(env: &Env, pool: &Address) {
    env.storage().instance().set(&DataKey::InsurancePool, pool);
    bump_instance(env);
}

pub fn get_insurance_pool_balance(env: &Env) -> i128 {
    env.storage()
        .instance()
        .get(&DataKey::InsurancePoolBalance)
        .unwrap_or(0)
}

pub fn add_insurance_pool_balance(env: &Env, amount: i128) -> Result<(), ContractError> {
    let current = get_insurance_pool_balance(env);
    let new_balance = current.checked_add(amount).ok_or(ContractError::Overflow)?;
    env.storage()
        .instance()
        .set(&DataKey::InsurancePoolBalance, &new_balance);
    bump_instance(env);
    Ok(())
}

pub fn sub_insurance_pool_balance(env: &Env, amount: i128) -> Result<(), ContractError> {
    let current = get_insurance_pool_balance(env);
    let new_balance = current.checked_sub(amount).ok_or(ContractError::Overflow)?;
    if new_balance < 0 {
        return Err(ContractError::InsufficientInsurancePool);
    }
    env.storage()
        .instance()
        .set(&DataKey::InsurancePoolBalance, &new_balance);
    bump_instance(env);
    Ok(())
}

/// Hash of the currently deployed wasm as recorded by `upgrade`; all zeros
/// until the first upgrade.
pub fn get_wasm_hash(env: &Env) -> BytesN<32> {
    env.storage()
        .instance()
        .get(&DataKey::WasmHash)
        .unwrap_or(BytesN::from_array(env, &[0u8; 32]))
}

pub fn set_wasm_hash(env: &Env, hash: &BytesN<32>) {
    env.storage().instance().set(&DataKey::WasmHash, hash);
    bump_instance(env);
}

pub fn has_session(env: &Env, id: &BytesN<32>) -> bool {
    env.storage().persistent().has(&DataKey::Session(id.clone()))
}

/// Reads a session from persistent storage (extending its TTL).
pub fn get_session(env: &Env, id: &BytesN<32>) -> Option<Session> {
    let key = DataKey::Session(id.clone());
    let session: Option<Session> = env.storage().persistent().get(&key);
    if session.is_some() {
        env.storage().persistent().extend_ttl(&key, BUMP_THRESHOLD, BUMP_TO);
    }
    session
}

/// Writes a session to persistent storage (extending its TTL).
pub fn save_session(env: &Env, id: &BytesN<32>, session: &Session) {
    let key = DataKey::Session(id.clone());
    env.storage().persistent().set(&key, session);
    env.storage().persistent().extend_ttl(&key, BUMP_THRESHOLD, BUMP_TO);
}
