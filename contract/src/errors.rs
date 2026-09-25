use soroban_sdk::contracterror;

/// All possible errors returned by the SkillSync contract.
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
}
