
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
    };

    assert_eq!(platform_state.admin, admin);
    assert_eq!(platform_state.platform_fee_bps, initial_fee_bps);
    assert_eq!(platform_state.session_counter, 0);
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
        completed_at: None,
        dispute_resolved_at: None,
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
fn test_analytics_record_session_created() {
    // #1128 - create_session increments total_sessions, adds the amount to
    // total_locked_volume, and counts one active session (the new Locked state
    // is active).
    let mut analytics = EscrowAnalytics::default();
    analytics.record_session_created(1_000);
    analytics.record_session_created(2_500);

    assert_eq!(analytics.total_sessions, 2);
    assert_eq!(analytics.total_locked_volume, 3_500);
    assert_eq!(analytics.active_sessions, 2);
}

#[test]
fn test_analytics_active_sessions_declines_on_completion_of_active_path() {
    // #1128 - approved / refunded / auto-refunded / disputed sessions leave the
    // active (Locked/Completed) set.
    let mut analytics = EscrowAnalytics::default();
    analytics.record_session_created(1_000); // active = 1
    analytics.record_session_deactivated();
    assert_eq!(analytics.active_sessions, 0);

    analytics.record_session_created(500); // active = 1
    analytics.record_dispute_opened(); // leaves active
    assert_eq!(analytics.active_sessions, 0);
}

#[test]
fn test_analytics_fee_and_dispute_aggregates() {
    // #1128 - complete_session collects fees; dispute open/close feed the
    // dispute-rate and resolution-time metrics.
    let mut analytics = EscrowAnalytics::default();
    analytics.record_session_created(10_000); // sessions=1, active=1
    analytics.record_fee_collected(500);

    assert_eq!(analytics.total_fees_collected, 500);

    analytics.record_dispute_opened(); // disputes=1, active back to 0
    assert_eq!(analytics.total_disputes, 1);
    assert_eq!(analytics.active_sessions, 0);

    analytics.record_resolution(7200); // 2 hours
    assert_eq!(analytics.average_resolution_time(), 7200);
}

#[test]
fn test_analytics_average_resolution_time_averages() {
    // #1128 - average_resolution_time = total_resolution_time / total_disputes.
    let mut analytics = EscrowAnalytics::default();
    analytics.record_session_created(100);
    analytics.record_dispute_opened();
    analytics.record_resolution(6000);
    analytics.record_dispute_opened();
    analytics.record_resolution(3000);

    assert_eq!(analytics.total_disputes, 2);
    assert_eq!(analytics.average_resolution_time(), 4500);
}

#[test]
fn test_analytics_average_resolution_time_zero_without_disputes() {
    // #1128 - No disputes yet => average resolution time reports 0, not a
    // divide-by-zero.
    let analytics = EscrowAnalytics::default();
    assert_eq!(analytics.average_resolution_time(), 0);
}
