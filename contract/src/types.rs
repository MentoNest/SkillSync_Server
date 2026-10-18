use soroban_sdk::{contracttype, Address};

/// Where an escrow session is in its life cycle.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum SessionStatus {
    Locked,
    Completed,
    Approved,
    Refunded,
    Disputed,
    Resolved,
}

/// One escrowed mentorship session.
///
/// Time fields hold ledger sequence numbers (0 = not set yet), so they can be
/// compared directly with the dispute window, which is also in ledgers.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Session {
    pub buyer: Address,
    pub seller: Address,
    pub amount: i128,
    pub status: SessionStatus,
    pub created_at: u64,
    pub completed_at: u64,
    pub dispute_resolved_at: u64,
}
