// `contracterror` is the Soroban macro that turns a plain Rust enum into a
// type the contract runtime can return as an error. It generates the
// conversions to and from `soroban_sdk::Error`.
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
// `contracterror` must come before the derives so the macro sees the enum
// as written and can add its own trait implementations.
#[contracterror]
// Copy/Clone: errors are cheap values passed around freely.
// Debug: needed for `{error:?}` formatting in logs and test assertion messages.
// Eq/PartialEq: lets callers and tests compare errors directly.
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
// Soroban requires contract errors to be `u32`-backed, since the code is
// carried on-chain as a `u32` inside `ScError::Contract`.
#[repr(u32)]
pub enum ContractError {
    // ── Initialization (100-119) ─────────────────────────────────────────
    // Errors raised around the one-time setup of the contract.
    /// `initialize` has already been called; re-initialization reverts.
    AlreadyInitialized = 100,
    /// An admin-gated function ran before `initialize`.
    NotInitialized = 101,
    /// The admin address is the zero address, which can never sign.
    InvalidAdmin = 102,
    /// The treasury address is the zero address, which can never receive fees.
    InvalidTreasury = 103,

    // ── Authorization (120-139) ──────────────────────────────────────────
    // Errors raised when the caller lacks permission for an action.
    /// The caller is not allowed to perform this action.
    Unauthorized = 120,
    /// Only the session's buyer or seller may do this.
    NotAParticipant = 121,

    // ── Input validation (140-159) ───────────────────────────────────────
    // Errors raised when arguments passed by the caller are out of range
    // or inconsistent. These are checked before any state is changed.
    /// An amount must be greater than zero.
    InvalidAmount = 140,
    /// The platform fee must be between 0 and 1000 basis points.
    /// (1000 bps = 10%, so this caps the fee at 10% of the session amount.)
    InvalidFee = 141,
    /// The dispute window must be greater than zero ledgers.
    InvalidWindow = 142,
    /// Dispute shares are negative or do not add up to the session amount.
    InvalidShares = 143,
    /// `resolution` is not a known outcome, or does not match the shares.
    InvalidResolution = 144,

    // ── Session state (160-179) ──────────────────────────────────────────
    // Errors raised when an action does not fit the current state of a
    // session (or the session does not exist at all).
    /// A session with this id already exists (ids are never reused).
    DuplicateSessionId = 160,
    /// No session exists for this id.
    SessionNotFound = 161,
    /// The session is not in the status this action requires.
    InvalidStatus = 162,
    /// The dispute window has not elapsed yet.
    DisputeWindowOpen = 163,

    // ── Configuration and arithmetic (180-199) ───────────────────────────
    // Errors raised by missing admin configuration or failed safe math.
    /// The payment token has not been configured by the admin.
    TokenNotConfigured = 180,
    /// A fee calculation overflowed.
    ArithmeticOverflow = 181,
}

// Compiled only when running `cargo test`; not part of the deployed contract.
#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::xdr::ScErrorType;
    use soroban_sdk::Error;

    /// Every variant, so the tests below cannot silently miss a new one.
    /// The array length is part of the type, so adding a variant to the enum
    /// without updating this list and the `17` will not go unnoticed by
    /// reviewers: update both together.
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

    // Guards against two errors accidentally sharing a code, which would make
    // them indistinguishable to clients, and against codes leaving the range
    // this project allows (0-255).
    #[test]
    fn every_code_is_unique_and_fits_in_a_u8() {
        for (i, error) in ALL.iter().enumerate() {
            // Casting a fieldless `#[repr(u32)]` enum with `as` yields its
            // discriminant, i.e. the on-chain code.
            let code = *error as u32;
            assert!(
                code <= u8::MAX as u32,
                "{error:?} code {code} is out of 0-255"
            );
            // Compare only against later entries (`i + 1..`) so each pair is
            // checked exactly once and no variant is compared with itself.
            for other in &ALL[i + 1..] {
                assert_ne!(
                    code, *other as u32,
                    "{error:?} and {other:?} share the same code"
                );
            }
        }
    }

    // Pins the initialization band to the published spec. Because codes are
    // ABI, a test that fails on any renumbering is a deliberate safety net.
    #[test]
    fn initialization_codes_match_the_spec() {
        assert_eq!(ContractError::AlreadyInitialized as u32, 100);
        assert_eq!(ContractError::NotInitialized as u32, 101);
        assert_eq!(ContractError::InvalidAdmin as u32, 102);
        assert_eq!(ContractError::InvalidTreasury as u32, 103);
    }

    // Verifies the macro-generated conversion: each error must become a
    // `Contract`-type Soroban error carrying exactly its own numeric code,
    // which is what clients see when an invocation fails.
    #[test]
    fn errors_convert_into_soroban_errors_with_their_code() {
        for error in ALL {
            let converted: Error = error.into();
            assert!(converted.is_type(ScErrorType::Contract), "{error:?}");
            assert_eq!(converted.get_code(), error as u32, "{error:?}");
        }
    }
}