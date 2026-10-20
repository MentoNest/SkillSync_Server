use soroban_sdk::{Address, BytesN, Env, String, Symbol};

/// Emit `Initialized(admin, treasury, dispute_window)` - exactly once, from
/// `initialize`.
///
/// Clients subscribe to this event to detect that the contract is ready and to
/// learn the configuration it started with. `dispute_window` is the window in
/// ledgers that is in effect at that moment: `initialize` takes no window
/// argument, so this is the default until an admin calls `set_dispute_window`.
pub fn emit_initialized(env: &Env, admin: &Address, treasury: &Address, dispute_window: u32) {
    env.events().publish(
        (Symbol::new(env, "Initialized"),),
        (admin.clone(), treasury.clone(), dispute_window),
    );
}

/// Emit `ContractUpgraded(old_wasm_hash, new_wasm_hash, upgraded_by, timestamp)`.
///
/// Lets off-chain monitors track the deployed code hash: `old_wasm_hash` is all
/// zeros for the first upgrade because the initial hash is only recorded here.
pub fn emit_contract_upgraded(
    env: &Env,
    old_hash: &BytesN<32>,
    new_hash: &BytesN<32>,
    upgraded_by: &Address,
) {
    env.events().publish(
        (Symbol::new(env, "ContractUpgraded"),),
        (
            old_hash.clone(),
            new_hash.clone(),
            upgraded_by.clone(),
            env.ledger().timestamp(),
        ),
    );
}

/// Emit `FundsLocked(session_id, buyer, seller, amount, timestamp)`.
///
/// `timestamp` is the ledger timestamp of the locking ledger, so indexers can
/// order escrows without resolving the ledger header themselves.
pub fn emit_funds_locked(
    env: &Env,
    session_id: &BytesN<32>,
    buyer: &Address,
    seller: &Address,
    amount: i128,
) {
    env.events().publish(
        (Symbol::new(env, "FundsLocked"), session_id.clone()),
        (
            buyer.clone(),
            seller.clone(),
            amount,
            env.ledger().timestamp(),
        ),
    );
}

/// Emit `SessionCompleted(session_id, seller, completed_at)`.
///
/// The seller emits it by calling `complete_session`, which is what starts the
/// buyer's dispute window. `completed_at` is the ledger sequence number the
/// session was completed at - the same unit `auto_refund` measures the window
/// in, and the same value stored in `Session::completed_at` - not a wall-clock
/// timestamp.
pub fn emit_session_completed(
    env: &Env,
    session_id: &BytesN<32>,
    seller: &Address,
    completed_at: u64,
) {
    env.events().publish(
        (Symbol::new(env, "SessionCompleted"), session_id.clone()),
        (seller.clone(), completed_at),
    );
}

/// Emit `SessionApproved(session_id, buyer, seller, amount, fee, timestamp)`.
///
/// Sent by `approve_session`, the moment the buyer releases the escrow. Both
/// parties are named because either may be the one watching. `amount` is the
/// gross amount that was escrowed and `fee` the platform fee the treasury
/// received, so the seller's net payout (`amount - fee`) is derivable without
/// reading the session back. `timestamp` is the ledger timestamp of the
/// approving ledger.
pub fn emit_session_approved(
    env: &Env,
    session_id: &BytesN<32>,
    buyer: &Address,
    seller: &Address,
    amount: i128,
    fee: i128,
) {
    env.events().publish(
        (Symbol::new(env, "SessionApproved"), session_id.clone()),
        (
            buyer.clone(),
            seller.clone(),
            amount,
            fee,
            env.ledger().timestamp(),
        ),
    );
}

/// Emit `SessionRefunded(session_id, buyer, amount, timestamp)`.
///
/// Both refund paths emit it - the buyer's manual `refund_session` and the
/// timeout-based `auto_refund` - so a single subscription sees every refund,
/// whichever path paid it out.
pub fn emit_session_refunded(env: &Env, session_id: &BytesN<32>, buyer: &Address, amount: i128) {
    env.events().publish(
        (Symbol::new(env, "SessionRefunded"), session_id.clone()),
        (buyer.clone(), amount, env.ledger().timestamp()),
    );
}

/// Emit `AutoRefundExecuted(session_id, buyer, amount, completed_at, refunded_at)`.
///
/// The distinct event for timeout-based refunds: it carries both the moment the
/// seller marked the session complete and the moment the refund fired, so a
/// failed completion can be tracked without reading the session back. Both
/// times are ledger sequence numbers - the unit `Session::completed_at` uses,
/// not the ledger timestamp `SessionRefunded` carries - so
/// `refunded_at - completed_at` is exactly the number of ledgers the completion
/// sat past the dispute window.
pub fn emit_auto_refund_executed(
    env: &Env,
    session_id: &BytesN<32>,
    buyer: &Address,
    amount: i128,
    completed_at: u64,
) {
    env.events().publish(
        (Symbol::new(env, "AutoRefundExecuted"), session_id.clone()),
        (
            buyer.clone(),
            amount,
            completed_at,
            env.ledger().sequence() as u64,
        ),
    );
}

