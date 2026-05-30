use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum SessionError {
    /// Session ID does not exist
    SessionNotFound = 300,
    /// Session ID already exists
    DuplicateSessionId = 301,
    /// Operation not allowed in current state
    InvalidSessionState = 302,
    /// Cannot complete again
    SessionAlreadyCompleted = 303,
    /// Cannot approve twice
    SessionAlreadyApproved = 304,
    /// Session already refunded
    SessionAlreadyRefunded = 305,
    /// Cannot act while disputed
    SessionInDispute = 306,
}

impl From<SessionError> for u32 {
    fn from(error: SessionError) -> Self {
        error as u32
    }
}
