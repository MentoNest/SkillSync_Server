//! Shared test doubles.
//!
//! Kept in one place because four test modules need the same thing: a token
//! that behaves like SEP-41 and can be funded without going through an
//! allowance. Duplicating it per module would mean four subtly different
//! tokens, and a test that passes against one says nothing about the others.

use soroban_sdk::testutils::Address as _;
use soroban_sdk::{contract, contractimpl, contracttype, Address, Env};

#[contracttype]
#[derive(Clone)]
pub enum BalanceKey {
    Balance(Address),
}

/// Body of `transfer` and `transfer_from`, kept out of the `#[contractimpl]`
/// block so it is not part of the ABI.
fn move_tokens(env: &Env, from: &Address, to: &Address, amount: i128) {
    let from_key = BalanceKey::Balance(from.clone());
    let available: i128 = env.storage().persistent().get(&from_key).unwrap_or(0);
    assert!(available >= amount, "MockToken: insufficient balance");

    env.storage()
        .persistent()
        .set(&from_key, &(available - amount));

    let to_key = BalanceKey::Balance(to.clone());
    let existing: i128 = env.storage().persistent().get(&to_key).unwrap_or(0);
    env.storage()
        .persistent()
        .set(&to_key, &(existing + amount));
}

/// A minimal SEP-41 token.
#[contract]
pub struct MockToken;

#[contractimpl]
impl MockToken {
    /// Credit `to` with `amount`, bypassing `transfer_from`, so a test can set
    /// up a funded buyer without configuring an allowance.
    pub fn mint(env: Env, to: Address, amount: i128) {
        let current: i128 = env
            .storage()
            .persistent()
            .get(&BalanceKey::Balance(to.clone()))
            .unwrap_or(0);
        env.storage()
            .persistent()
            .set(&BalanceKey::Balance(to), &(current + amount));
    }

    pub fn balance_of(env: Env, who: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&BalanceKey::Balance(who))
            .unwrap_or(0)
    }

    pub fn transfer(env: Env, to: Address, amount: i128) {
        let from = env.current_contract_address();
        move_tokens(&env, &from, &to, amount);
    }

    pub fn transfer_from(env: Env, from: Address, to: Address, amount: i128) {
        move_tokens(&env, &from, &to, amount);
    }
}

/// A contract that implements neither `transfer` nor `transfer_from`, for
/// exercising the "not a token" failure path.
#[contract]
pub struct NotAToken;

#[contractimpl]
impl NotAToken {
    pub fn ping(_env: Env) -> u32 {
        1
    }
}

/// Register a fresh [`MockToken`] and return its address.
pub fn new_token(env: &Env) -> Address {
    env.register(MockToken, ())
}

/// Credit `who` with `amount` of `token`.
pub fn fund(env: &Env, token: &Address, who: &Address, amount: i128) {
    let inner = env.clone();
    let token = token.clone();
    let who = who.clone();
    env.as_contract(&token, move || MockToken::mint(inner, who, amount));
}

/// `who`'s balance of `token`.
pub fn balance(env: &Env, token: &Address, who: &Address) -> i128 {
    let inner = env.clone();
    let token = token.clone();
    let who = who.clone();
    env.as_contract(&token, move || MockToken::balance_of(inner, who))
}

/// A random address, re-exported so test modules need one import.
pub fn address(env: &Env) -> Address {
    Address::generate(env)
}
