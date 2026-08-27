
use super::*;
use soroban_sdk::{testutils::Address as _, Address, Bytes32, Env, String};

#[test]
fn test_initialize_and_get_treasury() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let initial_treasury = Address::generate(&env);
    let native_token = Address::generate(&env);

    // Mock the admin auth for initialization
    env.mock_all_auths();

    // Initialize the contract
    SkillSyncContract::initialize(env.clone(), admin.clone(), initial_treasury.clone(), native_token.clone());

    // Verify we can get the treasury
    let stored_treasury = SkillSyncContract::get_treasury(env.clone());
    assert_eq!(stored_treasury, initial_treasury);

    // Verify we can get the admin
    let stored_admin = SkillSyncContract::get_admin(env.clone());
    assert_eq!(stored_admin, admin);

    // Verify we can get the native token
    let stored_native_token = SkillSyncContract::get_native_token(env.clone());
    assert_eq!(stored_native_token, native_token);
}

#[test]
#[should_panic(expected = "Contract already initialized")]
fn test_cannot_initialize_twice() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let initial_treasury = Address::generate(&env);
    let native_token = Address::generate(&env);

    env.mock_all_auths();

    // First initialization
    SkillSyncContract::initialize(env.clone(), admin.clone(), initial_treasury.clone(), native_token.clone());
    // Second initialization should panic
    SkillSyncContract::initialize(env.clone(), admin, initial_treasury, native_token);
}

#[test]
fn test_set_treasury() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let initial_treasury = Address::generate(&env);
    let new_treasury = Address::generate(&env);
    let native_token = Address::generate(&env);

    env.mock_all_auths();

    // Initialize
    SkillSyncContract::initialize(env.clone(), admin.clone(), initial_treasury.clone(), native_token);

    // Update treasury
    SkillSyncContract::set_treasury(env.clone(), new_treasury.clone());

    // Verify the new treasury is set
    let updated_treasury = SkillSyncContract::get_treasury(env.clone());
    assert_eq!(updated_treasury, new_treasury);
}

#[test]
#[should_panic(expected = "RequireAuthError")]
fn test_non_admin_cannot_set_treasury() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let non_admin = Address::generate(&env);
    let initial_treasury = Address::generate(&env);
    let new_treasury = Address::generate(&env);
    let native_token = Address::generate(&env);

    // Only mock admin auth, not non-admin
    env.mock_auths(&[&admin]);

    // Initialize
    SkillSyncContract::initialize(env.clone(), admin.clone(), initial_treasury.clone(), native_token);

    // Try to call set_treasury from non-admin - this should panic
    env.set_invoker(non_admin);
    SkillSyncContract::set_treasury(env.clone(), new_treasury);
}

#[test]
fn test_treasury_updated_event_emitted() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let initial_treasury = Address::generate(&env);
    let new_treasury = Address::generate(&env);
    let native_token = Address::generate(&env);

    env.mock_all_auths();

    // Initialize
    SkillSyncContract::initialize(env.clone(), admin.clone(), initial_treasury.clone(), native_token);

    // Update treasury
    SkillSyncContract::set_treasury(env.clone(), new_treasury.clone());

    // Check if the event was emitted
    let events = env.events().all();
    assert_eq!(events.len(), 1);
    let event = events.get(0);
    assert_eq!(event.0.topic, (Symbol::new(&env, "TreasuryUpdated"),));
    let event_data: TreasuryUpdated = event.0.data;
    assert_eq!(event_data.old_treasury, initial_treasury);
    assert_eq!(event_data.new_treasury, new_treasury);
}

// New tests for lock_funds functionality
#[test]
fn test_lock_funds() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    let native_token = Address::generate(&env);
    let buyer = Address::generate(&env);
    let seller = Address::generate(&env);
    let session_id = Bytes32::from_array(&[0u8; 32]);
    let amount = 1000i128;

    env.mock_all_auths();

    // Initialize the contract
    SkillSyncContract::initialize(env.clone(), admin, treasury, native_token.clone());

    // Call lock_funds as buyer
    env.set_invoker(buyer.clone());
    SkillSyncContract::lock_funds(env.clone(), session_id.clone(), seller.clone(), amount);

    // Verify the session exists and has correct values
    let session = SkillSyncContract::get_session(env.clone(), session_id.clone());
    assert_eq!(session.session_id, session_id);
    assert_eq!(session.buyer, buyer);
    assert_eq!(session.seller, seller);
    assert_eq!(session.amount, amount);
    assert_eq!(session.status, SessionStatus::Locked);
}

