use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum DisputeError {
    /// Cannot auto-refund yet
    DisputeWindowNotElapsed = 500,
    /// Dispute already exists for session
    DisputeAlreadyOpen = 501,
    /// No open dispute to resolve
    DisputeNotOpen = 502,
    /// Session not eligible for resolution
    ResolutionNotAllowed = 503,
}

impl From<DisputeError> for u32 {
    fn from(error: DisputeError) -> Self {
        error as u32
    }
}
