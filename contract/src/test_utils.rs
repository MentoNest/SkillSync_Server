#![cfg(test)]

use soroban_sdk::{
    testutils::Address as _, testutils::Events, token, Address, BytesN, Env, Symbol, TryFromVal,
    Val, Vec,
};

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

/// True when the event's first topic is the symbol `name` - the contract's own
/// events put the event name there.
fn is_named(env: &Env, topics: &Vec<Val>, name: &str) -> bool {
    match topics.first() {
        Some(topic) => Symbol::try_from_val(env, &topic)
            .map(|symbol| symbol == Symbol::new(env, name))
            .unwrap_or(false),
        None => false,
    }
}

/// The `(topics, data)` of the first event named `name`; panics when the
/// contract emitted no such event.
///
/// Filters by name because a call may also publish events from other contracts
/// (token transfers, for instance) alongside the contract's own.
pub fn event(env: &Env, name: &str) -> (Vec<Val>, Val) {
    let all = env.events().all();
    for i in 0..all.len() {
        let (_, topics, data) = all.get(i).unwrap();
        if is_named(env, &topics, name) {
            return (topics, data);
        }
    }
    panic!("event {} was never emitted", name);
}

/// How many times the contract emitted the event named `name`.
pub fn event_count(env: &Env, name: &str) -> usize {
    let all = env.events().all();
    let mut count = 0;
    for i in 0..all.len() {
        let (_, topics, _) = all.get(i).unwrap();
        if is_named(env, &topics, name) {
            count += 1;
        }
    }
    count
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
        dispute_opened_at: 0,
        dispute_resolved_at: 0,
    };
    f.env
        .as_contract(&f.contract_id, || storage::save_session(&f.env, id, &session));
}