/// Emit `PlatformFeeUpdated(old_fee_bps, new_fee_bps, updated_by)`.
///
/// `updated_by` is the admin whose signature authorised the change, so an
/// off-chain monitor can attribute every fee change to an account without
/// replaying the transaction envelope. Both values are in basis points.
pub fn emit_platform_fee_updated(env: &Env, old_bps: u32, new_bps: u32, updated_by: &Address) {
    env.events().publish(
        (Symbol::new(env, "PlatformFeeUpdated"),),
        (old_bps, new_bps, updated_by.clone()),
    );
}

/// Emit `TreasuryUpdated(old_treasury, new_treasury, updated_by)`.
///
/// `updated_by` is the admin whose signature authorised the change, so an
/// off-chain monitor can attribute every treasury move to an account without
/// replaying the transaction envelope.
pub fn emit_treasury_updated(env: &Env, old: &Address, new: &Address, updated_by: &Address) {
    env.events().publish(
        (Symbol::new(env, "TreasuryUpdated"),),
        (old.clone(), new.clone(), updated_by.clone()),
    );
}

pub fn emit_dispute_window_updated(env: &Env, old_ledgers: u32, new_ledgers: u32) {
    env.events().publish(
        (Symbol::new(env, "DisputeWindowUpdated"),),
        (old_ledgers, new_ledgers),
    );
}

/// Emit `DisputeOpened(session_id, opened_by, reason, timestamp)`.
///
/// Records who opened the dispute and why, so indexers can surface the reason
/// without reading the session back.
pub fn emit_dispute_opened(env: &Env, session_id: &BytesN<32>, opened_by: &Address, reason: &String) {
    env.events().publish(
        (Symbol::new(env, "DisputeOpened"), session_id.clone()),
        (opened_by.clone(), reason.clone(), env.ledger().timestamp()),
    );
}

/// Emit `DisputeResolved(session_id, resolver, buyer_share, seller_share, fee, timestamp)`.
///
/// The closing event of a dispute: the shares are what each side actually
/// received, already net of the platform fee taken from that share, and `fee`
/// is the total fee the treasury received from both shares. So
/// `buyer_share + seller_share + fee` is exactly the amount that was escrowed
/// and the event shows the final distribution in full. `resolver` is the admin
/// whose signature settled the dispute; `timestamp` is the ledger timestamp of
/// the resolving ledger.
pub fn emit_dispute_resolved(
    env: &Env,
    session_id: &BytesN<32>,
    resolver: &Address,
    buyer_share: i128,
    seller_share: i128,
    fee: i128,
) {
    env.events().publish(
        (Symbol::new(env, "DisputeResolved"), session_id.clone()),
        (
            resolver.clone(),
            buyer_share,
            seller_share,
            fee,
            env.ledger().timestamp(),
        ),
    );
}

pub fn emit_insurance_purchased(
    env: &Env,
    session_id: &BytesN<32>,
    buyer: &Address,
    amount: i128,
    premium: i128,
) {
    env.events().publish(
        (Symbol::new(env, "InsurancePurchased"), session_id.clone()),
        (
            buyer.clone(),
            amount,
            premium,
            env.ledger().timestamp(),
        ),
    );
}

pub fn emit_insurance_claim_paid(
    env: &Env,
    session_id: &BytesN<32>,
    buyer: &Address,
    claim_amount: i128,
) {
    env.events().publish(
        (Symbol::new(env, "InsuranceClaimPaid"), session_id.clone()),
        (
            buyer.clone(),
            claim_amount,
            env.ledger().timestamp(),
        ),
    );
}

pub fn emit_insurance_premium_rate_updated(
    env: &Env,
    old_bps: u32,
    new_bps: u32,
    updated_by: &Address,
) {
    env.events().publish(
        (Symbol::new(env, "InsurancePremiumRateUpdated"),),
        (old_bps, new_bps, updated_by.clone()),
    );
}

pub fn emit_insurance_coverage_percentage_updated(
    env: &Env,
    old_pct: u32,
    new_pct: u32,
    updated_by: &Address,
) {
    env.events().publish(
        (Symbol::new(env, "InsuranceCoveragePercentageUpdated"),),
        (old_pct, new_pct, updated_by.clone()),
    );
}

pub fn emit_insurance_pool_updated(
    env: &Env,
    old_pool: Option<&Address>,
    new_pool: &Address,
    updated_by: &Address,
) {
    env.events().publish(
        (Symbol::new(env, "InsurancePoolUpdated"),),
        (old_pool.cloned(), new_pool.clone(), updated_by.clone()),
    );
}
