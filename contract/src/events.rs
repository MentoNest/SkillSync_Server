use soroban_sdk::{symbol_short, Address, Bytes, BytesN, Env};

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

/// Emitted when funds are escrowed for a newly created session.
///
/// Topics: ["fnd_lock", session_id]
/// Data: (buyer, seller, amount, timestamp)
pub fn emit_funds_locked(
    env: &Env,
    session_id: &Bytes,
    buyer: &Address,
    seller: &Address,
    amount: i128,
) {
    env.events().publish(
        (symbol_short!("fnd_lock"), session_id.clone()),
        (buyer.clone(), seller.clone(), amount, env.ledger().timestamp()),
    );
}

/// Emitted when the seller marks a session complete, opening the dispute
/// window.
///
/// Topics: ["sess_done", session_id]
/// Data: (seller, completed_at)
pub fn emit_session_completed(env: &Env, session_id: &Bytes, seller: &Address, completed_at: u64) {
    env.events().publish(
        (symbol_short!("sess_done"), session_id.clone()),
        (seller.clone(), completed_at),
    );
}

/// Emitted when the buyer approves a completed session and the escrow is
/// settled into a seller payout plus a platform fee.
///
/// Topics: ["sess_appr", session_id]
/// Data: (seller, payout, fee, treasury)
pub fn emit_session_approved(
    env: &Env,
    session_id: &Bytes,
    seller: &Address,
    payout: i128,
    fee: i128,
    treasury: Option<Address>,
) {
    env.events().publish(
        (symbol_short!("sess_appr"), session_id.clone()),
        (seller.clone(), payout, fee, treasury),
    );
}

/// Emitted when a session is refunded to the buyer in full.
///
/// Topics: ["sess_ref", session_id]
/// Data: (buyer, amount, timestamp)
pub fn emit_session_refunded(
    env: &Env,
    session_id: &Bytes,
    buyer: &Address,
    amount: i128,
) {
    env.events().publish(
        (symbol_short!("sess_ref"), session_id.clone()),
        (buyer.clone(), amount, env.ledger().timestamp()),
    );
}

/// Emitted when either party opens a dispute on a session.
///
/// Topics: ["dis_open", session_id]
/// Data: (opener, reason, timestamp)
pub fn emit_dispute_opened(
    env: &Env,
    session_id: &BytesN<32>,
    opener: &Address,
    reason: &soroban_sdk::String,
    timestamp: u64,
) {
    env.events().publish(
        (symbol_short!("dis_open"), session_id.clone()),
        (opener.clone(), reason.clone(), timestamp),
    );
}

/// Emitted when the dispute window lapses and the escrow is auto-refunded to
/// the buyer without any human intervention.
///
/// Topics: ["auto_ref", session_id]
/// Data: (buyer, amount, ledgers_waited, window)
pub fn emit_auto_refund_executed(
    env: &Env,
    session_id: &BytesN<32>,
    buyer: &Address,
    amount: i128,
    ledgers_waited: u64,
    window: u64,
) {
    env.events().publish(
        (symbol_short!("auto_ref"), session_id.clone()),
        (buyer.clone(), amount, ledgers_waited, window),
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
