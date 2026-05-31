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
    pub deadline: u64,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Session(Bytes32),
    Admin,
    Treasury,
    FeeBps,
    DisputeWindow,
    ExtensionProposal(Bytes32),
}

const STATUS_LOCKED: u32 = 0;
const STATUS_COMPLETED: u32 = 1;
const STATUS_DISPUTED: u32 = 2;
const STATUS_REFUNDED: u32 = 3;
const STATUS_RESOLVED: u32 = 4;

const MAX_EXTENSION_LEDGERS: u64 = 10_000;

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
            deadline: 0,
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

    pub fn propose_extension(e: Env, session_id: Bytes32, additional_ledgers: u64) {
        let session: Session = e
            .storage()
            .persistent()
            .get(&DataKey::Session(session_id.clone()))
            .expect("Session not found");

        let caller = e.invoker();
        caller.require_auth();

        // Validate caller is either buyer or seller
        if caller != session.buyer && caller != session.seller {
            panic!("unauthorized caller");
        }

        // Validate session is in a valid state for extension
        if session.status != STATUS_LOCKED {
            panic!("session not in valid state for extension");
        }

        // Validate extension does not exceed maximum
        if additional_ledgers > MAX_EXTENSION_LEDGERS {
            panic!("extension exceeds maximum allowed ledgers");
        }

        // Check if there's already an extension proposal
        let proposal_key = DataKey::ExtensionProposal(session_id.clone());
        if e.storage().temporary().has(&proposal_key) {
            panic!("extension already proposed");
        }

        // Calculate new deadline
        let current_ledger = e.ledger().sequence();
        let new_deadline = current_ledger + additional_ledgers;

        // Store extension proposal
        let proposal = (caller.clone(), new_deadline, additional_ledgers);
        e.storage().temporary().set(&proposal_key, &proposal);

        // Emit ExtensionProposed event
        e.events().publish(
            (Symbol::new(&e, "ExtensionProposed"),),
            (session_id, caller, additional_ledgers, new_deadline),
        );
    }

    pub fn accept_extension(e: Env, session_id: Bytes32) {
        let mut session: Session = e
            .storage()
            .persistent()
            .get(&DataKey::Session(session_id.clone()))
            .expect("Session not found");

        let caller = e.invoker();
        caller.require_auth();

        // Validate caller is either buyer or seller
        if caller != session.buyer && caller != session.seller {
            panic!("unauthorized caller");
        }

        // Check if there's an extension proposal
        let proposal_key = DataKey::ExtensionProposal(session_id.clone());
        if !e.storage().temporary().has(&proposal_key) {
            panic!("no extension proposal exists");
        }

        let (proposer, new_deadline, _additional_ledgers): (Address, u64, u64) = 
            e.storage().temporary().get(&proposal_key).unwrap();

        // Validate caller is the other party (not the proposer)
        if caller == proposer {
            panic!("proposer cannot accept their own extension");
        }

        // Update session deadline
        session.deadline = new_deadline;
        e.storage().persistent().set(&DataKey::Session(session_id.clone()), &session);

        // Remove the extension proposal
        e.storage().temporary().remove(&proposal_key);

        // Emit ExtensionAccepted event
        e.events().publish(
            (Symbol::new(&e, "ExtensionAccepted"),),
            (session_id, caller, new_deadline),
        );
    }
}
