#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, token, Address, BytesN, Env, IntoVal,
    Symbol,
};

// ============================================================================
// Single Session Escrow Contract (Contract)
// ============================================================================

#[contracttype]
#[derive(Clone, Copy, PartialEq, Debug)]
pub enum SingleSessionState {
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
        env.storage().instance().set(&symbol_short!("state"), &SingleSessionState::Pending);
    }

    pub fn lock(env: Env) {
        let buyer: Address = env.storage().instance().get(&symbol_short!("buyer")).unwrap();
        buyer.require_auth();
        env.storage().instance().set(&symbol_short!("state"), &SingleSessionState::Locked);
    }

    pub fn complete(env: Env) {
        let buyer: Address = env.storage().instance().get(&symbol_short!("buyer")).unwrap();
        buyer.require_auth();
        env.storage().instance().set(&symbol_short!("state"), &SingleSessionState::Completed);
    }

    pub fn approve(env: Env) {
        let seller: Address = env.storage().instance().get(&symbol_short!("seller")).unwrap();
        seller.require_auth();
        env.storage().instance().set(&symbol_short!("state"), &SingleSessionState::Pending);
    }

    pub fn dispute(env: Env) {
        let buyer: Address = env.storage().instance().get(&symbol_short!("buyer")).unwrap();
        buyer.require_auth();
        env.storage().instance().set(&symbol_short!("state"), &SingleSessionState::Disputed);
    }

    pub fn resolve(env: Env, admin: Address, _buyer_pct: u32) {
        admin.require_auth();
        env.storage().instance().set(&symbol_short!("state"), &SingleSessionState::Refunded);
    }

    pub fn refund(env: Env) {
        env.storage().instance().set(&symbol_short!("state"), &SingleSessionState::Refunded);
    }

    pub fn get_state(env: Env) -> SingleSessionState {
        env.storage()
            .instance()
            .get(&symbol_short!("state"))
            .unwrap_or(SingleSessionState::Pending)
    }
}

// ============================================================================
// Multi Session Escrow Contract (EscrowContract)
// ============================================================================

pub const DISPUTE_WINDOW: u64 = 7 * 24 * 3600; // 7 days
const BPS_DENOMINATOR: i128 = 10_000;
const TREASURY_KEY: Symbol = symbol_short!("TREASURY");

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Session(u64),
    Admin,
    PlatformFee,
    Treasury,
}

#[contracttype]
#[derive(Clone, PartialEq, Debug)]
pub enum SessionState {
    Locked,
    Completed,
    Approved,
    Refunded,
    AutoRefunded,
}

#[contracttype]
#[derive(Clone)]
pub struct Session {
    pub buyer: Address,
    pub seller: Address,
    pub amount: i128,
    pub state: SessionState,
    pub completed_at: u64,
}

/// Result of splitting a session payment into seller and treasury portions.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FeeSplit {
    pub seller_amount: i128,
    pub treasury_amount: i128,
}

#[contract]
pub struct EscrowContract;

#[contractimpl]
impl EscrowContract {
    pub fn initialize(env: Env, admin: Address, treasury: Address) {
        if env.storage().persistent().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        env.storage().persistent().set(&DataKey::Admin, &admin);
        env.storage().persistent().set(&DataKey::Treasury, &treasury);
        env.storage().persistent().set(&DataKey::PlatformFee, &0_u32);
    }

    pub fn set_treasury(env: Env, new_treasury: Address) {
        let admin: Address = env.storage().persistent().get(&DataKey::Admin).expect("not initialized");
        admin.require_auth();
        env.storage().persistent().set(&DataKey::Treasury, &new_treasury);
        env.events().publish((Symbol::new(&env, "TreasuryUpdated"),), new_treasury);
    }

    pub fn get_treasury(env: Env) -> Address {
        env.storage().persistent().get(&DataKey::Treasury).expect("treasury not set")
    }

    pub fn set_platform_fee(env: Env, new_fee_bps: u32) {
        let admin: Address = env.storage().persistent().get(&DataKey::Admin).expect("not initialized");
        admin.require_auth();
        if new_fee_bps > 1000 {
            panic!("fee_bps must not exceed 1000");
        }
        env.storage().persistent().set(&DataKey::PlatformFee, &new_fee_bps);
        env.events().publish((Symbol::new(&env, "PlatformFeeUpdated"),), new_fee_bps);
    }

    pub fn get_platform_fee(env: Env) -> u32 {
        env.storage().persistent().get(&DataKey::PlatformFee).unwrap_or(0_u32)
    }

