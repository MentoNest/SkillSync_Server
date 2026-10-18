use soroban_sdk::contracterror;

/// Contract-level errors.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum ContractError {
    /// `initialize` has already been called; re-initialization reverts.
    AlreadyInitialized = 1,
    /// An admin-gated function ran before `initialize`.
    NotInitialized = 2,
    /// The caller is not allowed to perform this action.
    Unauthorized = 3,
    /// An amount must be greater than zero.
    InvalidAmount = 4,
    /// A session with this id already exists (ids are never reused).
    DuplicateSessionId = 5,
    /// No session exists for this id.
    SessionNotFound = 6,
    /// The session is not in the status this action requires.
    InvalidStatus = 7,
    /// The payment token has not been configured by the admin.
    TokenNotConfigured = 8,
    /// The platform fee must be between 0 and 1000 basis points.
    InvalidFee = 9,
    /// The dispute window must be greater than zero ledgers.
    InvalidWindow = 10,
    /// The dispute window has not elapsed yet.
    DisputeWindowOpen = 11,
    /// A fee calculation overflowed.
    ArithmeticOverflow = 12,
}