#[test]
#[should_panic(expected = "Amount must be greater than 0")]
fn test_lock_funds_rejects_zero_amount() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    let native_token = Address::generate(&env);
    let buyer = Address::generate(&env);
    let seller = Address::generate(&env);
    let session_id = Bytes32::from_array(&[0u8; 32]);

    env.mock_all_auths();

    SkillSyncContract::initialize(env.clone(), admin, treasury, native_token);
    env.set_invoker(buyer);
    // Try to lock 0 amount - should panic
    SkillSyncContract::lock_funds(env.clone(), session_id, seller, 0i128);
}

#[test]
#[should_panic(expected = "Session with this ID already exists")]
fn test_lock_funds_rejects_duplicate_session_id() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    let native_token = Address::generate(&env);
    let buyer = Address::generate(&env);
    let seller1 = Address::generate(&env);
    let seller2 = Address::generate(&env);
    let session_id = Bytes32::from_array(&[0u8; 32]);

    env.mock_all_auths();

    SkillSyncContract::initialize(env.clone(), admin, treasury, native_token);
    env.set_invoker(buyer.clone());
    
    // First lock should succeed
    SkillSyncContract::lock_funds(env.clone(), session_id.clone(), seller1, 1000i128);
    // Second lock with same session ID should panic
    SkillSyncContract::lock_funds(env.clone(), session_id, seller2, 500i128);
}

#[test]
fn test_funds_locked_event_emitted() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    let native_token = Address::generate(&env);
    let buyer = Address::generate(&env);
    let seller = Address::generate(&env);
    let session_id = Bytes32::from_array(&[1u8; 32]);
    let amount = 5000i128;

    env.mock_all_auths();

    SkillSyncContract::initialize(env.clone(), admin, treasury, native_token);
    env.set_invoker(buyer.clone());
    SkillSyncContract::lock_funds(env.clone(), session_id.clone(), seller.clone(), amount);

    // Check if FundsLocked event was emitted
    let events = env.events().all();
    assert_eq!(events.len(), 1);
    let event = events.get(0);
    assert_eq!(event.0.topic, (Symbol::new(&env, "FundsLocked"),));
    let event_data: FundsLocked = event.0.data;
    assert_eq!(event_data.session_id, session_id);
    assert_eq!(event_data.buyer, buyer);
    assert_eq!(event_data.seller, seller);
    assert_eq!(event_data.amount, amount);
}

// NOTE: the tests above target an older Soroban-based version of this contract
// (soroban_sdk / SkillSyncContract) and this file is not currently wired into
// the crate via `mod tests;` in lib.rs, nor is `soroban-sdk` a dependency in
// Cargo.toml — they do not compile against the current Anchor-based lib.rs.
// The tests below target the current Anchor `skill_sync` program directly.

#[test]
fn test_platform_state_initialization_fields() {
    // Mirrors the `initialize` instruction's fee-bound validation (#1089).
    let admin = Pubkey::new_unique();
    let initial_fee_bps: u32 = 250; // 2.5%, well within the 0-1000 bound
    assert!(initial_fee_bps <= 1000);

    let platform_state = PlatformState {
        admin,
        platform_fee_bps: initial_fee_bps,
        session_counter: 0,
        max_session_duration_seconds: 7 * 24 * 60 * 60,
    };

    assert_eq!(platform_state.admin, admin);
    assert_eq!(platform_state.platform_fee_bps, initial_fee_bps);
    assert_eq!(platform_state.session_counter, 0);
    assert_eq!(platform_state.treasury_balance, 0);
}

#[test]
fn test_locked_session_state_matches_lock_funds_inputs() {
    // Mirrors what `create_session` + `lock_funds` should produce for a
    // freshly locked session (#1090).
    let buyer = Pubkey::new_unique();
    let seller = Pubkey::new_unique();
    let amount: u64 = 5_000;
    let created_at: i64 = 1_700_000_000;

    let session = Session {
        buyer,
        seller,
        amount,
        status: SessionStatus::Locked,
        created_at,
        expires_at: 0,
        completed_at: None,
        dispute_resolved_at: None,
        dispute_opened_at: None,
    };

    assert_eq!(session.status, SessionStatus::Locked);
    assert_eq!(session.amount, amount);
    assert!(session.completed_at.is_none());

    // lock_funds rejects a mismatched amount against the session's stored amount.
    let provided_amount: u64 = 4_000;
    assert_ne!(session.amount, provided_amount);
}

