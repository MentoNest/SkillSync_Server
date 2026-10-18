use soroban_sdk::{Address, BytesN, Env, Symbol};

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
