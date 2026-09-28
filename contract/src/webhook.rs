use soroban_sdk::{contracttype, symbol_short, Address, Bytes, Env, String};

use crate::admin::require_admin;
use crate::errors::ContractError;
use crate::session;

/// Off-chain event relay configuration.
///
/// The contract never makes an HTTP request. It cannot: a Soroban contract has
/// no network access, and giving it one would make settlement depend on a
/// third party's uptime. What the contract *can* do — and what actually
/// matters — is make sure the events a relayer needs are complete, stable and
/// cheaply readable off-chain.
///
/// So this module has two halves, and the split is deliberate:
///
/// * **On-chain (here):** the admin points the deployment at a relay endpoint
///   with [`set_webhook`], and [`build_payload`] assembles a relayer-ready
///   record for any session — session ID, event type, and the state needed to
///   act on it — so an indexer never has to re-derive it from a dozen
///   differently-shaped events.
/// * **Off-chain (not here):** a relayer process reads
///   `env.events()` / the RPC event stream, posts each payload to the
///   configured URL, and retries. That is an ordinary web service and belongs
///   in its own repository, not in a contract that cannot make the request
///   anyway.
///
/// The endpoint is configuration, not a delivery mechanism: nothing here
/// depends on it being reachable, and clearing it disables relaying without
/// affecting a single escrow.
///
/// Storage keys owned by this module.
#[contracttype]
#[derive(Clone)]
pub enum WebhookKey {
    /// The relay endpoint configured by the admin.
    Url,
}

/// Bound on the endpoint length, for the same reason metadata URIs are
/// bounded: a locator, not a payload.
const MAX_URL_LENGTH: u32 = 256;

/// Required URL scheme.
///
/// Enforced because an endpoint the relayer will silently refuse to call is
/// worse than one rejected at configuration time: the admin believes relaying
/// is on when it never was.
const REQUIRED_SCHEME: &str = "https://";

/// A relayer-ready view of a session event.
///
/// Deliberately flat and self-contained. A relayer should be able to act on
/// this record without holding session state of its own, which is what makes
/// the relay survive an indexer restart.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct RelayPayload {
    /// The session the event concerns.
    pub session_id: Bytes,
    /// What happened, e.g. `"funds_locked"`, `"session_approved"`.
    pub event_type: String,
    /// The session's status at the time the payload was built.
    pub status: String,
    /// The escrowed amount.
    pub amount: i128,
    /// The session's buyer, so a relayer can address them.
    pub buyer: Address,
    /// The session's seller.
    pub seller: Address,
    /// The session's metadata URI, if one has been set. This is the hook that
    /// lets a relayed notification link straight to the off-chain document.
    pub metadata_uri: Option<String>,
    /// Ledger sequence the payload was built at.
    pub occurred_at: u64,
}

/// Point the deployment at a relay endpoint (admin only).
///
/// # Errors
/// - [`ContractError::NotInitialized`] if the contract is not initialized.
/// - [`ContractError::NotAdmin`] if `caller` is not the admin.
/// - [`ContractError::InvalidWebhookUrl`] if `url` is empty, over
///   [`MAX_URL_LENGTH`], or does not start with `https://`.
///
/// # Events
/// Emits `WebhookSet` with the new URL.
pub fn set_webhook(env: &Env, caller: Address, url: String) -> Result<(), ContractError> {
    require_admin(env, &caller)?;

    if url.len() == 0 || url.len() > MAX_URL_LENGTH {
        return Err(ContractError::InvalidWebhookUrl);
    }
    if !url.starts_with(REQUIRED_SCHEME) {
        return Err(ContractError::InvalidWebhookUrl);
    }

    env.storage().instance().set(&WebhookKey::Url, &url);
    env.events().publish((symbol_short!("wh_set"),), url);

    Ok(())
}

/// Stop relaying to any endpoint (admin only).
///
/// Escrows are unaffected: this only withdraws the relayer's destination.
///
/// # Errors
/// - [`ContractError::NotInitialized`] if the contract is not initialized.
/// - [`ContractError::NotAdmin`] if `caller` is not the admin.
///
/// # Events
/// Emits `WebhookCleared`.
pub fn clear_webhook(env: &Env, caller: Address) -> Result<(), ContractError> {
    require_admin(env, &caller)?;

    env.storage().instance().remove(&WebhookKey::Url);
    env.events().publish((symbol_short!("wh_clr"),), ());

    Ok(())
}

/// The configured relay endpoint, if any.
pub fn get_webhook(env: &Env) -> Option<String> {
    env.storage().instance().get(&WebhookKey::Url)
}

/// Whether relaying is configured.
pub fn is_webhook_enabled(env: &Env) -> bool {
    get_webhook(env).is_some()
}

/// Assemble the relayer-ready payload for `session_id`.
///
/// Returns `None` for a session that does not exist, so a relayer sweeping
/// events can call this for every event it sees without special-casing the
/// ones that arrive before — or after — the session was written.
///
/// # Errors
/// None.
pub fn build_payload(env: &Env, session_id: Bytes, event_type: String) -> Option<RelayPayload> {
    if !session::session_exists(env, &session_id) {
        return None;
    }
    let s = session::get(env, session_id.clone());
    let metadata_uri = crate::metadata::get_session_metadata(env, session_id.clone());

    Some(RelayPayload {
        session_id,
        event_type,
        status: status_label(env, &s.status),
        amount: s.amount,
        buyer: s.buyer,
        seller: s.seller,
        metadata_uri,
        occurred_at: env.ledger().sequence(),
    })
}

/// The wire name of a session status.
///
/// Statuses are an enum on-chain, but a webhook body is JSON, and an integer
/// code in a notification is unreadable to whoever receives it. The mapping is
/// one-to-one, so nothing is lost.
fn status_label(env: &Env, status: &session::SessionStatus) -> String {
    let label = match status {
        session::SessionStatus::Locked => "locked",
        session::SessionStatus::Completed => "completed",
        session::SessionStatus::Disputed => "disputed",
        session::SessionStatus::Approved => "approved",
        session::SessionStatus::Refunded => "refunded",
        session::SessionStatus::Resolved => "resolved",
    };
    String::from_str(env, label)
}