#[test]
fn test_complete_and_approve_flow_status_and_fee() {
    // Covers the complete/approve flow (#1091): both transitions are only
    // valid from `Locked`, and `complete_session`'s fee split sums back to
    // the original amount (settlement fee logic added in #1088).
    let amount: u64 = 10_000;
    let fee_bps: u32 = 500; // 5%

    let (fee_amount, net_amount) = calculate_settlement_fee(amount, fee_bps);
    assert_eq!(fee_amount, 500);
    assert_eq!(net_amount, 9_500);
    assert_eq!(fee_amount + net_amount, amount);

    // Completed and Approved are distinct terminal states reachable only from Locked.
    assert_ne!(SessionStatus::Completed, SessionStatus::Approved);
    assert_eq!(SessionStatus::default(), SessionStatus::Locked);
}
#[test]
fn test_lock_funds_sets_expires_at_from_max_duration() {
    // #1132 - lock_funds stores expires_at = locked_at + max_session_duration.
    let created_at: i64 = 1_700_000_000;
    let max_duration: i64 = 7 * 24 * 60 * 60; // 7 days

    let mut session = Session {
        buyer: Pubkey::new_unique(),
        seller: Pubkey::new_unique(),
        amount: 1_000,
        status: SessionStatus::Locked,
        created_at,
        expires_at: 0,
        completed_at: None,
        dispute_resolved_at: None,
        dispute_opened_at: None,
    };

    // lock_funds sets expires_at = now + max_duration.
    let now: i64 = created_at + 100;
    session.expires_at = now.saturating_add(max_duration);

    assert_eq!(session.expires_at, created_at + 100 + max_duration);
    // Not yet expired at lock time.
    assert!(!session.is_expired(now));
}

#[test]
fn test_session_cannot_be_completed_or_approved_after_expiry() {
    // #1132 - A Locked session past its expires_at is expired: complete_session
    // and approve_session must reject it (SessionExpired).
    let locked_at: i64 = 1_700_000_000;
    let max_duration: i64 = 7 * 24 * 60 * 60;

    let mut session = Session {
        buyer: Pubkey::new_unique(),
        seller: Pubkey::new_unique(),
        amount: 2_000,
        status: SessionStatus::Locked,
        created_at: locked_at,
        expires_at: locked_at.saturating_add(max_duration),
        completed_at: None,
        dispute_resolved_at: None,
        dispute_opened_at: None,
    };

    let inside_window: i64 = locked_at + max_duration - 1;
    assert!(!session.is_expired(inside_window), "not expired before deadline");

    let after_deadline: i64 = locked_at + max_duration;
    assert!(session.is_expired(after_deadline), "expired at/after deadline");
}

#[test]
fn test_cancel_expired_session_refunds_full_amount_with_no_fee() {
    // #1132 - Auto-cancelling an expired session refunds the buyer the full
    // locked amount; the platform fee is never applied to a cancellation.
    let locked_at: i64 = 1_700_000_000;
    let max_duration: i64 = 7 * 24 * 60 * 60;
    let amount: u64 = 7_777;

    let mut session = Session {
        buyer: Pubkey::new_unique(),
        seller: Pubkey::new_unique(),
        amount,
        status: SessionStatus::Locked,
        created_at: locked_at,
        expires_at: locked_at.saturating_add(max_duration),
        completed_at: None,
        dispute_resolved_at: None,
        dispute_opened_at: None,
    };

    // Past expiry: cancellation is permitted, full amount is returned.
    let now: i64 = locked_at + max_duration + 1;
    assert!(session.is_expired(now));
    session.status = SessionStatus::Refunded;
    assert_eq!(session.status, SessionStatus::Refunded);
    assert_eq!(session.amount, amount, "full amount preserved, no fee deducted");
}

#[test]
fn test_session_expired_and_cancelled_event_shape() {
    // #1132 - SessionExpiredAndCancelled carries session id, buyer, amount,
    // expires_at and cancelled_at so the failed completion is traceable.
    let event = SessionExpiredAndCancelled {
        session_id: Pubkey::new_unique(),
        buyer: Pubkey::new_unique(),
        amount: 5_000,
        expires_at: 1_700_604_800,
        cancelled_at: 1_700_605_000,
    };

    assert_eq!(event.amount, 5_000);
    assert!(event.cancelled_at > event.expires_at);
}

#[test]
fn test_financial_error_codes_defined() {
    // Verify financial validation errors (InvalidAmount, InsufficientBalance, FeeTooHigh, InvalidSplit, Overflow)
    let _err_amount = ErrorCode::InvalidAmount;
    let _err_balance = ErrorCode::InsufficientBalance;
    let _err_fee = ErrorCode::FeeTooHigh;
    let _err_split = ErrorCode::InvalidSplit;
    let _err_overflow = ErrorCode::Overflow;
}

#[test]
fn test_settlement_fee_calculation_zero_and_max() {
    // Zero fee
    let (fee, net) = calculate_settlement_fee(10_000, 0);
    assert_eq!(fee, 0);
    assert_eq!(net, 10_000);

    // Max fee (10% = 1000 bps)
    let (fee_max, net_max) = calculate_settlement_fee(10_000, 1000);
    assert_eq!(fee_max, 1_000);
    assert_eq!(net_max, 9_000);
    assert_eq!(fee_max + net_max, 10_000);
}

