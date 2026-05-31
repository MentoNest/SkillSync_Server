use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum ContractError {
    /// Internal contract error
    InternalError = 1,
    /// Contract already initialized
    AlreadyInitialized = 2,
    /// Caller is not authorized
    Unauthorized = 3,
    /// Operation is forbidden
    Forbidden = 4,
    /// Resource not found
    NotFound = 5,
    /// Invalid request parameters
    BadRequest = 6,
    /// Resource state conflict
    Conflict = 7,
    /// Operation timed out
    Timeout = 8,
    /// Rate limit exceeded
    RateLimitExceeded = 9,
    /// Validation failed
    ValidationError = 10,

    /// Suspicious activity detected
    SuspiciousActivity = 11,
    /// Account is locked
    AccountLocked = 12,
    /// Token has expired
    TokenExpired = 13,
    /// Token has been revoked
    TokenRevoked = 14,
    /// Token is invalid
    InvalidToken = 15,

    /// Insufficient funds for operation
    InsufficientBalance = 401,
    /// Amount is zero or negative
    InvalidAmount = 400,
    /// Fee exceeds maximum allowed (basis points)
    FeeTooHigh = 402,
    /// Dispute split does not sum to amount
    InvalidSplit = 403,
    /// Arithmetic overflow detected
    Overflow = 404,
    /// Asset is not supported
    InvalidAsset = 24,

    /// Mentor profile not found
    MentorNotFound = 31,
    /// Mentee profile not found
    MenteeNotFound = 32,
    /// Mentoring session not found
    SessionNotFound = 33,
    /// Invalid session status for operation
    InvalidSessionStatus = 34,
    /// Maximum limit reached (e.g. featured mentors)
    MaxLimitReached = 35,
}

impl From<ContractError> for u32 {
    fn from(error: ContractError) -> Self {
        error as u32
    }
}
