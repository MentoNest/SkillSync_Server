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
fn test_buyer_can_refund_before_complete() {
    let (env, buyer, seller, _, token_id) = setup();
    let cid = env.register(EscrowContract, ());
    let client = EscrowContractClient::new(&env, &cid);
    client.lock_funds(&1, &buyer, &seller, &600, &token_id);
    client.refund(&1, &token_id);
    assert_eq!(TokenClient::new(&env, &token_id).balance(&buyer), 1000);
    assert_eq!(client.get_session(&1).state, SessionState::Refunded);
}

#[test]
#[should_panic]
fn test_refund_reverts_if_already_completed() {
    let (env, buyer, seller, treasury, token_id) = setup();
    let client = EscrowContractClient::new(&env, &env.register(EscrowContract, ()));
    client.lock_funds(&1, &buyer, &seller, &500, &token_id);
    client.complete(&1);
    client.refund(&1, &token_id); // should panic — not Locked
}

#[test]
#[should_panic]
fn test_refund_reverts_if_already_approved() {
    let (env, buyer, seller, treasury, token_id) = setup();
    let client = EscrowContractClient::new(&env, &env.register(EscrowContract, ()));
    client.lock_funds(&1, &buyer, &seller, &500, &token_id);
    client.complete(&1);
    client.approve(&1, &token_id, &0, &treasury);
    client.refund(&1, &token_id); // should panic — not Locked
}