// `contracterror` is the Soroban macro that turns a plain Rust enum into a
// type the contract runtime can return as an error. It generates the
// conversions to and from `soroban_sdk::Error`.
use soroban_sdk::contracterror;

/// Every error the contract can return, with its stable numeric code.
///
/// The numeric code is part of the contract's ABI: a failed invocation surfaces
/// it on-chain as `ScError::Contract(code)`, so a code must never be reused for
/// a different meaning. The full table is documented in `ERROR_CODES.md`; keep
/// the two in sync.
///
/// Codes are grouped in bands so a new error can be added without touching the
/// codes of its neighbours:
///
/// | Band      | Purpose                                   |
/// |-----------|-------------------------------------------|
/// | 100 – 119 | initialization                            |
/// | 200 – 219 | authorization                             |
/// | 300 – 319 | session validation                        |
/// | 400 – 419 | financial validation                      |
/// | 500 – 519 | timeout and dispute                       |
/// | 600 – 619 | upgrade                                   |
/// | 700 – 719 | configuration                             |
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

    // ── Authorization (200-219) ──────────────────────────────────────────
    // Errors raised when the caller lacks permission for an action.
    /// Generic unauthorized access: the caller may not perform this action.
    Unauthorized = 200,
    /// The caller is not the stored contract admin.
    NotAdmin = 201,
    /// The caller is not the session's buyer.
    NotBuyer = 202,
    /// The caller is not the session's seller.
    NotSeller = 203,
    /// The caller is neither the session's buyer nor its seller.
    NotAParticipant = 204,

    // ── Session validation (300-319) ─────────────────────────────────────
    // Errors raised when an operation does not fit the session it targets:
    // the session is missing, duplicated, or in the wrong state, or it has
    // already reached the state the operation tries to reach. These are all
    // detected before any state is changed.
    /// No session exists for this id.
    SessionNotFound = 300,
    /// A session with this id already exists (ids are never reused).
    DuplicateSessionId = 301,
    /// The operation is not allowed in the session's current state.
    InvalidSessionState = 302,
    /// The session was already completed and cannot be completed again.
    SessionAlreadyCompleted = 303,
    /// The session was already approved and cannot be approved again.
    SessionAlreadyApproved = 304,
    /// The session was already refunded and cannot be refunded again.
    SessionAlreadyRefunded = 305,
    /// The session is in dispute, so no normal settlement path may touch it.
    SessionInDispute = 306,
    /// The session was locked without insurance, so insurance cannot be claimed.
    NotInsured = 307,
    /// Insurance has already been claimed for this session.
    InsuranceAlreadyClaimed = 308,

    // ── Financial validation (400-419) ───────────────────────────────────
    // Errors raised when amounts, balances, fees or arithmetic are invalid.
    // These are checked before any token leaves the contract.
    /// An amount must be greater than zero.
    InvalidAmount = 400,
    /// The payer does not hold enough of the payment token.
    InsufficientBalance = 401,
    /// The fee exceeds the maximum of 1000 basis points (10%).
    FeeTooHigh = 402,
    /// Dispute shares are negative or do not add up to the session amount.
    InvalidSplit = 403,
    /// An arithmetic operation overflowed instead of wrapping.
    Overflow = 404,
    /// `resolution` is not a known outcome, or does not match the shares.
    InvalidResolution = 405,
    /// Insurance pool balance is insufficient to cover the claim.
    InsufficientInsurancePool = 406,

    // ── Timeout and dispute (500-519) ────────────────────────────────────
    /// The dispute window has not elapsed yet, so `auto_refund` is refused.
    DisputeWindowOpen = 500,
    /// Dispute resolution gave the buyer >= 80% of the amount, so the buyer is not eligible for insurance.
    NotEligibleForInsurance = 501,

    // ── Configuration (700-719) ──────────────────────────────────────────
    // Errors raised when the stored contract configuration is missing or
    // the value an admin tries to store is invalid.
    /// The dispute window must be greater than zero ledgers.
    InvalidWindow = 700,
    /// The payment token has not been configured by the admin.
    TokenNotConfigured = 701,
    /// The insurance premium rate or coverage percentage is invalid.
    InvalidInsuranceRate = 702,
}

