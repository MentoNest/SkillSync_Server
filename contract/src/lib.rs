#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env};

#[contracttype]
#[derive(Clone)]
pub enum SessionState {
    Pending,
    Locked,
    Completed,
    Disputed,
    Refunded,
}

#[contract]
pub struct Contract;

#[contractimpl]
impl Contract {
    pub fn init(env: Env, buyer: Address, seller: Address, amount: i128) {
        env.storage().instance().set(&symbol_short!("buyer"), &buyer);
        env.storage().instance().set(&symbol_short!("seller"), &seller);
        env.storage().instance().set(&symbol_short!("amount"), &amount);
        env.storage().instance().set(&symbol_short!("state"), &SessionState::Pending);
    }

    pub fn lock(env: Env) {
        let buyer: Address = env.storage().instance().get(&symbol_short!("buyer")).unwrap();
        buyer.require_auth();
        env.storage().instance().set(&symbol_short!("state"), &SessionState::Locked);
    }

    pub fn complete(env: Env) {
        let buyer: Address = env.storage().instance().get(&symbol_short!("buyer")).unwrap();
        buyer.require_auth();
        env.storage().instance().set(&symbol_short!("state"), &SessionState::Completed);
    }

    pub fn approve(env: Env) {
        let seller: Address = env.storage().instance().get(&symbol_short!("seller")).unwrap();
        seller.require_auth();
        env.storage().instance().set(&symbol_short!("state"), &SessionState::Pending);
    }

    pub fn dispute(env: Env) {
        let buyer: Address = env.storage().instance().get(&symbol_short!("buyer")).unwrap();
        buyer.require_auth();
        env.storage().instance().set(&symbol_short!("state"), &SessionState::Disputed);
    }

    pub fn resolve(env: Env, admin: Address, _buyer_pct: u32) {
        admin.require_auth();
        env.storage().instance().set(&symbol_short!("state"), &SessionState::Refunded);
    }

    pub fn refund(env: Env) {
        env.storage().instance().set(&symbol_short!("state"), &SessionState::Refunded);
    }

    pub fn get_state(env: Env) -> SessionState {
        env.storage()
            .instance()
            .get(&symbol_short!("state"))
            .unwrap_or(SessionState::Pending)
    }
}

#[cfg(test)]
mod test;
