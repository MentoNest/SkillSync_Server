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

#[contracttype]
#[derive(Clone)]
pub enum SessionState {
    Pending,
    Locked,
    Completed,
    Disputed,
    Refunded,
}
use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, token, Address, Env};

#[contracttype] pub enum DataKey { Session(u64) }
#[contracttype] #[derive(Clone, PartialEq)] pub enum SessionState { Locked, Completed, Approved, Refunded }
#[contracttype] #[derive(Clone)]
pub struct Session { pub buyer: Address, pub seller: Address, pub amount: i128, pub state: SessionState }

use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, vec, Env, String, Symbol, Vec};

/// Basis-point denominator. 10_000 bps == 100%.
const BPS_DENOMINATOR: i128 = 10_000;

/// Storage key for the accumulated treasury balance.
const TREASURY_KEY: Symbol = symbol_short!("TREASURY");

/// Result of splitting a session payment into seller and treasury portions.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FeeSplit {
    pub seller_amount: i128,
    pub treasury_amount: i128,
}

pub const DISPUTE_WINDOW: u64 = 7 * 24 * 3600; // 7 days

#[contracttype] pub enum DataKey { Session(u64) }
#[contracttype] #[derive(Clone, PartialEq)] pub enum SessionState { Locked, Completed, Approved, Refunded, AutoRefunded }
#[contracttype] #[derive(Clone)]
pub struct Session { pub buyer: Address, pub seller: Address, pub amount: i128, pub state: SessionState, pub completed_at: u64 }

#[contract] pub struct EscrowContract;
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

    pub fn refund(env: Env) {
        env.storage().instance().set(&symbol_short!("state"), &SessionState::Refunded);
    }

    pub fn get_state(env: Env) -> SessionState {
        env.storage()
            .instance()
            .get(&symbol_short!("state"))
            .unwrap_or(SessionState::Pending)
impl EscrowContract {
    pub fn lock_funds(env: Env, session_id: u64, buyer: Address, seller: Address, amount: i128, token_id: Address) {
        buyer.require_auth();
        assert!(amount > 0, "amount must be positive");
        assert!(!env.storage().persistent().has(&DataKey::Session(session_id)), "duplicate session");
        token::Client::new(&env, &token_id).transfer(&buyer, &env.current_contract_address(), &amount);
        env.storage().persistent().set(&DataKey::Session(session_id), &Session { buyer, seller, amount, state: SessionState::Locked });
        assert!(amount > 0);
        assert!(!env.storage().persistent().has(&DataKey::Session(session_id)));
        token::Client::new(&env, &token_id).transfer(&buyer, &env.current_contract_address(), &amount);
        env.storage().persistent().set(&DataKey::Session(session_id), &Session { buyer, seller, amount, state: SessionState::Locked, completed_at: 0 });
        env.events().publish((symbol_short!("LOCKED"), session_id), amount);
    }
    pub fn complete(env: Env, session_id: u64) {
        let mut s: Session = env.storage().persistent().get(&DataKey::Session(session_id)).unwrap();
        s.seller.require_auth();
        assert_eq!(s.state, SessionState::Locked);
        s.state = SessionState::Completed;
        s.completed_at = env.ledger().timestamp();
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
    }
    pub fn auto_refund(env: Env, session_id: u64, token_id: Address) {
        let mut s: Session = env.storage().persistent().get(&DataKey::Session(session_id)).unwrap();
        assert_eq!(s.state, SessionState::Completed);
        assert!(env.ledger().timestamp() >= s.completed_at + DISPUTE_WINDOW, "window not passed");
        token::Client::new(&env, &token_id).transfer(&env.current_contract_address(), &s.buyer, &s.amount);
        s.state = SessionState::AutoRefunded;
        env.storage().persistent().set(&DataKey::Session(session_id), &s);
        env.events().publish((symbol_short!("AUTOREF"), session_id), s.amount);
    }
    pub fn get_session(env: Env, session_id: u64) -> Session {
        env.storage().persistent().get(&DataKey::Session(session_id)).unwrap()
    }

    /// Pure fee calculation. Splits `amount` between seller and treasury using
    /// `fee_bps` (basis points; 10_000 bps == 100%).
    ///
    /// The treasury share is rounded DOWN to the smallest unit, so the seller
    /// always receives any remainder. The treasury share can therefore never
    /// exceed `amount` for valid inputs (`fee_bps <= 10_000`).
    pub fn calculate_fee(amount: i128, fee_bps: u32) -> FeeSplit {
        if amount < 0 {
            panic!("amount must be non-negative");
        }
        if (fee_bps as i128) > BPS_DENOMINATOR {
            panic!("fee_bps must not exceed 10000");
        }

        let treasury_amount = amount
            .checked_mul(fee_bps as i128)
            .expect("fee multiplication overflow")
            / BPS_DENOMINATOR;
        let seller_amount = amount - treasury_amount;

        FeeSplit {
            seller_amount,
            treasury_amount,
        }
    }

    /// Settles a single session payment: computes the split and adds the
    /// treasury portion to the cumulative treasury balance held in instance
    /// storage. Returns the resulting `FeeSplit`.
    pub fn settle_session(env: Env, amount: i128, fee_bps: u32) -> FeeSplit {
        let split = Self::calculate_fee(amount, fee_bps);
        let current: i128 = env
            .storage()
            .instance()
            .get(&TREASURY_KEY)
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&TREASURY_KEY, &(current + split.treasury_amount));
        split
    }

    /// Returns the cumulative treasury balance accumulated across all
    /// `settle_session` calls for this contract instance.
    pub fn treasury_balance(env: Env) -> i128 {
        env.storage().instance().get(&TREASURY_KEY).unwrap_or(0)
    }
}
#[cfg(test)] mod test;