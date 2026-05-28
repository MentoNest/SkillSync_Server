#![cfg(test)]
use super::*;
use soroban_sdk::{testutils::{Address as _, MockAuth, MockAuthInvoke}, vec, Env, IntoVal};
use soroban_sdk::token::{Client as TokenClient, StellarAssetClient};

fn setup() -> (Env, Address, Address, Address, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let buyer = Address::generate(&env);
    let seller = Address::generate(&env);
    let treasury = Address::generate(&env);
    let token_id = env.register_stellar_asset_contract_v2(admin.clone()).address();
    StellarAssetClient::new(&env, &token_id).mint(&buyer, &1000);
    (env, buyer, seller, treasury, token_id, admin)
}

#[test]
fn test_lock_funds_success() {
    let (env, buyer, seller, _, token_id, _) = setup();
    let contract_id = env.register(EscrowContract, ());
    let client = EscrowContractClient::new(&env, &contract_id);
    client.lock_funds(&1, &buyer, &seller, &500, &token_id);
    let s = client.get_session(&1);
    assert_eq!(s.state, SessionState::Locked);
    assert_eq!(TokenClient::new(&env, &token_id).balance(&contract_id), 500);
}

#[test]
#[should_panic]
fn test_lock_funds_zero_amount_reverts() {
    let (env, buyer, seller, _, token_id, _) = setup();
    let client = EscrowContractClient::new(&env, &env.register(EscrowContract, ()));
    client.lock_funds(&1, &buyer, &seller, &0, &token_id);
}

#[test]
#[should_panic]
fn test_lock_funds_duplicate_session_reverts() {
    let (env, buyer, seller, _, token_id, _) = setup();
    let client = EscrowContractClient::new(&env, &env.register(EscrowContract, ()));
    client.lock_funds(&1, &buyer, &seller, &100, &token_id);
    client.lock_funds(&1, &buyer, &seller, &100, &token_id);
}