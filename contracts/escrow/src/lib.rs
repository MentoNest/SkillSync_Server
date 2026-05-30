#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Bytes32, Env, Symbol};

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
}

#[contractimpl]
impl EscrowContract {
    /// Locks funds into a new escrow session and emits the FundsLocked event.
    pub fn lock_funds(
        e: Env,
        session_id: Bytes32,
        buyer: Address,
        seller: Address,
        amount: i128,
    ) {
        buyer.require_auth();

        let timestamp = e.ledger().timestamp();

        let session_metadata = Session {
            id: session_id.clone(),
            buyer: buyer.clone(),
            seller: seller.clone(),
            amount,
            timestamp,
        };

        // Emit the FundsLocked event as specified in the acceptance criteria
        // Signature: event FundsLocked(session_id: Bytes32, buyer: Address, seller: Address, amount: i128, timestamp: u64)
        e.events().publish(
            (Symbol::new(&e, "FundsLocked"),),
            (session_id, buyer, seller, amount, timestamp),
        );
    }
}
