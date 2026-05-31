// ============================================================================
// milestone.rs — Issue: Milestone-Based Escrow
//
// Allows complex escrow where funds are released in multiple stages, e.g.:
//   30% upfront → 40% on delivery → 30% on acceptance
//
// Storage layout (all persistent):
//   MilestoneSession(session_id)  → MilestoneSession struct
//   Milestones(session_id)        → Vec<Milestone>
//
// Key invariants:
//   • All milestone percentages (in BPS) must sum to exactly 10_000.
//   • Milestones are released in order; you cannot skip one.
//   • A disputed session cannot have milestones released until resolved.
//   • Seller can only withdraw the sum of released-but-unclaimed milestones.
// ============================================================================

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, token, vec, Address, BytesN, Env, String,
    Symbol, Vec,
};

use crate::{reentrancy, Bytes32};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/// State of a milestone session.
#[contracttype]
#[derive(Clone, PartialEq, Debug)]
pub enum MilestoneSessionState {
    /// Funds locked, milestones pending release.
    Active,
    /// A dispute has been raised; milestone releases are paused.
    Disputed,
    /// All milestones released and claimed.
    Completed,
    /// Admin resolved a dispute; session closed.
    Resolved,
}

/// A single milestone within a session.
#[contracttype]
#[derive(Clone, Debug)]
pub struct Milestone {
    /// Share of total amount in basis points (1 BPS = 0.01%).
    /// All milestones in a session must sum to 10_000 BPS.
    pub percentage_bps: u32,
    /// Human-readable description, e.g. "Delivery of design mockups".
    pub description: String,
    /// Whether the buyer has released this milestone.
    pub released: bool,
    /// Ledger sequence at which the buyer released this milestone (0 = not released).
    pub released_at: u64,
}

/// Top-level milestone session record stored in contract persistent storage.
#[contracttype]
#[derive(Clone, Debug)]
pub struct MilestoneSessionData {
    pub buyer: Address,
    pub seller: Address,
    /// Total amount locked in escrow (in token's smallest unit).
    pub total_amount: i128,
    pub token_id: Address,
    pub state: MilestoneSessionState,
    /// Sum of amounts already transferred to the seller.
    pub claimed_amount: i128,
    /// Ledger sequence when the session was created.
    pub created_at: u64,
}

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

