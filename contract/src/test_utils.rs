#![cfg(test)]

use soroban_sdk::{testutils::Address as _, token, Address, BytesN, Env};

use crate::storage;
use crate::types::{Session, SessionStatus};
use crate::{SkillSyncEscrow, SkillSyncEscrowClient};

pub struct Fixture {
    pub env: Env,
    pub client: SkillSyncEscrowClient<'static>,
    pub contract_id: Address,
    pub admin: Address,
    pub treasury: Address,
    pub token: Address,
    pub buyer: Address,
    pub seller: Address,
}

/// Registers the contract and a payment token, initializes the contract and
/// funds the buyer. The token is written straight into storage so tests of
/// one feature never depend on another feature's entrypoints.
pub fn setup() -> Fixture {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(SkillSyncEscrow, ());
    let client = SkillSyncEscrowClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    let buyer = Address::generate(&env);
    let seller = Address::generate(&env);

    let token = env
        .register_stellar_asset_contract_v2(Address::generate(&env))
        .address();
    token::StellarAssetClient::new(&env, &token).mint(&buyer, &1_000_000);

    client.initialize(&admin, &treasury);
    env.as_contract(&contract_id, || storage::set_token(&env, &token));

    Fixture { env, client, contract_id, admin, treasury, token, buyer, seller }
}

pub fn session_id(env: &Env, seed: u8) -> BytesN<32> {
    BytesN::from_array(env, &[seed; 32])
}

pub fn balance(f: &Fixture, who: &Address) -> i128 {
    token::Client::new(&f.env, &f.token).balance(who)
}

/// Writes a session straight into storage and funds the contract with its
/// amount, as if `lock_funds` had run.
pub fn seed_session(
    f: &Fixture,
    id: &BytesN<32>,
    status: SessionStatus,
    amount: i128,
    completed_at: u64,
) {
    token::StellarAssetClient::new(&f.env, &f.token).mint(&f.contract_id, &amount);
    let session = Session {
        buyer: f.buyer.clone(),
        seller: f.seller.clone(),
        amount,
        status,
        created_at: 1,
        completed_at,
        dispute_resolved_at: 0,
    };
    f.env
        .as_contract(&f.contract_id, || storage::save_session(&f.env, id, &session));
}
