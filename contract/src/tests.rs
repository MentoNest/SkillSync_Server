
use super::*;
use soroban_sdk::{testutils::Address as _, Address, Env};

#[test]
fn test_initialize_and_get_treasury() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let initial_treasury = Address::generate(&env);

    // Mock the admin auth for initialization
    env.mock_all_auths();

    // Initialize the contract
    SkillSyncContract::initialize(env.clone(), admin.clone(), initial_treasury.clone());

    // Verify we can get the treasury
    let stored_treasury = SkillSyncContract::get_treasury(env.clone());
    assert_eq!(stored_treasury, initial_treasury);

    // Verify we can get the admin
    let stored_admin = SkillSyncContract::get_admin(env.clone());
    assert_eq!(stored_admin, admin);
}

#[test]
#[should_panic(expected = "Contract already initialized")]
fn test_cannot_initialize_twice() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let initial_treasury = Address::generate(&env);

    env.mock_all_auths();

    // First initialization
    SkillSyncContract::initialize(env.clone(), admin.clone(), initial_treasury.clone());
    // Second initialization should panic
    SkillSyncContract::initialize(env.clone(), admin, initial_treasury);
}

#[test]
fn test_set_treasury() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let initial_treasury = Address::generate(&env);
    let new_treasury = Address::generate(&env);

    env.mock_all_auths();

    // Initialize
    SkillSyncContract::initialize(env.clone(), admin.clone(), initial_treasury.clone());

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

    // Only mock admin auth, not non-admin
    env.mock_auths(&[&admin]);

    // Initialize
    SkillSyncContract::initialize(env.clone(), admin.clone(), initial_treasury.clone());

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

    env.mock_all_auths();

    // Initialize
    SkillSyncContract::initialize(env.clone(), admin.clone(), initial_treasury.clone());

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