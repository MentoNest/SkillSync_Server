use soroban_sdk::contracterror;

/// All possible errors returned by the SkillSync contract.
///
/// Every variant has a unique, stable numeric code. Codes are grouped into
/// bands by concern so that a caller can react to a whole class of failure
/// without enumerating every member, and so that a new error in one band
/// never renumbers another:
///
/// | Band  | Range   | Concern                                 |
/// |-------|---------|-----------------------------------------|
/// | init  | 1–99    | Deployment / initialization              |
/// | authz | 200–299 | Who is allowed to call this               |
/// | sess  | 300–399 | Session lookup and lifecycle transitions  |
/// | fin   | 400–499 | Amounts, balances, fees, splits           |
/// | disp  | 500–599 | Timeouts and dispute state               |
/// | upgr  | 600–699 | Contract upgrades                        |
///
/// Within a band, codes are also ordered: the low end is the "you called this
/// wrong" case and the high end is the "the world moved on" case (e.g.
/// 300 `SessionNotFound` → 301 `DuplicateSessionId` → 302
/// `InvalidSessionState` → 303..306 specific terminal states).
///
/// The doc comment on each variant is exported into the contract spec, so
/// clients see the same descriptions. Because these codes are part of the
/// contract's public ABI, an existing variant's number is never reused for a
/// different meaning; a retired variant keeps its number reserved.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum ContractError {
    // ── Initialization (1–99) ──────────────────────────────────────────
    /// Contract has already been initialized; re-initialization is forbidden.
    AlreadyInitialized = 1,
    /// Contract has not been initialized yet.
    NotInitialized = 2,

    // ── Authorization (200–299) ───────────────────────────────────────
    /// Caller is not authorized to perform this action.
    Unauthorized = 200,
    /// Caller is not the contract admin.
    NotAdmin = 201,
    /// Caller is not the buyer of the session being acted on.
    NotBuyer = 202,
    /// Caller is not the seller of the session being acted on.
    NotSeller = 203,

    // ── Session validation (300–399) ──────────────────────────────────
    /// Session ID does not exist.
    SessionNotFound = 300,
    /// Session ID already exists.
    DuplicateSessionId = 301,
    /// Operation is not allowed in the session's current state.
    InvalidSessionState = 302,
    /// Session is already completed and cannot be completed again.
    SessionAlreadyCompleted = 303,
    /// Session is already approved and cannot be approved again.
    SessionAlreadyApproved = 304,
    /// Session is already refunded and cannot be refunded again.
    SessionAlreadyRefunded = 305,
    /// Session is under dispute and cannot be acted on.
    SessionInDispute = 306,

    // ── Financial validation (400–499) ─────────────────────────────────
    /// Amount is zero or negative.
    InvalidAmount = 400,
    /// Buyer does not have enough funds to cover the amount.
    InsufficientBalance = 401,
    /// Fee exceeds the maximum of 1000 bps.
    FeeTooHigh = 402,
    /// Dispute split does not sum to the session amount.
    InvalidSplit = 403,
    /// Arithmetic overflow detected.
    Overflow = 404,
    /// No usable price is available for the asset: the oracle is unset,
    /// unreachable, or too stale to trust, and no admin fallback is set.
    PriceUnavailable = 405,

    // ── Timeouts and disputes (500–599) ────────────────────────────────
    /// The dispute window has not elapsed yet; auto-refund is not available.
    DisputeWindowNotElapsed = 500,
    /// A dispute is already open for this session.
    DisputeAlreadyOpen = 501,
    /// No dispute is open for this session, so there is nothing to resolve.
    DisputeNotOpen = 502,
    /// Session is not eligible for dispute resolution.
    ResolutionNotAllowed = 503,

    // ── Upgrades (600–699) ─────────────────────────────────────────────
    /// The provided WASM hash is zero or otherwise invalid.
    InvalidWasmHash = 600,
    /// The low-level contract upgrade call failed.
    UpgradeFailed = 601,
}

impl From<ContractError> for u32 {
    fn from(error: ContractError) -> Self {
        error as u32
    }
}

impl ContractError {
    /// The stable numeric code exposed on the wire for this error.
    ///
    /// Equivalent to `u32::from(error)`, but reads better at call sites that
    /// log or compare codes directly.
    pub fn code(self) -> u32 {
        self as u32
    }
}

