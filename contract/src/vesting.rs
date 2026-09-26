use soroban_sdk::{contracttype, Address, Bytes, Env};

use crate::errors::ContractError;
use crate::events;
use crate::session;

/// Linear vesting of a seller's escrow payout.
///
/// Some sellers will not accept payment up front — a long engagement, a
/// milestone structure, anything where being paid on approval is a credit
/// risk. This lets a buyer lock funds as usual while the seller's *release*
/// is spread over time: nothing is claimable during the cliff, then it
/// unlocks linearly until fully vested at `cliff + duration`.
///
/// The schedule is linear, not stepped, because a stepped schedule needs a
/// list of checkpoints and a counter to walk it with, which is a lot of
/// on-chain state to maintain for no benefit a linear curve cannot give up.
/// A cliff plus a duration is the whole configuration.
///
/// # Rounding
///
/// The claimable amount is `total * elapsed / duration`, truncated. Truncation
/// always rounds *down*, so repeated claims can never sum to more than
/// `total` — the schedule cannot be drained by claiming in small slices. The
/// dust truncation leaves behind is released by the final claim, when
/// `elapsed` reaches `duration` and the formula yields exactly
/// `total - claimed`.
///
/// Storage keys owned by this module.
#[contracttype]
#[derive(Clone)]
pub enum VestingKey {
    /// The vesting schedule attached to one session.
    Schedule(Bytes),
}

/// A seller's linear release schedule over an escrowed session.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct VestingSchedule {
    /// The total amount released over the schedule, in the escrowed token.
    pub total: i128,
    /// How much has been claimed so far.
    pub claimed: i128,
    /// Ledger sequence the schedule started at.
    pub start_ledger: u64,
    /// Ledgers after `start_ledger` during which nothing is claimable.
    pub cliff_ledgers: u64,
    /// Ledgers over which the release runs once the cliff is past.
    pub vesting_duration: u64,
    /// Set once an unvested remainder has been returned to the buyer because
    /// the session was disputed. Latches: a dispute is not something a
    /// schedule recovers from.
    pub buyer_recovered: bool,
    /// How much was returned to the buyer on that dispute.
    pub buyer_recovery_amount: i128,
}

/// The schedule attached to `session_id`, or `None` if it has none.
pub fn get_schedule(env: &Env, session_id: &Bytes) -> Option<VestingSchedule> {
    env.storage()
        .persistent()
        .get(&VestingKey::Schedule(session_id.clone()))
}

/// The ledger sequence a schedule's cliff clears at.
fn cliff_end(schedule: &VestingSchedule) -> u64 {
    schedule
        .start_ledger
        .saturating_add(schedule.cliff_ledgers)
}

/// The ledger sequence a schedule fully vests at.
fn vest_end(schedule: &VestingSchedule) -> u64 {
    cliff_end(schedule).saturating_add(schedule.vesting_duration)
}

/// How much is vested as of `now`: zero during the cliff, the full total at
/// and after the end, and a linear interpolation in between.
pub fn vested_amount(schedule: &VestingSchedule, now: u64) -> i128 {
    if now < cliff_end(schedule) {
        return 0;
    }
    if now >= vest_end(schedule) {
        return schedule.total;
    }

    let duration = schedule.vesting_duration;
    if duration == 0 {
        // A zero-length schedule after a cliff is fully vested the moment the
        // cliff passes. `lock_funds_with_vesting` rejects this configuration,
        // but the formula must not divide by zero if a schedule ever gets here.
        return schedule.total;
    }

    let elapsed = now - cliff_end(schedule);
    (schedule.total * elapsed) / duration
}

/// The amount still claimable right now.
///
/// # Errors
/// [`ContractError::NoVestingSchedule`] if the session has no schedule, which
/// is a different answer from "zero is claimable".
pub fn claimable(env: &Env, session_id: &Bytes) -> Result<i128, ContractError> {
    let schedule = get_schedule(env, session_id).ok_or(ContractError::NoVestingSchedule)?;
    Ok(vested_amount(&schedule, env.ledger().sequence()) - schedule.claimed)
}

/// The part of the escrow that has not vested yet.
///
/// This is the amount at risk in a dispute: it is what the buyer gets back if
/// the session goes sideways before the seller has earned it.
pub fn unvested_amount(schedule: &VestingSchedule, now: u64) -> i128 {
    schedule.total - vested_amount(schedule, now)
}

