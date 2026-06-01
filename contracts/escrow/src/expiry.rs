// ============================================================================
// expiry.rs — Issue: Session Expiry / Auto-Cancellation
//
// Prevents sessions from staying in `Locked` state indefinitely by enforcing
// a maximum lifetime. After `max_session_duration_ledgers` ledgers have
// passed since `lock_funds`, anyone can call `cancel_expired_session` to
// refund the buyer fully (no fee deducted).
//
// Storage layout (all persistent):
//   ExpiryConfig          → ExpiryConfig struct (admin-set)
//   SessionExpiry(id)     → u32 ledger sequence at which session expires
//
// Integration with main lib.rs:
//   1. `lock_funds` must call `expiry::record_expiry(&env, &session_id)` after
//      creating the session.
//   2. `approve_session` / `complete_session` must call
//      `expiry::assert_not_expired(&env, &session_id)` before proceeding.
//   3. Expose `cancel_expired_session` as a top-level entry point.
// ============================================================================

use soroban_sdk::{contracttype, token, Address, BytesN, Env, Symbol};

use crate::{reentrancy, Bytes32, SessionData, SkillSyncEscrow, SkillSyncKey, Status};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/// Admin-configurable expiry parameters.
#[contracttype]
#[derive(Clone, Debug)]
pub struct ExpiryConfig {
    /// Maximum ledgers a session may stay in `Locked` state.
    /// Default: 30_000 ledgers ≈ 7 days (at ~20 seconds/ledger on Stellar mainnet).
    pub max_session_duration_ledgers: u32,
}

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

#[contracttype]
pub enum ExpiryKey {
    /// Global expiry configuration.
    Config,
    /// Stores the ledger sequence at which `session_id` expires.
    SessionExpiry(Bytes32),
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Default maximum session lifetime in ledgers (~7 days on Stellar mainnet).
pub const DEFAULT_MAX_SESSION_DURATION: u32 = 30_000;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

fn get_config(env: &Env) -> ExpiryConfig {
    env.storage()
        .persistent()
        .get(&ExpiryKey::Config)
        .unwrap_or(ExpiryConfig {
            max_session_duration_ledgers: DEFAULT_MAX_SESSION_DURATION,
        })
}

// ---------------------------------------------------------------------------
// Admin API
// ---------------------------------------------------------------------------

/// Admin configures the maximum session lifetime.
///
/// # Parameters
/// - `max_duration` — ledgers before a Locked session auto-expires (must be > 0)
pub fn set_max_session_duration(env: &Env, max_duration: u32) {
    assert!(max_duration > 0, "max_duration must be > 0");

    env.storage().persistent().set(
        &ExpiryKey::Config,
        &ExpiryConfig {
            max_session_duration_ledgers: max_duration,
        },
    );

    env.events().publish(
        (Symbol::new(env, "MaxSessionDurationSet"),),
        max_duration,
    );
}

/// Returns the current expiry configuration.
pub fn get_expiry_config(env: &Env) -> ExpiryConfig {
    get_config(env)
}

// ---------------------------------------------------------------------------
// Lifecycle hooks (called from main lib.rs)
// ---------------------------------------------------------------------------

/// Record the expiry ledger for a newly locked session.
///
/// Must be called inside `lock_funds` immediately after the session is saved.
/// Stores `expires_at = current_ledger + max_session_duration_ledgers`.
pub fn record_expiry(env: &Env, session_id: &Bytes32) {
    let config = get_config(env);
    let expires_at = env
        .ledger()
        .sequence()
        .saturating_add(config.max_session_duration_ledgers);

    env.storage()
        .persistent()
        .set(&ExpiryKey::SessionExpiry(session_id.clone()), &expires_at);
}

/// Returns the ledger at which `session_id` expires (0 if not recorded).
pub fn get_expiry_ledger(env: &Env, session_id: &Bytes32) -> u32 {
    env.storage()
        .persistent()
        .get(&ExpiryKey::SessionExpiry(session_id.clone()))
        .unwrap_or(0)
}

/// Returns `true` if the session has passed its expiry ledger.
pub fn is_expired(env: &Env, session_id: &Bytes32) -> bool {
    let expires_at = get_expiry_ledger(env, session_id);
    if expires_at == 0 {
        return false; // no expiry recorded — treat as non-expiring
    }
    env.ledger().sequence() > expires_at
}

/// Assert that the session has NOT expired.
///
/// Call this at the top of `approve_session`, `complete_session`, and any
/// other state-advancing function that should be blocked post-expiry.
/// Panics with `SessionExpired` if the session is past its expiry ledger.
pub fn assert_not_expired(env: &Env, session_id: &Bytes32) {
    if is_expired(env, session_id) {
        panic!(
            "SessionExpired: session {} has passed its expiry ledger",
            env.ledger().sequence()
        );
    }
}

// ---------------------------------------------------------------------------
// Public: cancel_expired_session
// ---------------------------------------------------------------------------

/// Anyone can call this to cancel and refund a session that has exceeded its
/// maximum lifetime while still in `Locked` state.
///
/// Behaviour:
///   • Session must be in `Locked` state (completed/approved/etc. are not cancelable).
///   • Current ledger must be > expires_at.
///   • Full amount is refunded to buyer; no platform fee is deducted.
///   • Emits `SessionExpiredAndCancelled` event.
///   • Transfer is reentrancy-guarded.
///
/// This function reads session data directly from the persistent store that
/// `SkillSyncEscrow` writes to (same `SkillSyncKey::Session` keys), so no
/// cross-contract call is needed.
pub fn cancel_expired_session(env: Env, session_id: Bytes32, token_id: Address) {
    // Retrieve session from the main SkillSyncEscrow persistent storage
    let mut session: SessionData = env
        .storage()
        .persistent()
        .get(&SkillSyncKey::Session(session_id.clone()))
        .expect("session not found");

    // Must be in Locked state
    assert!(
        session.status == Status::Locked,
        "InvalidState: only Locked sessions can be expired-cancelled"
    );

    // Must be past expiry
    let expires_at = get_expiry_ledger(&env, &session_id);
    assert!(expires_at > 0, "no expiry recorded for this session");
    assert!(
        env.ledger().sequence() > expires_at,
        "SessionNotYetExpired: expiry ledger not reached"
    );

    let amount = session.amount;
    let buyer = session.buyer.clone();

    // Refund buyer — reentrancy guarded
    reentrancy::guarded(&env, || {
        token::Client::new(&env, &token_id).transfer(
            &env.current_contract_address(),
            &buyer,
            &amount,
        );
    });

    // Update session state to Refunded
    session.status = Status::Refunded;
    env.storage()
        .persistent()
        .set(&SkillSyncKey::Session(session_id.clone()), &session);

    // Emit event
    env.events().publish(
        (
            Symbol::new(&env, "SessionExpiredAndCancelled"),
            session_id.clone(),
        ),
        (buyer, amount, expires_at, env.ledger().sequence()),
    );
}