/// A human-readable rendering of an error, for logs and off-chain tooling.
///
/// The wire format is the numeric code; this is the string form. It is
/// written as `"<code>: <name> - <description>"` so that a log line carries
/// all three things a person needs to act on it: which code to look up, what
/// the variant is called, and what went wrong. Off-chain clients that switch
/// on the string get the variant name, which is stable, rather than prose
/// that can be reworded.
impl core::fmt::Display for ContractError {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        let (name, description) = match self {
            ContractError::AlreadyInitialized => (
                "AlreadyInitialized",
                "contract has already been initialized",
            ),
            ContractError::NotInitialized => ("NotInitialized", "contract is not initialized"),
            ContractError::Unauthorized => (
                "Unauthorized",
                "caller is not authorized to perform this action",
            ),
            ContractError::NotAdmin => ("NotAdmin", "caller is not the contract admin"),
            ContractError::NotBuyer => ("NotBuyer", "caller is not the session buyer"),
            ContractError::NotSeller => ("NotSeller", "caller is not the session seller"),
            ContractError::SessionNotFound => ("SessionNotFound", "session id does not exist"),
            ContractError::DuplicateSessionId => ("DuplicateSessionId", "session id already exists"),
            ContractError::InvalidSessionState => (
                "InvalidSessionState",
                "operation is not allowed in the session's current state",
            ),
            ContractError::SessionAlreadyCompleted => (
                "SessionAlreadyCompleted",
                "session is already completed",
            ),
            ContractError::SessionAlreadyApproved => (
                "SessionAlreadyApproved",
                "session is already approved",
            ),
            ContractError::SessionAlreadyRefunded => (
                "SessionAlreadyRefunded",
                "session is already refunded",
            ),
            ContractError::SessionInDispute => (
                "SessionInDispute",
                "session is under dispute and cannot be acted on",
            ),
            ContractError::InvalidAmount => ("InvalidAmount", "amount is zero or negative"),
            ContractError::InsufficientBalance => (
                "InsufficientBalance",
                "buyer does not have enough funds",
            ),
            ContractError::FeeTooHigh => ("FeeTooHigh", "fee exceeds the maximum of 1000 bps"),
            ContractError::InvalidSplit => (
                "InvalidSplit",
                "dispute split does not sum to the session amount",
            ),
            ContractError::Overflow => ("Overflow", "arithmetic overflow detected"),
            ContractError::PriceUnavailable => (
                "PriceUnavailable",
                "no usable price is available for the asset",
            ),
            ContractError::DisputeWindowNotElapsed => (
                "DisputeWindowNotElapsed",
                "the dispute window has not elapsed yet",
            ),
            ContractError::DisputeAlreadyOpen => (
                "DisputeAlreadyOpen",
                "a dispute is already open for this session",
            ),
            ContractError::DisputeNotOpen => (
                "DisputeNotOpen",
                "no dispute is open for this session",
            ),
            ContractError::ResolutionNotAllowed => (
                "ResolutionNotAllowed",
                "session is not eligible for dispute resolution",
            ),
            ContractError::InvalidWasmHash => (
                "InvalidWasmHash",
                "the provided wasm hash is zero or invalid",
            ),
            ContractError::UpgradeFailed => (
                "UpgradeFailed",
                "the low-level contract upgrade call failed",
            ),
        };

        write!(f, "{}: {} - {}", self.code(), name, description)
    }
}

#[cfg(test)]
mod tests {
    use super::ContractError::{self, *};

    /// Every variant the contract can return, with the code each one is
    /// specified to carry.
    const ALL: [(ContractError, u32); 27] = [
        // Initialization.
        (AlreadyInitialized, 1),
        (NotInitialized, 2),
        // Authorization.
        (Unauthorized, 200),
        (NotAdmin, 201),
        (NotBuyer, 202),
        (NotSeller, 203),
        // Session validation.
        (SessionNotFound, 300),
        (DuplicateSessionId, 301),
        (InvalidSessionState, 302),
        (SessionAlreadyCompleted, 303),
        (SessionAlreadyApproved, 304),
        (SessionAlreadyRefunded, 305),
        (SessionInDispute, 306),
        // Financial validation.
        (InvalidAmount, 400),
        (InsufficientBalance, 401),
        (FeeTooHigh, 402),
        (InvalidSplit, 403),
        (Overflow, 404),
        (PriceUnavailable, 405),
        // Timeouts and disputes.
        (DisputeWindowNotElapsed, 500),
        (DisputeAlreadyOpen, 501),
        (DisputeNotOpen, 502),
        (ResolutionNotAllowed, 503),
        // Upgrades.
        (InvalidWasmHash, 600),
        (UpgradeFailed, 601),
    ];

    #[test]
    fn every_variant_carries_its_specified_code() {
        for (variant, expected) in ALL.iter() {
            assert_eq!(
                u32::from(*variant),
                *expected,
                "{:?} should be code {}",
                variant,
                expected
            );
        }
    }

    #[test]
    fn codes_are_unique() {
        for (i, (a, code_a)) in ALL.iter().enumerate() {
            for (b, code_b) in &ALL[i + 1..] {
                assert_ne!(
                    code_a, code_b,
                    "{:?} and {:?} share code {}",
                    a, b, code_a
                );
            }
        }
    }

    #[test]
    fn every_code_is_in_its_declared_band() {
        /// Inclusive `(low, high)` bounds for each band.
        const BANDS: [(u32, u32); 6] = [
            (1, 99),
            (200, 299),
            (300, 399),
            (400, 499),
            (500, 599),
            (600, 699),
        ];
        for (variant, code) in ALL.iter() {
            assert!(
                BANDS.iter().any(|(lo, hi)| (lo..=hi).contains(code)),
                "{:?} code {} is in no declared band",
                variant,
                code
            );
        }
    }

    #[test]
    fn code_helper_matches_the_repr() {
        assert_eq!(InvalidSplit.code(), 403);
        assert_eq!(SessionInDispute.code(), 306);
    }

    /// The `Display` tests need `String` and `format!`, which a `no_std`
    /// crate does not have in scope. `lib.rs` pulls `std` in under
    /// `cfg(test)` for exactly this purpose.
    use std::format;
    use std::string::String;

    fn render(error: ContractError) -> String {
        use core::fmt::Write;
        let mut out = String::new();
        write!(out, "{}", error).expect("writing to a String cannot fail");
        out
    }

    #[test]
    fn display_starts_with_the_numeric_code_and_variant_name() {
        for (variant, code) in ALL.iter() {
            let rendered = render(*variant);
            assert!(
                rendered.starts_with(&format!("{}: {:?} - ", code, variant)),
                "{:?} rendered as {:?}",
                variant,
                rendered
            );
        }
    }

    #[test]
    fn display_descriptions_are_non_empty() {
        for (variant, _) in ALL.iter() {
            let rendered = render(*variant);
            let description = rendered
                .split(" - ")
                .nth(1)
                .unwrap_or_else(|| panic!("{:?} has no description: {:?}", variant, rendered));
            assert!(
                !description.is_empty(),
                "{:?} has an empty description",
                variant
            );
        }
    }
}
