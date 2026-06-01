// ============================================================================
// webhook.rs — Issue: Webhook / Event Relay Module (#566)
//
// Enables off-chain event notification by allowing an admin to set a webhook
// URL. Contract events are emitted with structured payloads that an off-chain
// relayer can pick up and forward as HTTP webhooks.
//
// Storage layout (all persistent):
//   WebhookUrl → String (admin-set HTTPS endpoint)
//
// Events (emitted for off-chain indexers):
//   WebhookUrlSet(url) — emitted when admin updates the webhook URL
//   WebhookEvent(session_id, event_type, data) — emitted for each event
//
// ============================================================================

use soroban_sdk::{contracttype, Bytes32, Env, String, Symbol};

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

#[contracttype]
pub enum WebhookKey {
    /// Admin-configured webhook URL for event relay.
    WebhookUrl,
}

// ---------------------------------------------------------------------------
// Admin API
// ---------------------------------------------------------------------------

/// Admin sets the webhook URL for off-chain event relay.
///
/// The URL should point to an HTTPS endpoint that can receive POST requests
/// with structured event payloads.
pub fn set_webhook(env: &Env, url: String) {
    env.storage()
        .persistent()
        .set(&WebhookKey::WebhookUrl, &url);

    env.events().publish(
        (Symbol::new(env, "WebhookUrlSet"),),
        url,
    );
}

/// Returns the configured webhook URL, if any.
pub fn get_webhook(env: &Env) -> Option<String> {
    env.storage()
        .persistent()
        .get(&WebhookKey::WebhookUrl)
}

// ---------------------------------------------------------------------------
// Event relay helpers
// ---------------------------------------------------------------------------

/// Emit a structured webhook event for a session.
///
/// This function emits a contract event that an off-chain relayer or indexer
/// can subscribe to. The event includes:
/// - `session_id` — the affected session
/// - `event_type` — a string identifier for the event (e.g., "FundsLocked",
///                  "SessionCompleted", "SessionApproved")
/// - `event_data` — additional context as a string (e.g., JSON blob)
///
/// The relayer reads these events and forwards them as HTTP POST requests
/// to the configured webhook URL.
pub fn emit_webhook_event(
    env: &Env,
    session_id: &Bytes32,
    event_type: &String,
    event_data: &String,
) {
    // Emit a structured event that off-chain indexers can parse
    // The event topics are: ("WebhookEvent", session_id, event_type)
    // The data payload is the event_data string
    env.events().publish(
        (
            Symbol::new(env, "WebhookEvent"),
            session_id.clone(),
            event_type.clone(),
        ),
        event_data.clone(),
    );
}
