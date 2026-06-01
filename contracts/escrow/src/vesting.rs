// ============================================================================
// vesting.rs — Issue: Time-Locked Release Module (#567)
//
// Adds an optional time-locked release mechanism for sellers supporting both
// linear and cliff vesting. Funds are released gradually over time via a
// `claim_vested` function. Unvested funds return to the buyer if the session
// is disputed.
//
// Storage layout:
//   VestingSchedule(session_id) → VestingSchedule struct
//
// ============================================================================

use soroban_sdk::{contracttype, token, Address, Bytes32, Env, Symbol, Vec};

use crate::{reentrancy, EscrowError};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/// Type of vesting schedule.
#[contracttype]
#[derive(Clone, PartialEq, Debug)]
pub enum VestingType {
    /// Linear vesting: funds release continuously over the vesting period.
    Linear,
    /// Cliff vesting: funds release in full after a cliff period.
    Cliff,
}

/// A vesting schedule for a seller's escrowed funds.
#[contracttype]
#[derive(Clone, Debug)]
pub struct VestingSchedule {
    /// Buyer's address.
    pub buyer: Address,
    /// Seller's address.
    pub seller: Address,
    /// Token contract address for the escrowed asset.
    pub token_id: Address,
    /// Total amount being vested.
    pub total_amount: i128,
    /// Amount already claimed by the seller.
    pub claimed_amount: i128,
    /// Ledger timestamp when vesting started.
    pub start_time: u64,
    /// Total vesting duration in seconds.
    pub duration_seconds: u64,
    /// Cliff duration in seconds (0 = no cliff, funds release linearly from start).
    pub cliff_seconds: u64,
    /// Type of vesting schedule.
    pub vesting_type: VestingType,
    /// Whether the schedule has been terminated (e.g., due to dispute).
    pub terminated: bool,
}

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

