use soroban_sdk::{symbol_long, Address, Env};

/// Emit `Initialized(admin, treasury)` — exactly once, from `initialize`.
///
/// The topic is a single symbol so indexers can subscribe to
/// `Initialized` directly; the data carries both addresses in call order.
pub fn emit_initialized(env: &Env, admin: &Address, treasury: &Address) {
    env.events().publish(
        (symbol_long!("Initialized"),),
        (admin.clone(), treasury.clone()),
    );
}
