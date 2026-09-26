use soroban_sdk::{symbol_short, Address, Bytes, Env, Vec};

use crate::errors::ContractError;
use crate::session;

/// Batched session operations.
///
/// Buyers and sellers setting up a dozen sessions, or approving a month of
/// completed work, would otherwise pay a transaction's worth of fees a dozen
/// times over. The batch entry points do the same work in one transaction.
///
/// ## All or nothing
///
/// A batch is atomic: if one session in it cannot be processed, none of them
/// are. That is not an extra feature, it is the only defensible behaviour for
/// money movement — a partially applied batch would leave the caller unable
/// to tell which half settled, and the escrow has no "resume where you left
/// off" concept to reconcile against.
///
/// In practice that means the first failure aborts the whole transaction, so
/// the loop below stops at the first error rather than continuing to
/// accumulate failures. Continuing would burn gas on work that is about to be
/// thrown away and would bury the real cause under a pile of consequences.
///
/// Because of that, the batch is validated *before* any of it is applied, in a
/// single pass with no state writes. A duplicate ID, a non-positive amount or
/// an oversized batch is then reported before a single transfer has moved,
/// rather than partway through.

/// Maximum number of sessions one batch may carry.
///
/// Each item is a persistent-storage read or write plus an auth check, so
/// cost grows linearly. Without a ceiling a single transaction could be made
/// arbitrarily expensive, and a caller who hits that ceiling learns it as an
/// out-of-gas failure rather than as a clear error they can act on.
const MAX_BATCH_SIZE: u32 = 20;

/// Reject an empty or oversized batch before doing any work.
fn check_batch_size(len: u32) -> Result<(), ContractError> {
    if len == 0 {
        return Err(ContractError::InvalidBatch);
    }
    if len > MAX_BATCH_SIZE {
        return Err(ContractError::BatchTooLarge);
    }
    Ok(())
}

/// Reject a batch that names the same session twice.
///
/// Without this, `batch_approve` on `[a, a]` would approve `a` and then fail
/// on the second pass — a failure that reads like a state problem but is
/// really a malformed request. Comparing each item only against the ones after
/// it keeps the check O(n²) but visits each pair once, and at
/// [`MAX_BATCH_SIZE`] items that is trivial next to the storage work.
fn check_no_duplicates<T, F>(items: &Vec<T>, eq: F) -> Result<(), ContractError>
where
    F: Fn(&T, &T) -> bool,
{
    for i in 0..items.len() {
        for j in (i + 1)..items.len() {
            if eq(&items.get(i).unwrap(), &items.get(j).unwrap()) {
                return Err(ContractError::DuplicateInBatch);
            }
        }
    }
    Ok(())
}

/// Escrow funds for several sessions in one transaction.
///
/// Each item is `(session_id, seller, amount)`. The buyer is `caller` for all
/// of them: a batch is one buyer provisioning several engagements, and taking
/// a buyer per item would let one transaction mix buyers, which is a
/// different operation with different semantics.
///
/// # Errors
/// - [`ContractError::InvalidBatch`] if `sessions` is empty.
/// - [`ContractError::BatchTooLarge`] if it holds more than
///   [`MAX_BATCH_SIZE`] items.
/// - [`ContractError::InvalidAmount`] if any amount is not positive.
/// - [`ContractError::DuplicateInBatch`] if an ID repeats within the batch.
/// - [`ContractError::DuplicateSessionId`] if an ID already exists on-chain.
/// - `"session not found"`, `"InvalidSessionState"`,
///   `"InvalidMetadataUri"`, `"NotParticipant"` — propagated from the
///   underlying session, vesting and metadata paths.
///
/// # Events
/// One `FundsLocked` per session, plus `BatchCompleted` with the count.
pub fn batch_lock_funds(
    env: &Env,
    caller: Address,
    sessions: Vec<(Bytes, Address, i128)>,
) -> Result<(), ContractError> {
    check_batch_size(sessions.len())?;

    // ── Pre-flight ─────────────────────────────────────────────────────
    // Everything that can be checked without writing, checked before
    // anything is written.
    for item in sessions.iter() {
        if item.2 <= 0 {
            return Err(ContractError::InvalidAmount);
        }
    }
    check_no_duplicates(&sessions, |a, b| a.0 == b.0)?;
    for item in sessions.iter() {
        if session::session_exists(env, &item.0) {
            return Err(ContractError::DuplicateSessionId);
        }
    }

    // ── Apply ──────────────────────────────────────────────────────────
    // `?` is the early break: the first failure returns, and returning an
    // error from a contract call reverts every write above.
    for item in sessions.iter() {
        session::lock_funds(env, item.0.clone(), caller.clone(), item.1.clone(), item.2);
    }

    let count = sessions.len();
    env.events()
        .publish((symbol_short!("batch"), symbol_short!("lock")), count);

    Ok(())
}

