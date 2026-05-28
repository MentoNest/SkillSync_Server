#![cfg(test)]
use super::*;
use soroban_sdk::{testutils::Address as _, Env};
use soroban_sdk::token::{Client as TokenClient, StellarAssetClient};

fn setup() -> (Env, Address, Address, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let buyer = Address::generate(&env);
    let seller = Address::generate(&env);
    let treasury = Address::generate(&env);
    let token_id = env.register_stellar_asset_contract_v2(admin).address();
    StellarAssetClient::new(&env, &token_id).mint(&buyer, &1000);
    (env, buyer, seller, treasury, token_id)
}

#[test]
fn test_complete_and_approve_happy_path() {
    let (env, buyer, seller, treasury, token_id) = setup();
    let cid = env.register(EscrowContract, ());
    let client = EscrowContractClient::new(&env, &cid);
    client.lock_funds(&1, &buyer, &seller, &1000, &token_id);
    client.complete(&1);
    assert_eq!(client.get_session(&1).state, SessionState::Completed);
    client.approve(&1, &token_id, &500, &treasury); // 5% fee
    let s = client.get_session(&1);
    assert_eq!(s.state, SessionState::Approved);
    assert_eq!(TokenClient::new(&env, &token_id).balance(&seller), 950);
    assert_eq!(TokenClient::new(&env, &token_id).balance(&treasury), 50);
}

#[test]
#[should_panic]
fn test_seller_cannot_complete_before_lock() {
    let (env, buyer, seller, _, token_id) = setup();
    let client = EscrowContractClient::new(&env, &env.register(EscrowContract, ()));
    // No lock — complete should panic (session not found)
    client.complete(&99);
}

#[test]
#[should_panic]
fn test_buyer_cannot_approve_before_complete() {
    let (env, buyer, seller, treasury, token_id) = setup();
    let client = EscrowContractClient::new(&env, &env.register(EscrowContract, ()));
    client.lock_funds(&1, &buyer, &seller, &500, &token_id);
    client.approve(&1, &token_id, &0, &treasury); // not completed yet
}