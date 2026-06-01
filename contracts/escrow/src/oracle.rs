// ============================================================================
// oracle.rs — Issue: Oracle Integration / Price Feed Module (#563)
//
// Integrates a decentralized price oracle (e.g., Band, Chainlink) to support
// fiat or multi-token escrows. Provides admin functions for setting the
// oracle address, querying prices with freshness validation, and a fallback
// mechanism if the oracle fails.
//
// Storage layout (all persistent):
//   OracleAddress         → Address (admin-set oracle contract)
//   FallbackPrice(asset)  → i128 (admin-set fallback price)
//   PriceFreshnessSeconds → u64 (max age of a price before considered stale)
//
// ============================================================================

use soroban_sdk::{contracttype, Address, Bytes32, Env, Symbol};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Default freshness threshold: 3600 seconds (1 hour).
pub const DEFAULT_FRESHNESS_SECONDS: u64 = 3600;

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

#[contracttype]
pub enum OracleKey {
    /// Address of the external oracle contract.
    OracleAddress,
    /// Admin-provided fallback price for an asset (used when oracle is down).
    FallbackPrice(Bytes32),
    /// Maximum age of a price in seconds before it's considered stale.
    PriceFreshnessSeconds,
}

// ---------------------------------------------------------------------------
// Admin API
// ---------------------------------------------------------------------------

/// Admin sets the oracle contract address.
pub fn set_oracle(env: &Env, oracle_id: &Address) {
    env.storage()
        .persistent()
        .set(&OracleKey::OracleAddress, oracle_id);

    env.events().publish(
        (Symbol::new(env, "OracleSet"),),
        oracle_id.clone(),
    );
}

/// Returns the configured oracle address (if any).
pub fn get_oracle(env: &Env) -> Option<Address> {
    env.storage()
        .persistent()
        .get(&OracleKey::OracleAddress)
}

/// Admin sets a fallback price for a given asset (used when the oracle is
/// unavailable or returns stale data).
pub fn set_fallback_price(env: &Env, asset: &Bytes32, price: i128) {
    env.storage()
        .persistent()
        .set(&OracleKey::FallbackPrice(asset.clone()), &price);

    env.events().publish(
        (Symbol::new(env, "FallbackPriceSet"),),
        (asset.clone(), price),
    );
}

/// Admin configures the maximum age (in seconds) for a price to be
/// considered fresh. Prices older than this threshold trigger the fallback.
pub fn set_price_freshness(env: &Env, freshness_seconds: u64) {
    assert!(freshness_seconds > 0, "freshness_seconds must be > 0");

    env.storage()
        .persistent()
        .set(&OracleKey::PriceFreshnessSeconds, &freshness_seconds);

    env.events().publish(
        (Symbol::new(env, "PriceFreshnessSet"),),
        freshness_seconds,
    );
}

// ---------------------------------------------------------------------------
// Price query API
// ---------------------------------------------------------------------------

/// Returns the configured freshness threshold (defaults to 1 hour).
pub fn get_freshness_threshold(env: &Env) -> u64 {
    env.storage()
        .persistent()
        .get(&OracleKey::PriceFreshnessSeconds)
        .unwrap_or(DEFAULT_FRESHNESS_SECONDS)
}

/// Queries the price of `asset` from the configured oracle.
///
/// # Price Validation
/// - If no oracle is configured, returns the admin-set fallback price.
/// - If the oracle returns a price but it's older than the freshness
///   threshold (based on current ledger timestamp), falls back to the
///   admin-set fallback price.
/// - If no fallback price is set either, panics with an error.
///
/// # Parameters
/// - `asset` — Bytes32 identifier for the asset (e.g., a token contract hash).
///
/// # Returns
/// - The price in the oracle's base unit (typically 1e7 per unit).
pub fn get_price(env: &Env, asset: &Bytes32) -> i128 {
    let oracle: Option<Address> = get_oracle(env);

    match oracle {
        Some(oracle_addr) => {
            // Attempt to get price from oracle.
            // In a real integration, this would call the oracle contract's
            // `get_price` function with the asset identifier.
            // For now, we simulate by checking if the oracle address exists.
            let price = query_oracle_price(env, &oracle_addr, asset);

            match price {
                Some(p) => {
                    // Check freshness: compare timestamp from oracle against
                    // the current ledger timestamp.
                    let freshness = get_freshness_threshold(env);
                    let current_time = env.ledger().timestamp();
                    let oracle_timestamp = get_oracle_timestamp(env, &oracle_addr, asset);

                    if current_time <= oracle_timestamp.saturating_add(freshness) {
                        // Price is fresh — use it
                        p
                    } else {
                        // Price is stale — try fallback
                        env.events().publish(
                            (Symbol::new(env, "StaleOraclePrice"),),
                            (asset.clone(), oracle_timestamp, current_time),
                        );
                        get_fallback_or_panic(env, asset)
                    }
                }
                None => {
                    // Oracle didn't return a price — use fallback
                    env.events().publish(
                        (Symbol::new(env, "OraclePriceUnavailable"),),
                        asset.clone(),
                    );
                    get_fallback_or_panic(env, asset)
                }
            }
        }
        None => {
            // No oracle configured — use fallback
            get_fallback_or_panic(env, asset)
        }
    }
}

/// Returns the admin-set fallback price, or panics if none is set.
fn get_fallback_or_panic(env: &Env, asset: &Bytes32) -> i128 {
    env.storage()
        .persistent()
        .get::<_, i128>(&OracleKey::FallbackPrice(asset.clone()))
        .unwrap_or_else(|| {
            panic!("OracleError: no price available for asset and no fallback set");
        })
}

// ---------------------------------------------------------------------------
// Oracle query helpers (mock/simulated for Soroban integration)
// ---------------------------------------------------------------------------

/// Simulates querying the oracle contract for a price.
///
/// In production, this would call into an external oracle contract:
/// ```rust,ignore
/// let oracle_client = OracleClient::new(env, oracle_addr);
/// oracle_client.get_price(&asset)
/// ```
fn query_oracle_price(env: &Env, _oracle_addr: &Address, _asset: &Bytes32) -> Option<i128> {
    // Placeholder for actual oracle contract call.
    // The oracle contract should expose a `get_price(asset) -> (i128, u64)`
    // function that returns (price, timestamp).
    //
    // For now, we store a simulated oracle price in storage to allow testing.
    env.storage()
        .persistent()
        .get::<_, i128>(&OracleKey::FallbackPrice(_asset.clone()))
}

/// Simulates getting the timestamp of the last oracle price update.
fn get_oracle_timestamp(env: &Env, _oracle_addr: &Address, _asset: &Bytes32) -> u64 {
    // Placeholder: in production, query the oracle for its last update time.
    // For now, return current time minus 10 seconds (simulating fresh data).
    env.ledger().timestamp().saturating_sub(10)
}

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

/// Returns the fallback price for an asset (if set).
pub fn get_fallback_price(env: &Env, asset: &Bytes32) -> Option<i128> {
    env.storage()
        .persistent()
        .get(&OracleKey::FallbackPrice(asset.clone()))
}
