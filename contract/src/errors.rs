use soroban_sdk::contracterror;

/// Contract-level errors raised by the initialization surface.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum ContractError {
    /// `initialize` has already been called; re-initialization reverts.
    AlreadyInitialized = 1,
    /// An admin-gated function ran before `initialize`.
    NotInitialized = 2,
}