/// Escrow `amount` between `buyer` and `seller` with a linear release
/// schedule attached.
///
/// The escrow itself is an ordinary `Locked` session; the only difference is
/// that this one also carries a [`VestingSchedule`], which
/// [`claim_vested`] draws down and [`on_dispute`] can unwind.
///
/// # Errors
/// - [`ContractError::InvalidVestingSchedule`] if `vesting_duration` is zero
///   or `cliff_ledgers` exceeds it. A zero duration has no slope to vest
///   along, and a cliff longer than the duration would leave the schedule
///   unable to reach full release at all; both are configuration mistakes
///   better caught now than at claim time.
/// - [`ContractError::InvalidAmount`] / [`ContractError::DuplicateSessionId`] —
///   as for a normal lock.
///
/// # Events
/// Emits `VestingCreated` (see [`events::emit_vesting_created`]).
pub fn lock_funds_with_vesting(
    env: &Env,
    session_id: Bytes,
    buyer: Address,
    seller: Address,
    amount: i128,
    cliff_ledgers: u64,
    vesting_duration: u64,
) -> Result<(), ContractError> {
    // Validated before the lock, not after: a rejected schedule must not leave
    // a funded session behind that nothing can ever claim from.
    if vesting_duration == 0 || cliff_ledgers > vesting_duration {
        return Err(ContractError::InvalidVestingSchedule);
    }

    session::lock_funds(env, session_id.clone(), buyer, seller, amount);

    let schedule = VestingSchedule {
        total: amount,
        claimed: 0,
        start_ledger: env.ledger().sequence(),
        cliff_ledgers,
        vesting_duration,
        buyer_recovered: false,
        buyer_recovery_amount: 0,
    };
    save_schedule(env, session_id.clone(), &schedule);

    events::emit_vesting_created(
        env,
        &session_id,
        &schedule.total,
        schedule.cliff_ledgers,
        schedule.vesting_duration,
        schedule.start_ledger,
    );

    Ok(())
}

fn save_schedule(env: &Env, session_id: Bytes, schedule: &VestingSchedule) {
    env.storage()
        .persistent()
        .set(&VestingKey::Schedule(session_id), schedule);
}

/// Claim everything vested so far on `session_id`.
///
/// Claims are all-or-nothing per call rather than a caller-chosen amount: the
/// only thing a caller can vary is *when*, and letting them pick a partial
/// amount would only add a way to make a mistake while removing nothing.
///
/// # Errors
/// - [`ContractError::NoVestingSchedule`] if the session has no schedule.
/// - [`ContractError::NotSeller`] if `caller` is not the session's seller.
/// - [`ContractError::NothingToClaim`] if the cliff has not passed, or
///   everything vested has already been claimed.
/// - [`ContractError::SessionNotSettled`] if the session is `Refunded` or
///   `Resolved`.
/// - [`ContractError::SessionInDispute`] if a dispute has already unwound the
///   schedule.
///
/// # Events
/// Emits `VestingClaimed` (see [`events::emit_vesting_claimed`]).
pub fn claim_vested(
    env: &Env,
    session_id: Bytes,
    caller: Address,
) -> Result<(), ContractError> {
    let s = session::try_get_session(env, &session_id).ok_or(ContractError::SessionNotFound)?;
    let mut schedule = get_schedule(env, &session_id).ok_or(ContractError::NoVestingSchedule)?;

    if caller != s.seller {
        return Err(ContractError::NotSeller);
    }
    caller.require_auth();

    if schedule.buyer_recovered {
        return Err(ContractError::SessionInDispute);
    }
    if matches!(
        s.status,
        session::SessionStatus::Refunded | session::SessionStatus::Resolved
    ) {
        return Err(ContractError::SessionNotSettled);
    }

    let claimable = vested_amount(&schedule, env.ledger().sequence()) - schedule.claimed;
    if claimable <= 0 {
        return Err(ContractError::NothingToClaim);
    }

    schedule.claimed += claimable;
    save_schedule(env, session_id.clone(), &schedule);

    events::emit_vesting_claimed(
        env,
        &session_id,
        &s.seller,
        claimable,
        schedule.claimed,
        schedule.total,
    );

    Ok(())
}

/// Return the unvested remainder to the buyer because the session was
/// disputed.
///
/// Called by the dispute flow when a dispute opens. Everything the seller has
/// not yet earned — which during the cliff is the whole amount — is recorded
/// as owed back to the buyer, and the schedule latches shut so a later claim
/// cannot also take it. A disputed session is not one a schedule recovers
/// from; resolving it is an admin decision made on the whole amount.
///
/// A session with no schedule, a fully-vested schedule, and an already-unwound
/// schedule are all no-ops. This runs on the dispute path, which has to keep
/// working for the overwhelming majority of sessions that never asked to be
/// vested.
///
/// # Events
/// Emits `UnvestedRefunded` (see [`events::emit_unvested_refunded`]) when
/// there is an unvested remainder to return.
pub fn on_dispute(env: &Env, session_id: Bytes) {
    let mut schedule = match get_schedule(env, &session_id) {
        Some(schedule) => schedule,
        None => return,
    };

    if schedule.buyer_recovered {
        return;
    }

    let unvested = unvested_amount(&schedule, env.ledger().sequence());
    if unvested <= 0 {
        return;
    }

    schedule.buyer_recovered = true;
    schedule.buyer_recovery_amount = unvested;
    save_schedule(env, session_id.clone(), &schedule);

    events::emit_unvested_refunded(env, &session_id, unvested, schedule.claimed);
}
