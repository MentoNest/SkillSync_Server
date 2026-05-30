#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, Address, Bytes32, Env, Symbol, String};

#[contract]
pub struct EscrowContract;

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Session {
    pub id: Bytes32,
    pub buyer: Address,
    pub seller: Address,
    pub amount: i128,
    pub timestamp: u64,
    pub status: u32,
    pub completed_at: u64,
    pub dispute_opened_at: u64,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Session(Bytes32),
    Admin,
    Treasury,
    FeeBps,
    DisputeWindow,
}

const STATUS_LOCKED: u32 = 0;
const STATUS_COMPLETED: u32 = 1;
const STATUS_DISPUTED: u32 = 2;
const STATUS_REFUNDED: u32 = 3;
const STATUS_RESOLVED: u32 = 4;

#[contractimpl]
impl EscrowContract {
    pub fn init_config(e: Env, admin: Address, treasury: Address, fee_bps: u32, dispute_window: u64) {
        admin.require_auth();
        e.storage().persistent().set(&DataKey::Admin, &admin);
        e.storage().persistent().set(&DataKey::Treasury, &treasury);
        e.storage().persistent().set(&DataKey::FeeBps, &fee_bps);
        e.storage().persistent().set(&DataKey::DisputeWindow, &dispute_window);
    }

    pub fn lock_funds(
        e: Env,
        session_id: Bytes32,
        buyer: Address,
        seller: Address,
        amount: i128,
    ) {
        buyer.require_auth();

        let now = e.ledger().timestamp();

        let session_metadata = Session {
            id: session_id.clone(),
            buyer: buyer.clone(),
            seller: seller.clone(),
            amount,
            timestamp: now,
            status: STATUS_LOCKED,
            completed_at: 0,
            dispute_opened_at: 0,
        };
        e.storage().persistent().set(&DataKey::Session(session_id.clone()), &session_metadata);

        e.events().publish(
            (Symbol::new(&e, "FundsLocked"),),
            (session_id, buyer, seller, amount, now),
        );
    }

    pub fn complete_session(e: Env, session_id: Bytes32) {
        let mut session: Session = e
            .storage()
            .persistent()
            .get(&DataKey::Session(session_id.clone()))
            .unwrap();
        session.status = STATUS_COMPLETED;
        session.completed_at = e.ledger().timestamp();
        e.storage().persistent().set(&DataKey::Session(session_id), &session);
    }

    pub fn open_dispute(e: Env, session_id: Bytes32, reason: String) {
        let mut session: Session = e
            .storage()
            .persistent()
            .get(&DataKey::Session(session_id.clone()))
            .unwrap();

        if session.status != STATUS_COMPLETED && session.status != STATUS_LOCKED {
            panic!("session not disputable");
        }

        session.status = STATUS_DISPUTED;
        session.dispute_opened_at = e.ledger().timestamp();
        e.storage().persistent().set(&DataKey::Session(session_id.clone()), &session);
        e.events().publish((Symbol::new(&e, "DisputeOpened"),), (session_id, reason));
    }

    pub fn resolve_dispute(
        e: Env,
        session_id: Bytes32,
        resolution: u32,
        buyer_share: i128,
        seller_share: i128,
    ) {
        let mut session: Session = e
            .storage()
            .persistent()
            .get(&DataKey::Session(session_id.clone()))
            .unwrap();
        if session.status != STATUS_DISPUTED {
            panic!("session not disputed");
        }
        let admin: Address = e.storage().persistent().get(&DataKey::Admin).unwrap();
        admin.require_auth();

        if buyer_share + seller_share != session.amount {
            panic!("invalid shares");
        }
        let (seller_after_fee, fee_amount) = Self::apply_fee(&e, seller_share);
        let buyer_after_fee = buyer_share;

        session.status = STATUS_RESOLVED;
        e.storage().persistent().set(&DataKey::Session(session_id.clone()), &session);
        e.events().publish(
            (Symbol::new(&e, "DisputeResolved"),),
            (session_id, resolution, buyer_after_fee, seller_after_fee, fee_amount),
        );
    }

    pub fn auto_refund(e: Env, session_id: Bytes32) {
        let mut session: Session = e
            .storage()
            .persistent()
            .get(&DataKey::Session(session_id.clone()))
            .unwrap();
        if session.status != STATUS_COMPLETED {
            panic!("session not completed");
        }
        let dispute_window: u64 = e.storage().persistent().get(&DataKey::DisputeWindow).unwrap_or(0);
        if e.ledger().timestamp() <= session.completed_at + dispute_window {
            panic!("dispute window not elapsed");
        }

        session.status = STATUS_REFUNDED;
        e.storage().persistent().set(&DataKey::Session(session_id.clone()), &session);
        e.events().publish((Symbol::new(&e, "AutoRefundExecuted"),), (session_id, session.amount));
    }

    fn apply_fee(e: &Env, amount: i128) -> (i128, i128) {
        let fee_bps: u32 = e.storage().persistent().get(&DataKey::FeeBps).unwrap_or(0);
        let fee = (amount * (fee_bps as i128)) / 10_000;
        (amount - fee, fee)
    }
}
