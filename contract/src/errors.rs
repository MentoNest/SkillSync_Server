use soroban_sdk::contracterror;

/// All possible errors returned by the SkillSync contract.
///
/// Every variant has a unique, stable numeric code in the range 0–255. The
/// doc comment on each variant is exported into the contract spec, so
/// clients see the same descriptions.
///
/// | Code | Error                 |
/// |------|-----------------------|
/// | 1    | `AlreadyInitialized`  |
/// | 2    | `NotInitialized`      |
/// | 3    | `Unauthorized`        |
/// | 4    | `InvalidFee`          |
/// | 5    | `SessionNotFound`     |
/// | 6    | `DuplicateSessionId`  |
/// | 7    | `InvalidAmount`       |
/// | 8    | `InvalidSessionState` |
/// | 9    | `InvalidShare`        |
/// | 10   | `SharesMismatch`      |
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum ContractError {
    /// Contract has already been initialized; re-initialization is forbidden.
    AlreadyInitialized = 1,

    /// Contract has not been initialized yet.
    NotInitialized = 2,

    /// Caller is not authorized to perform this action.
    Unauthorized = 3,

    /// Fee value is out of the allowed range (0–1000 bps).
    InvalidFee = 4,

    /// No session exists for the given session ID.
    SessionNotFound = 5,

    /// A session already exists for the given session ID.
    DuplicateSessionId = 6,

    /// Amount must be greater than zero.
    InvalidAmount = 7,

    /// The session's current status does not allow this action.
    InvalidSessionState = 8,

    /// A dispute resolution share is negative.
    InvalidShare = 9,

    /// Dispute resolution shares do not add up to the session amount.
    SharesMismatch = 10,
}

impl From<ContractError> for u32 {
    fn from(error: ContractError) -> Self {
        error as u32
    }
}

#[cfg(test)]
mod tests {
    use super::ContractError::{self, *};

    const ALL: [ContractError; 10] = [
        AlreadyInitialized,
        NotInitialized,
        Unauthorized,
        InvalidFee,
        SessionNotFound,
        DuplicateSessionId,
        InvalidAmount,
        InvalidSessionState,
        InvalidShare,
        SharesMismatch,
    ];

    #[test]
    fn codes_are_unique_and_fit_in_a_byte() {
        for (i, a) in ALL.iter().enumerate() {
            let code: u32 = (*a).into();
            assert!(code <= 255, "{:?} code {} exceeds 255", a, code);
            for b in &ALL[i + 1..] {
                assert_ne!(code, u32::from(*b), "{:?} and {:?} share a code", a, b);
            }
        }
    }

    #[test]
    fn converts_into_numeric_code() {
        let code: u32 = SharesMismatch.into();
        assert_eq!(code, 10);
    }
}
