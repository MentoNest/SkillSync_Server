// ============================================================================
// metadata.rs — Issue: Metadata Storage Module (#565)
//
// Allows storing off-chain metadata (IPFS hash, JSON) per session.
// Only the buyer or seller of a session can set/update the metadata.
//
// Storage layout (all persistent):
//   SessionMetadata(session_id) → String (metadata URI)
//
// ============================================================================

use soroban_sdk::{contracttype, Address, Bytes32, Env, String, Symbol};

use crate::{SkillSyncEscrow, SkillSyncKey, EscrowError};

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

#[contracttype]
pub enum MetadataKey {
    /// Stores metadata URI string for a session.
    SessionMetadata(Bytes32),
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Sets metadata URI for a session. Only the buyer or seller may call this.
///
/// # Parameters
/// - `session_id` — the session to attach metadata to
/// - `metadata_uri` — the off-chain URI (e.g., IPFS hash or JSON pointer)
///
/// # Errors
/// - `SessionNotFound` if the session does not exist
/// - `Unauthorized` if caller is neither buyer nor seller
pub fn set_session_metadata(
    env: &Env,
    session_id: &Bytes32,
    caller: &Address,
    metadata_uri: String,
) -> Result<(), EscrowError> {
    caller.require_auth();

    // Verify the session exists and caller is buyer or seller
    let session = env
        .storage()
        .persistent()
        .get::<_, crate::SessionData>(&SkillSyncKey::Session(session_id.clone()))
        .ok_or(EscrowError::SessionNotFound)?;

    if caller != &session.buyer && caller != &session.seller {
        return Err(EscrowError::Unauthorized);
    }

    // Store metadata URI
    env.storage()
        .persistent()
        .set(&MetadataKey::SessionMetadata(session_id.clone()), &metadata_uri);

    // Emit MetadataUpdated event
    env.events().publish(
        (Symbol::new(env, "MetadataUpdated"), session_id.clone()),
        (caller.clone(), metadata_uri.clone()),
    );

    Ok(())
}

/// Retrieves metadata URI for a session.
///
/// Returns `None` if no metadata has been set for the session.
pub fn get_session_metadata(env: &Env, session_id: &Bytes32) -> Option<String> {
    env.storage()
        .persistent()
        .get(&MetadataKey::SessionMetadata(session_id.clone()))
}