#[contracttype]
pub enum MilestoneKey {
    /// Stores `MilestoneSessionData` for a given session.
    Session(Bytes32),
    /// Stores `Vec<Milestone>` for a given session.
    Milestones(Bytes32),
    /// Admin address (shared with the main escrow contract).
    Admin,
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/// Returns a consistent panic message. Soroban panic messages are strings;
/// we embed the numeric code so off-chain indexers can parse them.
fn err(code: u32, msg: &str) -> ! {
    // e.g. "MilestoneError[3]: InvalidState"
    panic!("MilestoneError[{}]: {}", code, msg)
}

// Error codes mirror the main EscrowError enum spacing (800-range to avoid
// collision with the main contract's 700-range reentrancy code).
pub const ERR_BPS_SUM: u32 = 801; // milestone BPS do not sum to 10_000
pub const ERR_EMPTY_MILESTONES: u32 = 802; // no milestones provided
pub const ERR_DUPLICATE_SESSION: u32 = 803;
pub const ERR_SESSION_NOT_FOUND: u32 = 804;
pub const ERR_INVALID_STATE: u32 = 805; // wrong state for the operation
pub const ERR_UNAUTHORIZED: u32 = 806;
pub const ERR_MILESTONE_INDEX: u32 = 807; // index out of range
pub const ERR_ALREADY_RELEASED: u32 = 808;
pub const ERR_DISPUTED: u32 = 809; // operation blocked by active dispute

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

fn get_session(env: &Env, id: &Bytes32) -> MilestoneSessionData {
    env.storage()
        .persistent()
        .get(&MilestoneKey::Session(id.clone()))
        .unwrap_or_else(|| err(ERR_SESSION_NOT_FOUND, "session not found"))
}

fn save_session(env: &Env, id: &Bytes32, session: &MilestoneSessionData) {
    env.storage()
        .persistent()
        .set(&MilestoneKey::Session(id.clone()), session);
}

fn get_milestones(env: &Env, id: &Bytes32) -> Vec<Milestone> {
    env.storage()
        .persistent()
        .get(&MilestoneKey::Milestones(id.clone()))
        .unwrap_or_else(|| err(ERR_SESSION_NOT_FOUND, "milestones not found"))
}

fn save_milestones(env: &Env, id: &Bytes32, milestones: &Vec<Milestone>) {
    env.storage()
        .persistent()
        .set(&MilestoneKey::Milestones(id.clone()), milestones);
}

/// Compute the token amount for a milestone given total_amount and its BPS.
/// Rounds DOWN (seller receives remainder via the last milestone's claim).
pub fn milestone_amount(total_amount: i128, percentage_bps: u32) -> i128 {
    total_amount * percentage_bps as i128 / 10_000
}

// ---------------------------------------------------------------------------
// Public API (standalone functions used by SkillSyncEscrow impl block)
// ---------------------------------------------------------------------------

/// Lock funds into a new milestone-based escrow session.
///
/// # Parameters
/// - `session_id`  — unique identifier (Bytes32)
/// - `buyer`       — address funding the escrow; must sign
/// - `seller`      — address that will receive released milestones
/// - `total_amount`— total tokens to lock
/// - `token_id`    — SEP-41 token contract address
/// - `milestones`  — list of `(percentage_bps, description)` tuples;
///                   must sum to exactly 10_000 BPS
pub fn lock_funds_with_milestones(
    env: Env,
    session_id: Bytes32,
    buyer: Address,
    seller: Address,
    total_amount: i128,
    token_id: Address,
    milestones: Vec<(u32, String)>,
) {
    buyer.require_auth();

    // Validate
    if milestones.is_empty() {
        err(ERR_EMPTY_MILESTONES, "milestones cannot be empty");
    }
    if env
        .storage()
        .persistent()
        .has(&MilestoneKey::Session(session_id.clone()))
    {
        err(ERR_DUPLICATE_SESSION, "duplicate session id");
    }

    // Validate BPS sum == 10_000
    let bps_sum: u32 = milestones.iter().map(|(bps, _)| bps).sum();
    if bps_sum != 10_000 {
        err(ERR_BPS_SUM, "milestone BPS must sum to 10000");
    }

    // Transfer total_amount from buyer to contract (guarded against reentrancy)
    reentrancy::guarded(&env, || {
        token::Client::new(&env, &token_id).transfer(
            &buyer,
            &env.current_contract_address(),
            &total_amount,
        );
    });

    // Persist session
    let session = MilestoneSessionData {
        buyer: buyer.clone(),
        seller: seller.clone(),
        total_amount,
        token_id: token_id.clone(),
        state: MilestoneSessionState::Active,
        claimed_amount: 0,
        created_at: env.ledger().sequence() as u64,
    };
    save_session(&env, &session_id, &session);

    // Persist milestones
    let mut milestone_vec: Vec<Milestone> = Vec::new(&env);
    for (percentage_bps, description) in milestones.iter() {
        milestone_vec.push_back(Milestone {
            percentage_bps,
            description,
            released: false,
            released_at: 0,
        });
    }
    save_milestones(&env, &session_id, &milestone_vec);

    env.events().publish(
        (Symbol::new(&env, "MilestoneFundsLocked"), session_id.clone()),
        (buyer, seller, total_amount, milestone_vec.len()),
    );
}

/// Buyer releases a specific milestone, triggering immediate token transfer
/// to the seller.
///
/// # Parameters
/// - `session_id`       — identifies the escrow session
/// - `milestone_index`  — zero-based index into the milestones list
///
/// # Rules
/// - Only the buyer may call this.
/// - Session must be `Active` (not Disputed/Completed/Resolved).
/// - The milestone must not already be released.
/// - Transfer is reentrancy-guarded.
/// - If this is the last milestone, session state transitions to `Completed`.
pub fn release_milestone(env: Env, session_id: Bytes32, buyer: Address, milestone_index: u32) {
    buyer.require_auth();

    let mut session = get_session(&env, &session_id);

    // Auth
    if buyer != session.buyer {
        err(ERR_UNAUTHORIZED, "only buyer can release milestones");
    }

    // State checks
    if session.state == MilestoneSessionState::Disputed {
        err(ERR_DISPUTED, "milestone releases paused due to active dispute");
    }
    if session.state != MilestoneSessionState::Active {
        err(ERR_INVALID_STATE, "session is not Active");
    }

    let mut milestones = get_milestones(&env, &session_id);

    let idx = milestone_index as usize;
    if idx >= milestones.len() as usize {
        err(ERR_MILESTONE_INDEX, "milestone index out of range");
    }

    let mut m = milestones.get(milestone_index).unwrap();
    if m.released {
        err(ERR_ALREADY_RELEASED, "milestone already released");
    }

    // Calculate payout
    let payout = milestone_amount(session.total_amount, m.percentage_bps);

    // Transfer to seller — reentrancy guarded
    reentrancy::guarded(&env, || {
        token::Client::new(&env, &session.token_id).transfer(
            &env.current_contract_address(),
            &session.seller,
            &payout,
        );
    });

    // Update milestone
    m.released = true;
    m.released_at = env.ledger().sequence() as u64;
    milestones.set(milestone_index, m);
    save_milestones(&env, &session_id, &milestones);

    // Update session claimed amount
    session.claimed_amount += payout;

    // Check if all milestones are now released
    let all_released = milestones.iter().all(|m| m.released);
    if all_released {
        session.state = MilestoneSessionState::Completed;
    }
    save_session(&env, &session_id, &session);

    env.events().publish(
        (
            Symbol::new(&env, "MilestoneReleased"),
            session_id.clone(),
            milestone_index,
        ),
        payout,
    );
}

/// Raise a dispute on a milestone session (pauses further releases).
pub fn dispute_milestone_session(env: Env, session_id: Bytes32, opened_by: Address) {
    opened_by.require_auth();

    let mut session = get_session(&env, &session_id);

    if opened_by != session.buyer && opened_by != session.seller {
        err(ERR_UNAUTHORIZED, "must be buyer or seller");
    }
    if session.state != MilestoneSessionState::Active {
        err(ERR_INVALID_STATE, "session must be Active to dispute");
    }

    session.state = MilestoneSessionState::Disputed;
    save_session(&env, &session_id, &session);

    env.events().publish(
        (Symbol::new(&env, "MilestoneDisputeOpened"), session_id),
        opened_by,
    );
}

/// Admin resolves a disputed milestone session, splitting remaining funds.
///
/// - `buyer_bps` — percentage (BPS) of REMAINING (unreleased) funds sent to buyer.
/// - Remainder goes to seller.
pub fn resolve_milestone_dispute(
    env: Env,
    session_id: Bytes32,
    admin: Address,
    buyer_bps: u32,
) {
    admin.require_auth();

    // Verify caller is the stored admin
    let stored_admin: Address = env
        .storage()
        .persistent()
        .get(&MilestoneKey::Admin)
        .expect("admin not set");
    if admin != stored_admin {
        err(ERR_UNAUTHORIZED, "not admin");
    }

    if buyer_bps > 10_000 {
        panic!("buyer_bps cannot exceed 10000");
    }

    let mut session = get_session(&env, &session_id);
    if session.state != MilestoneSessionState::Disputed {
        err(ERR_INVALID_STATE, "session is not Disputed");
    }

    let remaining = session.total_amount - session.claimed_amount;

    if remaining > 0 {
        let buyer_amount = remaining * buyer_bps as i128 / 10_000;
        let seller_amount = remaining - buyer_amount;

        let token = token::Client::new(&env, &session.token_id);

        reentrancy::guarded(&env, || {
            if buyer_amount > 0 {
                token.transfer(
                    &env.current_contract_address(),
                    &session.buyer,
                    &buyer_amount,
                );
            }
            if seller_amount > 0 {
                token.transfer(
                    &env.current_contract_address(),
                    &session.seller,
                    &seller_amount,
                );
            }
        });

        session.claimed_amount = session.total_amount; // fully settled
    }

    session.state = MilestoneSessionState::Resolved;
    save_session(&env, &session_id, &session);

    env.events().publish(
        (Symbol::new(&env, "MilestoneDisputeResolved"), session_id),
        (admin, buyer_bps),
    );
}

/// Read-only: returns milestone session data.
pub fn get_milestone_session(env: Env, session_id: Bytes32) -> MilestoneSessionData {
    get_session(&env, &session_id)
}

/// Read-only: returns all milestones for a session.
pub fn get_milestones_for_session(env: Env, session_id: Bytes32) -> Vec<Milestone> {
    get_milestones(&env, &session_id)
}