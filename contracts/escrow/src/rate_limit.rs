// ============================================================================
// rate_limit.rs — Issue: Rate Limiting / Anti-DoS
//
// Prevents spam or DoS attacks by limiting how many escrow sessions a single
// address can create within a rolling ledger window.
//
// Storage layout (all persistent):
//   RateLimitConfig              → RateLimitConfig struct (admin-set)
//   UserWindow(address)          → UserWindowData struct
//   Whitelist(address)           → bool (true = whitelisted, no limit)
//
// Window semantics:
//   • A "window" is a range of `window_ledgers` ledgers.
//   • The window is identified by: floor(current_ledger / window_ledgers).
//   • When a user's stored window_id differs from the current window_id,
//     their counter resets automatically (no admin action needed).
//   • Whitelisted addresses bypass all checks.
// ============================================================================

use soroban_sdk::{contracttype, Address, Env, Symbol};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/// Admin-configurable rate limit parameters.
#[contracttype]
#[derive(Clone, Debug)]
pub struct RateLimitConfig {
    /// Maximum sessions allowed per address per window.
    pub max_sessions: u32,
    /// Window size in ledger sequences.
    pub window_ledgers: u32,
}

/// Per-user sliding-window counter stored in persistent storage.
#[contracttype]
#[derive(Clone, Debug)]
pub struct UserWindowData {
    /// Identifies which window this counter belongs to.
    /// Computed as: current_ledger / window_ledgers.
    pub window_id: u32,
    /// Number of sessions opened in `window_id`.
    pub count: u32,
}

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

#[contracttype]
pub enum RateLimitKey {
    /// Global rate limit config set by admin.
    Config,
    /// Per-address window counter.
    UserWindow(Address),
    /// Per-address whitelist flag.
    Whitelist(Address),
}

// ---------------------------------------------------------------------------
// Defaults (used when no config has been set)
// ---------------------------------------------------------------------------

const DEFAULT_MAX_SESSIONS: u32 = 10;
const DEFAULT_WINDOW_LEDGERS: u32 = 1_000; // ~1000 ledgers ≈ 83 minutes on Stellar

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

fn get_config(env: &Env) -> RateLimitConfig {
    env.storage()
        .persistent()
        .get(&RateLimitKey::Config)
        .unwrap_or(RateLimitConfig {
            max_sessions: DEFAULT_MAX_SESSIONS,
            window_ledgers: DEFAULT_WINDOW_LEDGERS,
        })
}

/// Compute the current window_id for the given ledger sequence.
fn current_window_id(current_ledger: u32, window_ledgers: u32) -> u32 {
    current_ledger / window_ledgers
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Admin sets the global rate limit.
///
/// # Parameters
/// - `admin`          — must match the admin stored in main escrow contract
/// - `max_sessions`   — max sessions per address per window
/// - `window_ledgers` — window size in ledgers (must be > 0)
pub fn set_rate_limit(env: &Env, max_sessions: u32, window_ledgers: u32) {
    assert!(window_ledgers > 0, "window_ledgers must be > 0");
    assert!(max_sessions > 0, "max_sessions must be > 0");

    let config = RateLimitConfig {
        max_sessions,
        window_ledgers,
    };
    env.storage()
        .persistent()
        .set(&RateLimitKey::Config, &config);

    env.events().publish(
        (Symbol::new(env, "RateLimitUpdated"),),
        (max_sessions, window_ledgers),
    );
}

/// Admin adds an address to the whitelist (bypasses rate limits).
pub fn whitelist_address(env: &Env, address: &Address) {
    env.storage()
        .persistent()
        .set(&RateLimitKey::Whitelist(address.clone()), &true);

    env.events().publish(
        (Symbol::new(env, "AddressWhitelisted"),),
        address.clone(),
    );
}

/// Admin removes an address from the whitelist.
pub fn remove_from_whitelist(env: &Env, address: &Address) {
    env.storage()
        .persistent()
        .remove(&RateLimitKey::Whitelist(address.clone()));

    env.events().publish(
        (Symbol::new(env, "AddressRemovedFromWhitelist"),),
        address.clone(),
    );
}

/// Returns whether an address is whitelisted.
pub fn is_whitelisted(env: &Env, address: &Address) -> bool {
    env.storage()
        .persistent()
        .get(&RateLimitKey::Whitelist(address.clone()))
        .unwrap_or(false)
}

/// Returns the current session count for an address in the active window.
pub fn get_user_session_count(env: &Env, address: &Address) -> u32 {
    let config = get_config(env);
    let current_ledger = env.ledger().sequence();
    let win_id = current_window_id(current_ledger, config.window_ledgers);

    let data: Option<UserWindowData> = env
        .storage()
        .persistent()
        .get(&RateLimitKey::UserWindow(address.clone()));

    match data {
        Some(d) if d.window_id == win_id => d.count,
        _ => 0,
    }
}

/// Check and increment the rate limit counter for `address`.
///
/// - If the address is whitelisted, this is a no-op.
/// - If the address has exceeded the limit, emits a `RateLimitHit` event and
///   panics, preventing the session from being created.
/// - Otherwise, increments the counter and persists it.
///
/// Call this inside `lock_funds` (and `lock_funds_with_milestones`) BEFORE
/// performing any token transfer.
pub fn check_and_increment(env: &Env, address: &Address) {
    // Whitelisted addresses have no rate limit
    if is_whitelisted(env, address) {
        return;
    }

    let config = get_config(env);
    let current_ledger = env.ledger().sequence();
    let win_id = current_window_id(current_ledger, config.window_ledgers);

    let current_data: Option<UserWindowData> = env
        .storage()
        .persistent()
        .get(&RateLimitKey::UserWindow(address.clone()));

    let count = match current_data {
        // Same window — use existing count
        Some(d) if d.window_id == win_id => d.count,
        // Different window (or none) — counter resets to 0
        _ => 0,
    };

    if count >= config.max_sessions {
        // Emit monitoring event before panicking
        env.events().publish(
            (Symbol::new(env, "RateLimitHit"), address.clone()),
            (count, config.max_sessions, win_id),
        );
        panic!(
            "RateLimitExceeded: address has reached {} sessions in this window",
            config.max_sessions
        );
    }

    // Increment and persist
    env.storage().persistent().set(
        &RateLimitKey::UserWindow(address.clone()),
        &UserWindowData {
            window_id: win_id,
            count: count + 1,
        },
    );
}

/// Returns the current rate limit configuration.
pub fn get_rate_limit_config(env: &Env) -> RateLimitConfig {
    get_config(env)
}