// Compiled only when running `cargo test`; not part of the deployed contract.
#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::xdr::ScErrorType;
    use soroban_sdk::Error;

    /// Every variant, so the tests below cannot silently miss a new one.
    /// The array length is part of the type, so adding a variant to the enum
    /// without updating this list and the `25` will not go unnoticed by
    /// reviewers: update both together.
    const ALL: [ContractError; 29] = [
        ContractError::AlreadyInitialized,
        ContractError::NotInitialized,
        ContractError::InvalidAdmin,
        ContractError::InvalidTreasury,
        ContractError::Unauthorized,
        ContractError::NotAdmin,
        ContractError::NotBuyer,
        ContractError::NotSeller,
        ContractError::NotAParticipant,
        ContractError::SessionNotFound,
        ContractError::DuplicateSessionId,
        ContractError::InvalidSessionState,
        ContractError::SessionAlreadyCompleted,
        ContractError::SessionAlreadyApproved,
        ContractError::SessionAlreadyRefunded,
        ContractError::SessionInDispute,
        ContractError::NotInsured,
        ContractError::InsuranceAlreadyClaimed,
        ContractError::InvalidAmount,
        ContractError::InsufficientBalance,
        ContractError::FeeTooHigh,
        ContractError::InvalidSplit,
        ContractError::Overflow,
        ContractError::InvalidResolution,
        ContractError::InsufficientInsurancePool,
        ContractError::DisputeWindowOpen,
        ContractError::NotEligibleForInsurance,
        ContractError::InvalidWindow,
        ContractError::TokenNotConfigured,
        ContractError::InvalidInsuranceRate,
    ];

    /// The bands a code may live in, as `(first, last)` inclusive ranges.
    /// A new band must be added here together with the enum and the spec.
    const BANDS: [(u32, u32); 7] = [
        (100, 119), // initialization
        (200, 219), // authorization
        (300, 319), // session validation
        (400, 419), // financial validation
        (500, 519), // timeout and dispute
        (600, 619), // upgrade
        (700, 719), // configuration
    ];

    // Guards against two errors accidentally sharing a code, which would make
    // them indistinguishable to clients, and against codes drifting outside
    // the documented bands.
    #[test]
    fn every_code_is_unique_and_lies_in_its_band() {
        for (i, error) in ALL.iter().enumerate() {
            // Casting a fieldless `#[repr(u32)]` enum with `as` yields its
            // discriminant, i.e. the on-chain code.
            let code = *error as u32;
            assert!(
                BANDS.iter().any(|&(first, last)| (first..=last).contains(&code)),
                "{error:?} code {code} is outside every documented band"
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

    // Error codes 200-204: who is allowed to make the call.
    #[test]
    fn authorization_codes_match_the_spec() {
        assert_eq!(ContractError::Unauthorized as u32, 200);
        assert_eq!(ContractError::NotAdmin as u32, 201);
        assert_eq!(ContractError::NotBuyer as u32, 202);
        assert_eq!(ContractError::NotSeller as u32, 203);
        assert_eq!(ContractError::NotAParticipant as u32, 204);
    }

    // Error codes 300-306: the session does not exist or is in the wrong state.
    #[test]
    fn session_codes_match_the_spec() {
        assert_eq!(ContractError::SessionNotFound as u32, 300);
        assert_eq!(ContractError::DuplicateSessionId as u32, 301);
        assert_eq!(ContractError::InvalidSessionState as u32, 302);
        assert_eq!(ContractError::SessionAlreadyCompleted as u32, 303);
        assert_eq!(ContractError::SessionAlreadyApproved as u32, 304);
        assert_eq!(ContractError::SessionAlreadyRefunded as u32, 305);
        assert_eq!(ContractError::SessionInDispute as u32, 306);
    }

    // Error codes 400-405: amounts, balances, fees, splits and arithmetic.
    #[test]
    fn financial_codes_match_the_spec() {
        assert_eq!(ContractError::InvalidAmount as u32, 400);
        assert_eq!(ContractError::InsufficientBalance as u32, 401);
        assert_eq!(ContractError::FeeTooHigh as u32, 402);
        assert_eq!(ContractError::InvalidSplit as u32, 403);
        assert_eq!(ContractError::Overflow as u32, 404);
        assert_eq!(ContractError::InvalidResolution as u32, 405);
        assert_eq!(ContractError::InsufficientInsurancePool as u32, 406);
    }

    #[test]
    fn insurance_codes_match_the_spec() {
        assert_eq!(ContractError::NotInsured as u32, 307);
        assert_eq!(ContractError::InsuranceAlreadyClaimed as u32, 308);
        assert_eq!(ContractError::NotEligibleForInsurance as u32, 501);
        assert_eq!(ContractError::InvalidInsuranceRate as u32, 702);
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
