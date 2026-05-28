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
fn test_lock_complete_approve() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, ..) = setup(&env);
    client.lock();
    assert!(matches!(client.get_state(), SessionState::Locked));
    client.complete();
    assert!(matches!(client.get_state(), SessionState::Completed));
    client.approve();
    assert!(matches!(client.get_state(), SessionState::Pending));
}

#[test]
fn test_refund_path() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, ..) = setup(&env);
    client.lock();
    client.refund();
    assert!(matches!(client.get_state(), SessionState::Refunded));
}

#[test]
fn test_dispute_and_resolve() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, _, admin) = setup(&env);
    client.lock();
    client.complete();
    client.dispute();
    assert!(matches!(client.get_state(), SessionState::Disputed));
    client.resolve(&admin, &50_u32);
    assert!(matches!(client.get_state(), SessionState::Refunded));
}

#[test]
fn test_initial_state_is_pending() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, ..) = setup(&env);
    assert!(matches!(client.get_state(), SessionState::Pending));
}
