use soroban_sdk::{Address, Bytes, Env};

use crate::{DataKey, Session, SessionStatus};

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum SessionValidationError {
    NotFound,
    AlreadyCompleted,
    AlreadyDisputed,
    NotParticipant,
    Expired,
    InvalidAmount,
    Unauthorized,
}

pub fn validate_session_exists(env: &Env, session_id: &Bytes) -> Result<Session, SessionValidationError> {
    let key = DataKey::Session(session_id.clone());
    match env.storage().persistent().get::<_, Session>(&key) {
        Some(session) => Ok(session),
        None => Err(SessionValidationError::NotFound),
    }
}

pub fn validate_session_active(session: &Session) -> Result<(), SessionValidationError> {
    match session.status {
        SessionStatus::Completed | SessionStatus::Approved | SessionStatus::Refunded => {
            Err(SessionValidationError::AlreadyCompleted)
        }
        SessionStatus::Disputed => Err(SessionValidationError::AlreadyDisputed),
        _ => Ok(()),
    }
}

pub fn validate_participant(
    session: &Session,
    address: &Address,
) -> Result<(), SessionValidationError> {
    if session.buyer != *address && session.seller != *address {
        return Err(SessionValidationError::NotParticipant);
    }
    Ok(())
}

pub fn validate_session_not_expired(
    env: &Env,
    session: &Session,
    timeout_seconds: u32,
) -> Result<(), SessionValidationError> {
    let ledger_time = env.ledger().timestamp();
    if session.created_at > 0 && ledger_time > session.created_at + timeout_seconds {
        return Err(SessionValidationError::Expired);
    }
    Ok(())
}

pub fn validate_session_amount(amount: i128) -> Result<(), SessionValidationError> {
    if amount <= 0 {
        return Err(SessionValidationError::InvalidAmount);
    }
    Ok(())
}

pub fn validate_session_transition(
    current: &SessionStatus,
    target: &SessionStatus,
) -> Result<(), SessionValidationError> {
    match (current, target) {
        (SessionStatus::Locked, SessionStatus::Completed) => Ok(()),
        (SessionStatus::Locked, SessionStatus::Disputed) => Ok(()),
        (SessionStatus::Completed, SessionStatus::Approved) => Ok(()),
        (SessionStatus::Completed, SessionStatus::Disputed) => Ok(()),
        (SessionStatus::Disputed, SessionStatus::Resolved) => Ok(()),
        (SessionStatus::Resolved, SessionStatus::Completed) => Ok(()),
        _ => Err(SessionValidationError::Unauthorized),
    }
}

pub fn authorize(env: &Env, expected: &Address) -> Result<(), SessionValidationError> {
    let caller = env.current_contract_address();
    if caller != *expected {
        return Err(SessionValidationError::Unauthorized);
    }
    Ok(())
}
