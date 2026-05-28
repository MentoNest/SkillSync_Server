#![cfg(test)]

use super::{Contract, ContractClient, SessionState};
use soroban_sdk::{testutils::Address as _, Address, Env};

fn setup(env: &Env) -> (ContractClient, Address, Address, Address) {
    let id = env.register(Contract, ());
    let client = ContractClient::new(env, &id);
    let buyer = Address::generate(env);
    let seller = Address::generate(env);
    let admin = Address::generate(env);
    client.init(&buyer, &seller, &100_i128);
    (client, buyer, seller, admin)
}

#[test]
fn test_buyer_opens_dispute_after_complete() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, ..) = setup(&env);
    client.lock();
    client.complete();
    client.dispute();
    assert!(matches!(client.get_state(), SessionState::Disputed));
}

#[test]
fn test_resolve_buyer_100_pct() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, _, admin) = setup(&env);
    client.lock();
    client.dispute();
    client.resolve(&admin, &100_u32);
    assert!(matches!(client.get_state(), SessionState::Refunded));
}

#[test]
fn test_resolve_seller_100_pct() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, _, admin) = setup(&env);
    client.lock();
    client.dispute();
    client.resolve(&admin, &0_u32);
    assert!(matches!(client.get_state(), SessionState::Refunded));
}

#[test]
fn test_split_resolution() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, _, admin) = setup(&env);
    client.lock();
    client.dispute();
    client.resolve(&admin, &50_u32);
    assert!(matches!(client.get_state(), SessionState::Refunded));
}
