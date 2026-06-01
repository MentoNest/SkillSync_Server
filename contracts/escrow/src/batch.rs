// ============================================================================
// batch.rs — Issue: Batch Operations Module (#568)
//
// Enables batch processing of lock, approve, and refund operations for
// multiple sessions within a single transaction to optimize gas usage.
//
// All batch operations are atomic: if any single action fails, the entire
// batch is reverted.
//
// ============================================================================

use soroban_sdk::{token, Address, Bytes32, Env, Symbol, Vec};

use crate::{EscrowError, SessionData, SkillSyncEscrow, SkillSyncKey, Status};

/// Batch lock funds for multiple sessions in a single transaction.
///
/// Each entry in `sessions` contains:
///   (session_id, buyer, seller, amount, token_id)
///
/// # Errors
/// - Returns the first error encountered; all prior state changes are reverted
///   atomically by Soroban's transaction semantics.
pub fn batch_lock_funds(
    env: &Env,
    sessions: Vec<(Bytes32, Address, Address, i128, Address)>,
) -> Result<(), EscrowError> {
    for (session_id, buyer, seller, amount, token_id) in sessions.iter() {
        // Validate amount
        if amount <= 0 {
            return Err(EscrowError::InvalidAmount);
        }

        // Check for duplicate session
        if env
            .storage()
            .persistent()
            .has(&SkillSyncKey::Session(session_id.clone()))
        {
            return Err(EscrowError::DuplicateSessionId);
        }

        buyer.require_auth();

        // Transfer tokens from buyer to contract
        token::Client::new(env, &token_id).transfer(
            &buyer,
            &env.current_contract_address(),
            &amount,
        );

        // Create and store session
        let session = SessionData {
            buyer: buyer.clone(),
            seller,
            amount,
            token_id: token_id.clone(),
            status: Status::Locked,
            created_at: env.ledger().sequence() as u64,
            completed_at: 0,
            dispute_resolved_at: 0,
        };

        env.storage()
            .persistent()
            .set(&SkillSyncKey::Session(session_id.clone()), &session);

        env.events().publish(
            (Symbol::new(env, "BatchFundsLocked"), session_id),
            (buyer, amount),
        );
    }

    env.events().publish(
        (Symbol::new(env, "BatchLockCompleted"),),
        sessions.len(),
    );

    Ok(())
}

/// Batch approve multiple sessions, releasing funds to sellers.
///
/// Each entry in `sessions` contains:
///   (session_id, token_id)
///
/// All sessions must be in `Completed` state and called by the buyer.
pub fn batch_approve(
    env: &Env,
    sessions: Vec<(Bytes32, Address)>,
) -> Result<(), EscrowError> {
    for (session_id, token_id) in sessions.iter() {
        let mut session: SessionData = env
            .storage()
            .persistent()
            .get(&SkillSyncKey::Session(session_id.clone()))
            .ok_or(EscrowError::SessionNotFound)?;

        session.buyer.require_auth();

        if session.status != Status::Completed {
            return Err(EscrowError::InvalidState);
        }

        let amount = session.amount;
        let seller = session.seller.clone();

        // Transfer to seller
        token::Client::new(env, &token_id).transfer(
            &env.current_contract_address(),
            &seller,
            &amount,
        );

        session.status = Status::Approved;
        env.storage()
            .persistent()
            .set(&SkillSyncKey::Session(session_id.clone()), &session);

        env.events().publish(
            (Symbol::new(env, "BatchSessionApproved"), session_id),
            (seller, amount),
        );
    }

    env.events().publish(
        (Symbol::new(env, "BatchApproveCompleted"),),
        sessions.len(),
    );

    Ok(())
}

/// Batch complete multiple sessions (seller marks sessions as completed).
///
/// Each entry in `sessions` is a session_id.
/// All sessions must be in `Locked` state.
pub fn batch_complete(
    env: &Env,
    sessions: Vec<Bytes32>,
) -> Result<(), EscrowError> {
    for session_id in sessions.iter() {
        let mut session: SessionData = env
            .storage()
            .persistent()
            .get(&SkillSyncKey::Session(session_id.clone()))
            .ok_or(EscrowError::SessionNotFound)?;

        session.seller.require_auth();

        if session.status != Status::Locked {
            return Err(EscrowError::InvalidState);
        }

        session.status = Status::Completed;
        session.completed_at = env.ledger().timestamp();

        env.storage()
            .persistent()
            .set(&SkillSyncKey::Session(session_id.clone()), &session);

        env.events().publish(
            (Symbol::new(env, "BatchSessionCompleted"), session_id),
            session.seller.clone(),
        );
    }

    env.events().publish(
        (Symbol::new(env, "BatchCompleteCompleted"),),
        sessions.len(),
    );

    Ok(())
}