    pub fn lock_funds(env: Env, session_id: u64, buyer: Address, seller: Address, amount: i128, token_id: Address) {
        buyer.require_auth();
        assert!(amount > 0, "amount must be positive");
        assert!(!env.storage().persistent().has(&DataKey::Session(session_id)), "duplicate session");
        token::Client::new(&env, &token_id).transfer(&buyer, &env.current_contract_address(), &amount);
        env.storage().persistent().set(
            &DataKey::Session(session_id),
            &Session {
                buyer,
                seller,
                amount,
                state: SessionState::Locked,
                completed_at: 0,
            },
        );
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

    pub fn approve(env: Env, session_id: u64, token_id: Address) {
        let mut s: Session = env.storage().persistent().get(&DataKey::Session(session_id)).unwrap();
        s.buyer.require_auth();
        assert_eq!(s.state, SessionState::Completed);

        let fee_bps = Self::get_platform_fee(env.clone());
        let fee = s.amount * fee_bps as i128 / 10_000;
        let payout = s.amount - fee;

        let t = token::Client::new(&env, &token_id);
        t.transfer(&env.current_contract_address(), &s.seller, &payout);
        if fee > 0 {
            let treasury = Self::get_treasury(env.clone());
            t.transfer(&env.current_contract_address(), &treasury, &fee);
        }
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

// ============================================================================
// SkillSync Escrow Contract — issues #521 #522 #523 #525 #526 #527
// ============================================================================

pub type Bytes32 = BytesN<32>;

/// Session status enum (#525)
#[contracttype]
#[derive(Clone, PartialEq, Debug)]
pub enum Status {
    Locked,
    Completed,
    Approved,
    Refunded,
    Disputed,
    Resolved,
}

/// Session struct (#525)
#[contracttype]
#[derive(Clone)]
pub struct SessionData {
    pub buyer: Address,
    pub seller: Address,
    pub amount: i128,
    pub status: Status,
    pub created_at: u64,
    pub completed_at: u64,
    pub dispute_resolved_at: u64,
}

#[contracttype]
pub enum SkillSyncKey {
    Session(Bytes32),
    Admin,
    DisputeWindow,
}

/// Error codes for SkillSyncEscrow (#526)
#[contracttype]
#[derive(Clone, Copy, PartialEq, Debug)]
#[repr(u32)]
pub enum EscrowError {
    DuplicateSessionId = 1,
    SessionNotFound = 2,
    InvalidState = 3,
    Unauthorized = 4,
}

const DEFAULT_DISPUTE_WINDOW: u32 = 1000;

#[contract]
pub struct SkillSyncEscrow;

impl SkillSyncEscrow {
    fn get_session_internal(env: &Env, id: &Bytes32) -> SessionData {
        env.storage()
            .persistent()
            .get(&SkillSyncKey::Session(id.clone()))
            .expect("session not found")
    }

    fn save_session_internal(env: &Env, id: &Bytes32, session: &SessionData) {
        env.storage()
            .persistent()
            .set(&SkillSyncKey::Session(id.clone()), session);
    }
}

#[contractimpl]
impl SkillSyncEscrow {
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().persistent().has(&SkillSyncKey::Admin) {
            panic!("already initialized");
        }
        env.storage().persistent().set(&SkillSyncKey::Admin, &admin);
    }

    // ── #525: session storage helpers ────────────────────────────────────────

    pub fn get_session(env: Env, id: Bytes32) -> SessionData {
        Self::get_session_internal(&env, &id)
    }

    pub fn save_session(env: Env, id: Bytes32, session: SessionData) {
        let admin: Address = env
            .storage()
            .persistent()
            .get(&SkillSyncKey::Admin)
            .expect("not initialized");
        admin.require_auth();
        Self::save_session_internal(&env, &id, &session);
    }

    // ── #523 + #526: lock_funds ───────────────────────────────────────────────

    /// Lock funds into a new escrow session.
    /// Returns EscrowError::DuplicateSessionId if session_id already exists (#526).
    pub fn lock_funds(
        env: Env,
        session_id: Bytes32,
        buyer: Address,
        seller: Address,
        amount: i128,
        token_id: Address,
    ) {
        buyer.require_auth();
        assert!(amount > 0, "amount must be positive");
        if env
            .storage()
            .persistent()
            .has(&SkillSyncKey::Session(session_id.clone()))
        {
            panic!("DuplicateSessionId");
        }

        token::Client::new(&env, &token_id).transfer(
            &buyer,
            &env.current_contract_address(),
            &amount,
        );

        let session = SessionData {
            buyer,
            seller,
            amount,
            status: Status::Locked,
            created_at: env.ledger().sequence() as u64,
            completed_at: 0,
            dispute_resolved_at: 0,
        };
        Self::save_session_internal(&env, &session_id, &session);

        env.events()
            .publish((Symbol::new(&env, "FundsLocked"), session_id), amount);
    }

    // ── #527: complete_session ────────────────────────────────────────────────

    /// Seller marks session as completed.
    /// - Only seller can call.
    /// - Session must be in Locked state.
    /// - Sets completed_at to current ledger timestamp.
    /// - Emits SessionCompleted event.
    /// Returns EscrowError::DuplicateSessionId if session is already Completed (#526).
    pub fn complete_session(env: Env, session_id: Bytes32) {
        let mut session = Self::get_session_internal(&env, &session_id);
        session.seller.require_auth();
        if session.status == Status::Completed {
            panic!("DuplicateSessionId");
        }
        assert!(session.status == Status::Locked, "InvalidState: session must be Locked");
        session.status = Status::Completed;
        session.completed_at = env.ledger().timestamp();
        Self::save_session_internal(&env, &session_id, &session);
        env.events().publish(
            (Symbol::new(&env, "SessionCompleted"), session_id),
            (session.seller.clone(), session.completed_at),
        );
    }

    // ── #526: approve_session ─────────────────────────────────────────────────

    /// Buyer approves completed session, releasing funds to seller.
    /// Checks session exists and is in Completed state (#526).
    pub fn approve_session(env: Env, session_id: Bytes32, token_id: Address) {
        let mut session = Self::get_session_internal(&env, &session_id);
        session.buyer.require_auth();
        assert!(
            session.status == Status::Completed,
            "InvalidState: session must be Completed"
        );
        token::Client::new(&env, &token_id).transfer(
            &env.current_contract_address(),
            &session.seller,
            &session.amount,
        );
        session.status = Status::Approved;
        Self::save_session_internal(&env, &session_id, &session);
        env.events()
            .publish((Symbol::new(&env, "SessionApproved"), session_id), session.amount);
    }

    // ── #526: refund_session ──────────────────────────────────────────────────

    /// Buyer requests refund. Session must be Locked (not already refunded) (#526).
    pub fn refund_session(env: Env, session_id: Bytes32, token_id: Address) {
        let mut session = Self::get_session_internal(&env, &session_id);
        session.buyer.require_auth();
        if session.status == Status::Refunded {
            panic!("DuplicateSessionId");
        }
        assert!(
            session.status == Status::Locked,
            "InvalidState: session must be Locked"
        );
        token::Client::new(&env, &token_id).transfer(
            &env.current_contract_address(),
            &session.buyer,
            &session.amount,
        );
        session.status = Status::Refunded;
        Self::save_session_internal(&env, &session_id, &session);
        env.events()
            .publish((Symbol::new(&env, "SessionRefunded"), session_id), session.amount);
    }

    // ── #521: dispute window ──────────────────────────────────────────────────

    pub fn set_dispute_window(env: Env, window_ledgers: u32) {
        let admin: Address = env
            .storage()
            .persistent()
            .get(&SkillSyncKey::Admin)
            .expect("not initialized");
        admin.require_auth();
        env.storage()
            .persistent()
            .set(&SkillSyncKey::DisputeWindow, &window_ledgers);
        env.events().publish(
            (Symbol::new(&env, "DisputeWindowUpdated"),),
            window_ledgers,
        );
    }

    pub fn get_dispute_window(env: Env) -> u32 {
        env.storage()
            .persistent()
            .get(&SkillSyncKey::DisputeWindow)
            .unwrap_or(DEFAULT_DISPUTE_WINDOW)
    }

    // ── #522: upgrade ─────────────────────────────────────────────────────────

    pub fn upgrade(env: Env, new_wasm_hash: Bytes32) {
        let admin: Address = env
            .storage()
            .persistent()
            .get(&SkillSyncKey::Admin)
            .expect("not initialized");
        admin.require_auth();
        env.deployer()
            .update_current_contract_wasm(new_wasm_hash.clone());
        env.events()
            .publish((Symbol::new(&env, "ContractUpgraded"),), new_wasm_hash);
    }
}

#[cfg(test)]
mod test;