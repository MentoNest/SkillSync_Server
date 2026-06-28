use soroban_sdk::{Address, Bytes, Env, String, Vec};

use crate::{DataKey, Session, SessionStatus};

#[contracttype]
#[derive(Clone)]
pub struct DisputeVote {
    pub voter: Address,
    pub vote: VoteType,
    pub weight: u32,
    pub timestamp: u32,
}

#[contracttype]
#[derive(Clone, PartialEq)]
pub enum VoteType {
    ForBuyer,
    ForSeller,
    Split(u32, u32),
}

#[contracttype]
#[derive(Clone)]
pub struct DisputeProposal {
    pub dispute_id: Bytes,
    pub proposed_by: Address,
    pub resolution: VoteType,
    pub votes_for: u32,
    pub votes_against: u32,
    pub total_weight: u32,
    pub voting_ends: u32,
    pub executed: bool,
}

pub fn create_dispute_proposal(
    env: &Env,
    dispute_id: &Bytes,
    proposed_by: &Address,
    resolution: VoteType,
    voting_period_seconds: u32,
) -> DisputeProposal {
    let ledger_time = env.ledger().timestamp();

    let proposal = DisputeProposal {
        dispute_id: dispute_id.clone(),
        proposed_by: proposed_by.clone(),
        resolution: resolution.clone(),
        votes_for: 0,
        votes_against: 0,
        total_weight: 0,
        voting_ends: ledger_time + voting_period_seconds,
        executed: false,
    };

    let key = DataKey::ExtensionProposal(dispute_id.clone());
    env.storage().persistent().set(&key, &proposal);
    proposal
}

pub fn cast_vote(
    env: &Env,
    dispute_id: &Bytes,
    voter: &Address,
    support: bool,
    weight: u32,
) -> DisputeProposal {
    let key = DataKey::ExtensionProposal(dispute_id.clone());
    let mut proposal: DisputeProposal = env
        .storage()
        .persistent()
        .get(&key)
        .expect("No active proposal for this dispute");

    let ledger_time = env.ledger().timestamp();
    if ledger_time > proposal.voting_ends {
        panic!("Voting period has ended");
    }

    if support {
        proposal.votes_for += weight;
    } else {
        proposal.votes_against += weight;
    }
    proposal.total_weight += weight;

    env.storage().persistent().set(&key, &proposal);
    proposal
}

pub fn execute_dispute_proposal(env: &Env, dispute_id: &Bytes) -> bool {
    let key = DataKey::ExtensionProposal(dispute_id.clone());
    let proposal: DisputeProposal = env
        .storage()
        .persistent()
        .get(&key)
        .expect("No proposal found for this dispute");

    if proposal.executed {
        panic!("Proposal already executed");
    }

    let ledger_time = env.ledger().timestamp();
    if ledger_time <= proposal.voting_ends {
        panic!("Voting period is still active");
    }

    if proposal.votes_for <= proposal.votes_against {
        panic!("Proposal did not pass");
    }

    let session_key = DataKey::Session(proposal.dispute_id.clone());
    let mut session: Session = env
        .storage()
        .persistent()
        .get(&session_key)
        .expect("Session not found");

    session.status = SessionStatus::Resolved;
    env.storage().persistent().set(&session_key, &session);

    let mut executed_proposal = proposal;
    executed_proposal.executed = true;
    env.storage().persistent().set(&key, &executed_proposal);

    true
}
