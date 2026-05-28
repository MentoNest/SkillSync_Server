#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, token, Address, Env};

#[contracttype] pub enum DataKey { Session(u64) }
#[contracttype] #[derive(Clone, PartialEq)] pub enum SessionState { Locked, Completed, Approved, Refunded }
#[contracttype] #[derive(Clone)]
pub struct Session { pub buyer: Address, pub seller: Address, pub amount: i128, pub state: SessionState }

#[contract] pub struct EscrowContract;
#[contractimpl]
impl EscrowContract {
    pub fn lock_funds(env: Env, session_id: u64, buyer: Address, seller: Address, amount: i128, token_id: Address) {
        buyer.require_auth();
        assert!(amount > 0, "amount must be positive");
        assert!(!env.storage().persistent().has(&DataKey::Session(session_id)), "duplicate session");
        token::Client::new(&env, &token_id).transfer(&buyer, &env.current_contract_address(), &amount);
        env.storage().persistent().set(&DataKey::Session(session_id), &Session { buyer, seller, amount, state: SessionState::Locked });
        env.events().publish((symbol_short!("LOCKED"), session_id), amount);
    }
    pub fn complete(env: Env, session_id: u64) {
        let mut s: Session = env.storage().persistent().get(&DataKey::Session(session_id)).unwrap();
        s.seller.require_auth();
        assert_eq!(s.state, SessionState::Locked);
        s.state = SessionState::Completed;
        env.storage().persistent().set(&DataKey::Session(session_id), &s);
    }
    pub fn approve(env: Env, session_id: u64, token_id: Address, fee_bps: u32, treasury: Address) {
        let mut s: Session = env.storage().persistent().get(&DataKey::Session(session_id)).unwrap();
        s.buyer.require_auth();
        assert_eq!(s.state, SessionState::Completed);
        let fee = s.amount * fee_bps as i128 / 10_000;
        let payout = s.amount - fee;
        let t = token::Client::new(&env, &token_id);
        t.transfer(&env.current_contract_address(), &s.seller, &payout);
        if fee > 0 { t.transfer(&env.current_contract_address(), &treasury, &fee); }
        s.state = SessionState::Approved;
        env.storage().persistent().set(&DataKey::Session(session_id), &s);
    }
    pub fn refund(env: Env, session_id: u64, token_id: Address) {
        let mut s: Session = env.storage().persistent().get(&DataKey::Session(session_id)).unwrap();
        s.buyer.require_auth();
        assert_eq!(s.state, SessionState::Locked);
        token::Client::new(&env, &token_id).transfer(&env.current_contract_address(), &s.buyer, &s.amount);
        s.state = SessionState::Refunded;
        env.storage().persistent().set(&DataKey::Session(session_id), &s);
        env.events().publish((symbol_short!("REFUNDED"), session_id), s.amount);
    }
    pub fn get_session(env: Env, session_id: u64) -> Session {
        env.storage().persistent().get(&DataKey::Session(session_id)).unwrap()
    }
}
#[cfg(test)] mod test;