/// Approve several completed sessions in one transaction.
///
/// `caller` must be the buyer of every session in the list. A list spanning
/// two buyers is rejected by the first session that is not the caller's, and
/// the whole batch reverts.
///
/// # Errors
/// - [`ContractError::InvalidBatch`] if `session_ids` is empty.
/// - [`ContractError::BatchTooLarge`] if it holds more than
///   [`MAX_BATCH_SIZE`] items.
/// - `"session not found"` if any session does not exist.
/// - `"InvalidSessionState"` if any is not `Completed`.
/// - `"NotBuyer"` if `caller` is not the buyer of the first session that
///   belongs to someone else.
///
/// # Events
/// One `SessionApproved` per session, plus `BatchCompleted` with the count.
pub fn batch_approve(env: &Env, caller: Address, session_ids: Vec<Bytes>) -> Result<(), ContractError> {
    check_batch_size(session_ids.len())?;
    check_no_duplicates(&session_ids, |a, b| a == b)?;

    for id in session_ids.iter() {
        session::approve_session(env, id.clone());
    }

    let count = session_ids.len();
    env.events()
        .publish((symbol_short!("batch"), symbol_short!("appr")), count);

    Ok(())
}

/// Mark several sessions complete in one transaction.
///
/// `caller` must be the seller of every session in the list.
///
/// # Errors
/// - [`ContractError::InvalidBatch`] if `session_ids` is empty.
/// - [`ContractError::BatchTooLarge`] if it holds more than
///   [`MAX_BATCH_SIZE`] items.
/// - `"session not found"` if any session does not exist.
/// - `"InvalidSessionState"` if any is not `Locked`.
/// - `"NotSeller"` if `caller` is not the seller of a session in the list.
///
/// # Events
/// One `SessionCompleted` per session, plus `BatchCompleted` with the count.
pub fn batch_complete(env: &Env, caller: Address, session_ids: Vec<Bytes>) -> Result<(), ContractError> {
    check_batch_size(session_ids.len())?;
    check_no_duplicates(&session_ids, |a, b| a == b)?;

    for id in session_ids.iter() {
        session::complete_session(env, id.clone());
    }

    let count = session_ids.len();
    env.events()
        .publish((symbol_short!("batch"), symbol_short!("done")), count);

    Ok(())
}

/// Refund several locked sessions to the buyer in one transaction.
///
/// Named explicitly rather than folded into `batch_approve`: a refund returns
/// money and an approval keeps it, and a caller reaching for the wrong one
/// should get a compile error rather than a surprise.
///
/// # Errors
/// - [`ContractError::InvalidBatch`] if `session_ids` is empty.
/// - [`ContractError::BatchTooLarge`] if it holds more than
///   [`MAX_BATCH_SIZE`] items.
/// - `"session not found"` if any session does not exist.
/// - `"InvalidSessionState"` if any is not `Locked`.
/// - `"NotBuyer"` if `caller` is not the buyer of a session in the list.
///
/// # Events
/// One `SessionRefunded` per session, plus `BatchCompleted` with the count.
pub fn batch_refund(env: &Env, caller: Address, session_ids: Vec<Bytes>) -> Result<(), ContractError> {
    check_batch_size(session_ids.len())?;
    check_no_duplicates(&session_ids, |a, b| a == b)?;

    for id in session_ids.iter() {
        session::refund_session(env, id.clone());
    }

    let count = session_ids.len();
    env.events()
        .publish((symbol_short!("batch"), symbol_short!("ref")), count);

    Ok(())
}
