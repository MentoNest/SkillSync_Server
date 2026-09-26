use soroban_sdk::{symbol_short, Address, BytesN, Env};

/// Emitted when the contract is successfully initialized.
///
/// Topics: ["initialized", admin, treasury]
pub fn emit_initialized(env: &Env, admin: &Address, treasury: &Address) {
    env.events().publish(
        (symbol_short!("init"), admin.clone(), treasury.clone()),
        (),
    );
}

/// Emitted when the contract is successfully initialized, including the
/// dispute window (BE Initialized event, issue #1265).
///
/// This is the canonical `Initialized` event once a `dispute_window`
/// concept exists in `initialize()` — see the issue's specified signature
/// `Initialized(admin, treasury, dispute_window)`. It's additive alongside
/// [`emit_initialized`] rather than replacing it, since `admin::initialize`
/// doesn't take a `dispute_window` parameter yet; wiring `admin::initialize`
/// to call this instead (once it does) is a one-line follow-up left for a
/// maintainer, out of scope for this single-file change.
///
/// Topics: ["initialized", admin, treasury]
/// Data: dispute_window
pub fn emit_initialized_with_dispute_window(
    env: &Env,
    admin: &Address,
    treasury: &Address,
    dispute_window: u32,
) {
    env.events().publish(
        (symbol_short!("init"), admin.clone(), treasury.clone()),
        dispute_window,
    );
}

/// Emitted when the platform fee is updated.
///
/// Topics: ["fee_updated", new_fee_bps]
pub fn emit_platform_fee_updated(env: &Env, new_fee_bps: u32) {
    env.events()
        .publish((symbol_short!("fee_upd"), new_fee_bps), ());
}

/// Emitted when the admin resolves a dispute, carrying the final
/// distribution: post-fee payouts to buyer and seller plus the total fee.
///
/// Topics: ["dis_res", session_id]
/// Data: (resolver, buyer_share, seller_share, fee, timestamp)
pub fn emit_dispute_resolved(
    env: &Env,
    session_id: &BytesN<32>,
    resolver: &Address,
    buyer_share: i128,
    seller_share: i128,
    fee: i128,
    timestamp: u64,
) {
    env.events().publish(
        (symbol_short!("dis_res"), session_id.clone()),
        (resolver.clone(), buyer_share, seller_share, fee, timestamp),
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::{Address as _, Events};
    use soroban_sdk::IntoVal;

    #[test]
    fn initialized_with_dispute_window_emits_expected_topics_and_data() {
        let env = Env::default();
        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);

        emit_initialized_with_dispute_window(&env, &admin, &treasury, 1_000);

        let events = env.events().all();
        assert_eq!(events.len(), 1);

        let (_contract_id, topics, data) = events.last().unwrap();
        assert_eq!(
            topics,
            (symbol_short!("init"), admin.clone(), treasury.clone()).into_val(&env)
        );
        assert_eq!(data, 1_000u32.into_val(&env));
    }

    #[test]
    fn auto_refund_executed_emits_expected_topics_and_data() {
        let env = Env::default();
        let contract_id = env.register(crate::SkillSyncContract, ());
        let session_id = BytesN::from_array(&env, &[7u8; 32]);
        let buyer = Address::generate(&env);

        env.as_contract(&contract_id, || {
            emit_auto_refund_executed(&env, &session_id, &buyer, 1_000, 100, 200);
        });

        let (emitter, topics, data) = env.events().all().last().unwrap();
        assert_eq!(emitter, contract_id);
        assert_eq!(
            topics,
            (symbol_short!("auto_ref"), session_id).into_val(&env)
        );
        let data: (Address, i128, u64, u64) = data.into_val(&env);
        assert_eq!(data, (buyer, 1_000, 100, 200));
    }
}
