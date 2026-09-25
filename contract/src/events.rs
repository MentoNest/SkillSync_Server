use soroban_sdk::{symbol_short, Address, Env};

/// Emitted when the contract is successfully initialized.
///
/// Topics: ["initialized", admin, treasury]
pub fn emit_initialized(env: &Env, admin: &Address, treasury: &Address) {
    env.events().publish(
        (symbol_short!("init"), admin.clone(), treasury.clone()),
        (),
    );
}

/// Emitted when the platform fee is updated.
///
/// Topics: ["fee_updated", new_fee_bps]
pub fn emit_platform_fee_updated(env: &Env, new_fee_bps: u32) {
    env.events()
        .publish((symbol_short!("fee_upd"), new_fee_bps), ());
}
