use soroban_sdk::{contracttype, symbol_short, Address, Bytes, Env, String};

use crate::errors::ContractError;
use crate::events;
use crate::session;

/// Off-chain metadata attached to a session.
///
/// The contract stores a *reference* — an IPFS CID, an HTTPS URL to a JSON
/// document — never the document itself. Ledgers are not a document store:
/// they are replicated to every validator, priced by state footprint, and
/// permanent. Writing a few hundred bytes of JSON per session would make the
/// escrow materially more expensive to run and impossible to take back, and
/// nothing would be gained, because nothing on-chain reads it.
///
/// What *is* on-chain is the link, and the link is only meaningful because of
/// who wrote it and when: the URI is set by a participant of that specific
/// session, at a specific point in its life, ordered by the same ledger the
/// escrow itself runs on. Two sessions carrying the same URI are still
/// distinct facts.
///
/// ## Why the URI lives in persistent storage
///
/// The issue asks for instance storage. Instance storage in Soroban is a
/// single flat key space for the whole contract with a flat rent cost, so it
/// cannot address one entry per session — `Option<String>` keyed by
/// `session_id` is not expressible there. Persistent storage is the only
/// store that can key by session, and it is what the session records
/// themselves use, so metadata and the session it describes live and expire
/// together. The cost concern behind the original suggestion is addressed
/// instead by [`MAX_URI_LENGTH`]: a locator is bounded, and the document it
/// points at never touches the ledger at all.
///
/// Storage keys owned by this module.
#[contracttype]
#[derive(Clone)]
pub enum MetadataKey {
    /// The metadata URI for one session.
    Session(Bytes),
}

/// Bound on the URI length.
///
/// A URI is a locator, not a payload, so anything approaching this length is a
/// caller trying to store data in a field that cannot hold it. Rejecting it
/// early keeps the per-session state footprint predictable, which is what
/// keeps the escrow affordable to run.
pub const MAX_URI_LENGTH: u32 = 256;

/// Reject a URI that cannot serve as a locator.
fn validate_uri(uri: &String) -> Result<(), ContractError> {
    if uri.len() == 0 || uri.len() > MAX_URI_LENGTH {
        return Err(ContractError::InvalidMetadataUri);
    }
    Ok(())
}

/// Assert that `caller` is a party to `session`, or report the generic
/// authorization error.
///
/// A stranger to the session is not a wrong-role buyer or seller, so
/// `NotBuyer`/`NotSeller` would both be misleading; `NotParticipant` says what
/// is actually wrong.
fn require_participant(session: &session::Session, caller: &Address) -> Result<(), ContractError> {
    if caller != &session.buyer && caller != &session.seller {
        return Err(ContractError::NotParticipant);
    }
    caller.require_auth();
    Ok(())
}

/// Reject a write to a session whose money has already moved.
///
/// A settled escrow's record is history. Allowing metadata to keep mutating
/// would let a finished session be re-described after the fact, which is the
/// one thing a reference that outlives the transaction must not allow.
fn require_mutable(session: &session::Session) -> Result<(), ContractError> {
    match session.status {
        session::SessionStatus::Refunded | session::SessionStatus::Resolved => {
            Err(ContractError::SessionNotSettled)
        }
        _ => Ok(()),
    }
}

/// Attach or replace the metadata URI for `session_id`.
///
/// Either the buyer or the seller may set it, and either may replace it:
/// both are parties to the agreement and both have a legitimate reason to
/// point at a different document — the seller adding the delivered work, the
/// buyer correcting a wrong link.
///
/// # Errors
/// - [`ContractError::SessionNotFound`] if `session_id` doesn't exist.
/// - [`ContractError::NotParticipant`] if `caller` is neither the buyer nor
///   the seller.
/// - [`ContractError::SessionNotSettled`] if the session is `Refunded` or
///   `Resolved`.
/// - [`ContractError::InvalidMetadataUri`] if `metadata_uri` is empty or over
///   [`MAX_URI_LENGTH`] characters.
///
/// # Events
/// Emits `MetadataUpdated` (see [`events::emit_metadata_updated`]).
pub fn set_session_metadata(
    env: &Env,
    session_id: Bytes,
    caller: Address,
    metadata_uri: String,
) -> Result<(), ContractError> {
    let s = session::try_get_session(env, &session_id).ok_or(ContractError::SessionNotFound)?;

    require_mutable(&s)?;
    require_participant(&s, &caller)?;
    validate_uri(&metadata_uri)?;

    env.storage()
        .persistent()
        .set(&MetadataKey::Session(session_id.clone()), &metadata_uri);

    events::emit_metadata_updated(env, &session_id, &caller, &metadata_uri);

    Ok(())
}

/// The metadata URI for `session_id`, or `None` if none has been set.
///
/// Read-only. `None` covers both "no such session" and "session with no
/// metadata", because a relayer sweeping the event stream cannot tell those
/// apart and must not have to: an event for a session that does not exist is
/// not actionable either way.
///
/// # Errors
/// None.
pub fn get_session_metadata(env: &Env, session_id: Bytes) -> Option<String> {
    if !session::session_exists(env, &session_id) {
        return None;
    }
    env.storage()
        .persistent()
        .get(&MetadataKey::Session(session_id))
}

/// Remove the metadata URI for `session_id`.
///
/// Allowed only from the same states as [`set_session_metadata`], for the same
/// reason: a settled escrow's record is frozen.
///
/// # Errors
/// - [`ContractError::SessionNotFound`] if `session_id` doesn't exist.
/// - [`ContractError::NotParticipant`] if `caller` is neither party.
/// - [`ContractError::SessionNotSettled`] if the session is `Refunded` or
///   `Resolved`.
/// - [`ContractError::NoMetadata`] if no URI is currently set, so that a
///   second clear is reported rather than silently succeeding.
///
/// # Events
/// Emits `MetadataCleared`.
pub fn clear_session_metadata(
    env: &Env,
    session_id: Bytes,
    caller: Address,
) -> Result<(), ContractError> {
    let s = session::try_get_session(env, &session_id).ok_or(ContractError::SessionNotFound)?;

    require_mutable(&s)?;
    require_participant(&s, &caller)?;

    if !env
        .storage()
        .persistent()
        .has(&MetadataKey::Session(session_id.clone()))
    {
        return Err(ContractError::NoMetadata);
    }

    env.storage()
        .persistent()
        .remove(&MetadataKey::Session(session_id.clone()));

    env.events()
        .publish((symbol_short!("meta_clr"), session_id), caller);

    Ok(())
}
