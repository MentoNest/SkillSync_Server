use soroban_sdk::contracterror;

/// Every error the contract can return, with its stable numeric code.
///
/// The numeric code is part of the contract's ABI: a failed invocation surfaces
/// it on-chain as `ScError::Contract(code)`, so a code must never be reused for
/// a different meaning and existing values must not be renumbered. The full
/// table is documented in `ERROR_CODES.md`; keep the two in sync.
///
/// Codes are grouped in bands so a new error can be added without touching the
/// codes of its neighbours:
///
/// | Band      | Purpose                                   |
/// |-----------|-------------------------------------------|
/// | 100 – 119 | initialization                            |
/// | 120 – 139 | authorization                             |
/// | 140 – 159 | input validation                          |
/// | 160 – 179 | session state                             |
/// | 180 – 199 | configuration and arithmetic              |
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum ContractError {
    // ── Initialization (100-119) ─────────────────────────────────────────
    /// `initialize` has already been called; re-initialization reverts.
    AlreadyInitialized = 100,
    /// An admin-gated function ran before `initialize`.
    NotInitialized = 101,
    /// The admin address is the zero address, which can never sign.
    InvalidAdmin = 102,
    /// The treasury address is the zero address, which can never receive fees.
    InvalidTreasury = 103,

    // ── Authorization (120-139) ──────────────────────────────────────────
    /// The caller is not allowed to perform this action.
    Unauthorized = 120,
    /// Only the session's buyer or seller may do this.
    NotAParticipant = 121,

    // ── Input validation (140-159) ───────────────────────────────────────
    /// An amount must be greater than zero.
    InvalidAmount = 140,
    /// The platform fee must be between 0 and 1000 basis points.
    InvalidFee = 141,
    /// The dispute window must be greater than zero ledgers.
    InvalidWindow = 142,
    /// Dispute shares are negative or do not add up to the session amount.
    InvalidShares = 143,
    /// `resolution` is not a known outcome, or does not match the shares.
    InvalidResolution = 144,

    // ── Session state (160-179) ──────────────────────────────────────────
    /// A session with this id already exists (ids are never reused).
    DuplicateSessionId = 160,
    /// No session exists for this id.
    SessionNotFound = 161,
    /// The session is not in the status this action requires.
    InvalidStatus = 162,
    /// The dispute window has not elapsed yet.
    DisputeWindowOpen = 163,

    // ── Configuration and arithmetic (180-199) ───────────────────────────
    /// The payment token has not been configured by the admin.
    TokenNotConfigured = 180,
    /// A fee calculation overflowed.
    ArithmeticOverflow = 181,
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::xdr::ScErrorType;
    use soroban_sdk::Error;

    /// Every variant, so the tests below cannot silently miss a new one.
    const ALL: [ContractError; 17] = [
        ContractError::AlreadyInitialized,
        ContractError::NotInitialized,
        ContractError::InvalidAdmin,
        ContractError::InvalidTreasury,
        ContractError::Unauthorized,
        ContractError::NotAParticipant,
        ContractError::InvalidAmount,
        ContractError::InvalidFee,
        ContractError::InvalidWindow,
        ContractError::InvalidShares,
        ContractError::InvalidResolution,
        ContractError::DuplicateSessionId,
        ContractError::SessionNotFound,
        ContractError::InvalidStatus,
        ContractError::DisputeWindowOpen,
        ContractError::TokenNotConfigured,
        ContractError::ArithmeticOverflow,
    ];

    #[test]
    fn every_code_is_unique_and_fits_in_a_u8() {
        for (i, error) in ALL.iter().enumerate() {
            let code = *error as u32;
            assert!(
                code <= u8::MAX as u32,
                "{error:?} code {code} is out of 0-255"
            );
            for other in &ALL[i + 1..] {
                assert_ne!(
                    code, *other as u32,
                    "{error:?} and {other:?} share the same code"
                );
            }
        }
    }

    #[test]
    fn initialization_codes_match_the_spec() {
        assert_eq!(ContractError::AlreadyInitialized as u32, 100);
        assert_eq!(ContractError::NotInitialized as u32, 101);
        assert_eq!(ContractError::InvalidAdmin as u32, 102);
        assert_eq!(ContractError::InvalidTreasury as u32, 103);
    }

    #[test]
    fn errors_convert_into_soroban_errors_with_their_code() {
        for error in ALL {
            let converted: Error = error.into();
            assert!(converted.is_type(ScErrorType::Contract), "{error:?}");
            assert_eq!(converted.get_code(), error as u32, "{error:?}");
        }
    }
}