#[contracttype]
pub enum VestingKey {
    /// Stores VestingSchedule for a session.
    Schedule(Bytes32),
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Lock funds with an optional time-locked vesting schedule for the seller.
///
/// # Parameters
/// - `session_id` — unique identifier for the session
/// - `buyer` — address funding the escrow
/// - `seller` — address that will receive vested funds
/// - `total_amount` — total tokens to lock
/// - `token_id` — SEP-41 token contract address
/// - `vesting_type` — Linear or Cliff vesting
/// - `duration_seconds` — total vesting duration in seconds
/// - `cliff_seconds` — cliff period in seconds (0 = no cliff)
///
/// # Conditions
/// - cliff_seconds must be <= duration_seconds
/// - Amount must be positive
pub fn lock_funds_with_vesting(
    env: &Env,
    session_id: &Bytes32,
    buyer: &Address,
    seller: &Address,
    total_amount: i128,
    token_id: &Address,
    vesting_type: VestingType,
    duration_seconds: u64,
    cliff_seconds: u64,
) -> Result<(), EscrowError> {
    buyer.require_auth();

    if total_amount <= 0 {
        return Err(EscrowError::InvalidAmount);
    }
    if cliff_seconds > duration_seconds {
        return Err(EscrowError::InvalidState);
    }
    if env.storage().persistent().has(&VestingKey::Schedule(session_id.clone())) {
        return Err(EscrowError::DuplicateSessionId);
    }

    // Transfer total amount from buyer to contract
    reentrancy::guarded(env, || {
        token::Client::new(env, token_id).transfer(
            buyer,
            &env.current_contract_address(),
            &total_amount,
        );
    });

    // Create vesting schedule
    let schedule = VestingSchedule {
        buyer: buyer.clone(),
        seller: seller.clone(),
        token_id: token_id.clone(),
        total_amount,
        claimed_amount: 0,
        start_time: env.ledger().timestamp(),
        duration_seconds,
        cliff_seconds,
        vesting_type,
        terminated: false,
    };

    env.storage()
        .persistent()
        .set(&VestingKey::Schedule(session_id.clone()), &schedule);

    env.events().publish(
        (Symbol::new(env, "VestingCreated"), session_id.clone()),
        (
            buyer.clone(),
            seller.clone(),
            total_amount,
            vesting_type,
            duration_seconds,
            cliff_seconds,
        ),
    );

    Ok(())
}

/// Calculate the vested amount for a schedule at the current timestamp.
///
/// Returns the total amount that has vested so far (not subtracting claimed).
fn calculate_vested_amount(schedule: &VestingSchedule, current_time: u64) -> i128 {
    if schedule.terminated {
        return schedule.claimed_amount;
    }

    let elapsed = current_time.saturating_sub(schedule.start_time);

    if elapsed >= schedule.duration_seconds {
        // Fully vested
        return schedule.total_amount;
    }

    match schedule.vesting_type {
        VestingType::Cliff => {
            // Cliff vesting: nothing until cliff, then full amount at end
            if elapsed < schedule.cliff_seconds {
                0
            } else {
                // After cliff, linear vesting to end
                let post_cliff_elapsed = elapsed - schedule.cliff_seconds;
                let post_cliff_duration = schedule.duration_seconds - schedule.cliff_seconds;
                if post_cliff_duration == 0 {
                    schedule.total_amount
                } else {
                    schedule.total_amount * post_cliff_elapsed as i128 / post_cliff_duration as i128
                }
            }
        }
        VestingType::Linear => {
            // Linear vesting from start time
            schedule.total_amount * elapsed as i128 / schedule.duration_seconds as i128
        }
    }
}

/// Seller claims the vested portion of their escrowed funds.
///
/// Transfers the newly vested amount (since last claim) to the seller.
///
/// # Parameters
/// - `session_id` — identifies the vesting schedule
/// - `seller` — must match the schedule's seller
pub fn claim_vested(
    env: &Env,
    session_id: &Bytes32,
    seller: &Address,
) -> Result<(), EscrowError> {
    seller.require_auth();

    let mut schedule: VestingSchedule = env
        .storage()
        .persistent()
        .get(&VestingKey::Schedule(session_id.clone()))
        .ok_or(EscrowError::SessionNotFound)?;

    if seller != &schedule.seller {
        return Err(EscrowError::Unauthorized);
    }

    if schedule.terminated {
        return Err(EscrowError::InvalidState);
    }

    let current_time = env.ledger().timestamp();
    let vested_total = calculate_vested_amount(&schedule, current_time);
    let claimable = vested_total.saturating_sub(schedule.claimed_amount);

    if claimable <= 0 {
        // Nothing to claim
        return Ok(());
    }

    // Transfer claimable amount to seller
    reentrancy::guarded(env, || {
        token::Client::new(env, &schedule.token_id).transfer(
            &env.current_contract_address(),
            seller,
            &claimable,
        );
    });

    schedule.claimed_amount += claimable;
    env.storage()
        .persistent()
        .set(&VestingKey::Schedule(session_id.clone()), &schedule);

    env.events().publish(
        (Symbol::new(env, "VestingClaimed"), session_id.clone()),
        (seller.clone(), claimable, schedule.claimed_amount),
    );

    Ok(())
}

/// Terminate a vesting schedule (e.g., due to dispute resolution).
/// Returns unvested funds to the buyer.
pub fn terminate_vesting(
    env: &Env,
    session_id: &Bytes32,
) -> Result<(), EscrowError> {
    let mut schedule: VestingSchedule = env
        .storage()
        .persistent()
        .get(&VestingKey::Schedule(session_id.clone()))
        .ok_or(EscrowError::SessionNotFound)?;

    if schedule.terminated {
        return Err(EscrowError::InvalidState);
    }

    let current_time = env.ledger().timestamp();
    let vested_total = calculate_vested_amount(&schedule, current_time);
    let unvested = schedule.total_amount.saturating_sub(vested_total);
    let already_claimed = schedule.claimed_amount;

    schedule.terminated = true;
    env.storage()
        .persistent()
        .set(&VestingKey::Schedule(session_id.clone()), &schedule);

    // Return unvested funds to buyer
    if unvested > 0 {
        reentrancy::guarded(env, || {
            token::Client::new(env, &schedule.token_id).transfer(
                &env.current_contract_address(),
                &schedule.buyer,
                &unvested,
            );
        });
    }

    env.events().publish(
        (Symbol::new(env, "VestingTerminated"), session_id.clone()),
        (
            schedule.buyer.clone(),
            schedule.seller.clone(),
            already_claimed,
            unvested,
        ),
    );

    Ok(())
}

/// Returns the vesting schedule for a session.
pub fn get_vesting_schedule(env: &Env, session_id: &Bytes32) -> Option<VestingSchedule> {
    env.storage()
        .persistent()
        .get(&VestingKey::Schedule(session_id.clone()))
}

/// Returns the currently claimable amount for a vested session.
pub fn get_claimable_amount(env: &Env, session_id: &Bytes32) -> Result<i128, EscrowError> {
    let schedule: VestingSchedule = env
        .storage()
        .persistent()
        .get(&VestingKey::Schedule(session_id.clone()))
        .ok_or(EscrowError::SessionNotFound)?;

    if schedule.terminated {
        return Ok(0);
    }

    let current_time = env.ledger().timestamp();
    let vested = calculate_vested_amount(&schedule, current_time);
    Ok(vested.saturating_sub(schedule.claimed_amount))
}
