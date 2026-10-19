use soroban_sdk::{Address, BytesN, Env, String, Symbol};

/// Emit `Initialized(admin, treasury)` - exactly once, from `initialize`.
pub fn emit_initialized(env: &Env, admin: &Address, treasury: &Address) {
    env.events().publish(
        (Symbol::new(env, "Initialized"),),
        (admin.clone(), treasury.clone()),
    );
}

pub fn emit_contract_upgraded(env: &Env, old_hash: &BytesN<32>, new_hash: &BytesN<32>) {
    env.events().publish(
        (Symbol::new(env, "ContractUpgraded"),),
        (old_hash.clone(), new_hash.clone()),
    );
}

pub fn emit_funds_locked(
    env: &Env,
    session_id: &BytesN<32>,
    buyer: &Address,
    seller: &Address,
    amount: i128,
) {
    env.events().publish(
        (Symbol::new(env, "FundsLocked"), session_id.clone()),
        (buyer.clone(), seller.clone(), amount),
    );
}

pub fn emit_session_completed(env: &Env, session_id: &BytesN<32>, seller: &Address) {
    env.events().publish(
        (Symbol::new(env, "SessionCompleted"), session_id.clone()),
        seller.clone(),
    );
}

pub fn emit_session_approved(env: &Env, session_id: &BytesN<32>, payout: i128, fee: i128) {
    env.events().publish(
        (Symbol::new(env, "SessionApproved"), session_id.clone()),
        (payout, fee),
    );
}

pub fn emit_session_refunded(env: &Env, session_id: &BytesN<32>, amount: i128) {
    env.events().publish(
        (Symbol::new(env, "SessionRefunded"), session_id.clone()),
        amount,
    );
}

pub fn emit_auto_refund_executed(env: &Env, session_id: &BytesN<32>, amount: i128) {
    env.events().publish(
        (Symbol::new(env, "AutoRefundExecuted"), session_id.clone()),
        amount,
    );
}

pub fn emit_platform_fee_updated(env: &Env, old_bps: u32, new_bps: u32) {
    env.events().publish(
        (Symbol::new(env, "PlatformFeeUpdated"),),
        (old_bps, new_bps),
    );
}

pub fn emit_treasury_updated(env: &Env, old: &Address, new: &Address) {
    env.events().publish(
        (Symbol::new(env, "TreasuryUpdated"),),
        (old.clone(), new.clone()),
    );
}

pub fn emit_dispute_window_updated(env: &Env, old_ledgers: u32, new_ledgers: u32) {
    env.events().publish(
        (Symbol::new(env, "DisputeWindowUpdated"),),
        (old_ledgers, new_ledgers),
    );
}

pub fn emit_dispute_opened(env: &Env, session_id: &BytesN<32>, opened_by: &Address, reason: &String) {
    env.events().publish(
        (Symbol::new(env, "DisputeOpened"), session_id.clone()),
        (opened_by.clone(), reason.clone()),
    );
}

pub fn emit_dispute_resolved(
    env: &Env,
    session_id: &BytesN<32>,
    resolution: u32,
    buyer_payout: i128,
    seller_payout: i128,
    fee: i128,
) {
    env.events().publish(
        (Symbol::new(env, "DisputeResolved"), session_id.clone()),
        (resolution, buyer_payout, seller_payout, fee),
    );
}
