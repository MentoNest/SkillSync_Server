#![cfg(test)]
use super::*;
use soroban_sdk::{testutils::{Address as _, MockAuth, MockAuthInvoke}, vec, Env, IntoVal};
use soroban_sdk::token::{Client as TokenClient, StellarAssetClient};

use super::{Contract, ContractClient, SessionState};
use soroban_sdk::{testutils::Address as _, Address, Env};

fn setup(env: &Env) -> (ContractClient, Address, Address, Address) {
    let id = env.register(Contract, ());
    let client = ContractClient::new(env, &id);
    let buyer = Address::generate(env);
    let seller = Address::generate(env);
    let admin = Address::generate(env);
    client.init(&buyer, &seller, &100_i128);
    (client, buyer, seller, admin)
}

#[test]
fn test_buyer_opens_dispute_after_complete() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, ..) = setup(&env);
    client.lock();
    client.complete();
    client.dispute();
    assert!(matches!(client.get_state(), SessionState::Disputed));
}

#[test]
fn test_resolve_buyer_100_pct() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, _, admin) = setup(&env);
    client.lock();
    client.dispute();
    client.resolve(&admin, &100_u32);
    assert!(matches!(client.get_state(), SessionState::Refunded));
}

#[test]
fn test_resolve_seller_100_pct() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, _, admin) = setup(&env);
    client.lock();
    client.dispute();
    client.resolve(&admin, &0_u32);
    assert!(matches!(client.get_state(), SessionState::Refunded));
}

#[test]
fn test_split_resolution() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _, _, admin) = setup(&env);
    client.lock();
    client.dispute();
    client.resolve(&admin, &50_u32);
    assert!(matches!(client.get_state(), SessionState::Refunded));
fn setup() -> (Env, Address, Address, Address, Address, Address) {
use soroban_sdk::{testutils::Address as _, Env};
use soroban_sdk::{testutils::{Address as _, Ledger}, Env};
use soroban_sdk::token::{Client as TokenClient, StellarAssetClient};

fn setup() -> (Env, Address, Address, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let buyer = Address::generate(&env);
    let seller = Address::generate(&env);
    let treasury = Address::generate(&env);
    let token_id = env.register_stellar_asset_contract_v2(admin.clone()).address();
    StellarAssetClient::new(&env, &token_id).mint(&buyer, &1000);
    (env, buyer, seller, treasury, token_id, admin)
}

#[test]
fn test_lock_funds_success() {
    let (env, buyer, seller, _, token_id, _) = setup();
    let contract_id = env.register(EscrowContract, ());
    let client = EscrowContractClient::new(&env, &contract_id);
    client.lock_funds(&1, &buyer, &seller, &500, &token_id);
    let s = client.get_session(&1);
    assert_eq!(s.state, SessionState::Locked);
    assert_eq!(TokenClient::new(&env, &token_id).balance(&contract_id), 500);
}

#[test]
#[should_panic]
fn test_lock_funds_zero_amount_reverts() {
    let (env, buyer, seller, _, token_id, _) = setup();
    let client = EscrowContractClient::new(&env, &env.register(EscrowContract, ()));
    client.lock_funds(&1, &buyer, &seller, &0, &token_id);
}

#[test]
#[should_panic]
fn test_lock_funds_duplicate_session_reverts() {
    let (env, buyer, seller, _, token_id, _) = setup();
    let client = EscrowContractClient::new(&env, &env.register(EscrowContract, ()));
    client.lock_funds(&1, &buyer, &seller, &100, &token_id);
    client.lock_funds(&1, &buyer, &seller, &100, &token_id);
}
    let token_id = env.register_stellar_asset_contract_v2(admin).address();
    StellarAssetClient::new(&env, &token_id).mint(&buyer, &1000);
    (env, buyer, seller, treasury, token_id)
}

#[test]
fn test_complete_and_approve_happy_path() {
    let (env, buyer, seller, treasury, token_id) = setup();
    let cid = env.register(EscrowContract, ());
    let client = EscrowContractClient::new(&env, &cid);
    client.lock_funds(&1, &buyer, &seller, &1000, &token_id);
    client.complete(&1);
    assert_eq!(client.get_session(&1).state, SessionState::Completed);
    client.approve(&1, &token_id, &500, &treasury); // 5% fee
    let s = client.get_session(&1);
    assert_eq!(s.state, SessionState::Approved);
    assert_eq!(TokenClient::new(&env, &token_id).balance(&seller), 950);
    assert_eq!(TokenClient::new(&env, &token_id).balance(&treasury), 50);
}

#[test]
#[should_panic]
fn test_seller_cannot_complete_before_lock() {
    let (env, buyer, seller, _, token_id) = setup();
    let client = EscrowContractClient::new(&env, &env.register(EscrowContract, ()));
    // No lock — complete should panic (session not found)
    client.complete(&99);
}

#[test]
#[should_panic]
fn test_buyer_cannot_approve_before_complete() {
    let (env, buyer, seller, treasury, token_id) = setup();
    let client = EscrowContractClient::new(&env, &env.register(EscrowContract, ()));
    client.lock_funds(&1, &buyer, &seller, &500, &token_id);
    client.approve(&1, &token_id, &0, &treasury); // not completed yet
}

#[test]
fn test_buyer_can_refund_before_complete() {
    let (env, buyer, seller, _, token_id) = setup();
    let cid = env.register(EscrowContract, ());
    let client = EscrowContractClient::new(&env, &cid);
    client.lock_funds(&1, &buyer, &seller, &600, &token_id);
    client.refund(&1, &token_id);
    assert_eq!(TokenClient::new(&env, &token_id).balance(&buyer), 1000);
    assert_eq!(client.get_session(&1).state, SessionState::Refunded);
}

#[test]
#[should_panic]
fn test_refund_reverts_if_already_completed() {
    let (env, buyer, seller, treasury, token_id) = setup();
    let client = EscrowContractClient::new(&env, &env.register(EscrowContract, ()));
    client.lock_funds(&1, &buyer, &seller, &500, &token_id);
    client.complete(&1);
    client.refund(&1, &token_id); // should panic — not Locked
}

#[test]
#[should_panic]
fn test_refund_reverts_if_already_approved() {
    let (env, buyer, seller, treasury, token_id) = setup();
    let client = EscrowContractClient::new(&env, &env.register(EscrowContract, ()));
    client.lock_funds(&1, &buyer, &seller, &500, &token_id);
    client.complete(&1);
    client.approve(&1, &token_id, &0, &treasury);
    client.refund(&1, &token_id); // should panic — not Locked
}

#[test]
fn test_auto_refund_after_window() {
    let (env, buyer, seller, _, token_id) = setup();
    let cid = env.register(EscrowContract, ());
    let client = EscrowContractClient::new(&env, &cid);
    client.lock_funds(&1, &buyer, &seller, &800, &token_id);
    client.complete(&1);
    env.ledger().set_timestamp(env.ledger().timestamp() + DISPUTE_WINDOW + 1);
    client.auto_refund(&1, &token_id);
    assert_eq!(client.get_session(&1).state, SessionState::AutoRefunded);
    assert_eq!(TokenClient::new(&env, &token_id).balance(&buyer), 1000);
}

#[test]
#[should_panic]
fn test_auto_refund_before_window_reverts() {
    let (env, buyer, seller, _, token_id) = setup();
    let client = EscrowContractClient::new(&env, &env.register(EscrowContract, ()));
    client.lock_funds(&1, &buyer, &seller, &500, &token_id);
    client.complete(&1);
    // Do NOT advance time — should panic
    client.auto_refund(&1, &token_id);
}

#[test]
#[should_panic]
fn test_approve_after_auto_refund_reverts() {
    let (env, buyer, seller, treasury, token_id) = setup();
    let client = EscrowContractClient::new(&env, &env.register(EscrowContract, ()));
    client.lock_funds(&1, &buyer, &seller, &500, &token_id);
    client.complete(&1);
    env.ledger().set_timestamp(env.ledger().timestamp() + DISPUTE_WINDOW + 1);
    client.auto_refund(&1, &token_id);
    client.approve(&1, &token_id, &0, &treasury); // should panic — not Completed
}
/// Spin up a fresh env + freshly-registered contract instance for each test.
fn setup<'a>() -> (Env, ContractClient<'a>) {
    let env = Env::default();
    let contract_id = env.register(Contract, ());
    let client = ContractClient::new(&env, &contract_id);
    (env, client)
}

// ---------------------------------------------------------------------------
// Existing smoke test (kept to guarantee the contract still wires up).
// ---------------------------------------------------------------------------

#[test]
fn hello_returns_greeting() {
    let (env, client) = setup();
    let words = client.hello(&String::from_str(&env, "Dev"));
    assert_eq!(
        words,
        vec![
            &env,
            String::from_str(&env, "Hello"),
            String::from_str(&env, "Dev"),
        ]
    );
}

// ---------------------------------------------------------------------------
// Fee calculation tests
// Acceptance criteria from the task description.
// ---------------------------------------------------------------------------

/// AC: Fee = 0 bps -> seller receives the full amount, treasury gets nothing.
#[test]
fn fee_zero_bps_seller_receives_full_amount() {
    let (_env, client) = setup();

    let split = client.calculate_fee(&1_000, &0);

    assert_eq!(split.seller_amount, 1_000);
    assert_eq!(split.treasury_amount, 0);
    assert_eq!(split.seller_amount + split.treasury_amount, 1_000);
}

/// AC: Fee = 1000 bps (10%) -> seller receives 90%, treasury receives 10%.
#[test]
fn fee_1000_bps_seller_receives_ninety_percent() {
    let (_env, client) = setup();

    let split = client.calculate_fee(&1_000, &1_000);

    assert_eq!(split.seller_amount, 900);
    assert_eq!(split.treasury_amount, 100);
    assert_eq!(split.seller_amount + split.treasury_amount, 1_000);
}

/// AC: Odd amounts (e.g. 1234 amount, 123 bps) round DOWN to the smallest unit.
/// 1234 * 123 / 10_000 = 151_782 / 10_000 = 15 (truncated from 15.1782).
#[test]
fn fee_with_odd_amount_rounds_down_to_smallest_unit() {
    let (_env, client) = setup();

    let split = client.calculate_fee(&1234, &123);

    assert_eq!(split.treasury_amount, 15, "treasury must round down");
    assert_eq!(split.seller_amount, 1234 - 15);
    // No value is ever lost: seller + treasury == amount.
    assert_eq!(split.seller_amount + split.treasury_amount, 1234);
}

/// Additional rounding spot-checks across a few odd combinations.
#[test]
fn fee_rounding_behaviour_is_consistent() {
    let (_env, client) = setup();

    // 1 * 9999 / 10_000 = 0  (sub-unit fee rounds down to 0)
    let s = client.calculate_fee(&1, &9_999);
    assert_eq!(s.treasury_amount, 0);
    assert_eq!(s.seller_amount, 1);

    // 9_999 * 1 / 10_000 = 0  (rounds down to 0)
    let s = client.calculate_fee(&9_999, &1);
    assert_eq!(s.treasury_amount, 0);
    assert_eq!(s.seller_amount, 9_999);

    // 12_345 * 333 / 10_000 = 4_110_885 / 10_000 = 411 (truncated from 411.08...)
    let s = client.calculate_fee(&12_345, &333);
    assert_eq!(s.treasury_amount, 411);
    assert_eq!(s.seller_amount, 12_345 - 411);
}

/// AC: Fee never exceeds amount.
/// Verified by:
///   - explicit 100% boundary case (max_bps -> treasury == amount, seller == 0)
///   - sweep across many bps values to confirm the invariant holds
///   - explicit rejection of out-of-range fee_bps (> 10_000)
#[test]
fn fee_never_exceeds_amount() {
    let (_env, client) = setup();

    // 100% fee: treasury takes everything, seller takes nothing.
    let max_fee = client.calculate_fee(&1_000, &10_000);
    assert_eq!(max_fee.treasury_amount, 1_000);
    assert_eq!(max_fee.seller_amount, 0);

    // Invariant sweep across the valid bps range and a few sample amounts.
    let bps_samples: [u32; 11] = [
        0, 1, 50, 250, 999, 1_000, 4_999, 5_000, 7_500, 9_999, 10_000,
    ];
    let amount_samples: [i128; 5] = [1, 7, 1_234, 9_999, 1_000_000_000];

    for amount in amount_samples {
        for bps in bps_samples {
            let split = client.calculate_fee(&amount, &bps);
            assert!(
                split.treasury_amount <= amount,
                "treasury {} exceeded amount {} at bps {}",
                split.treasury_amount,
                amount,
                bps,
            );
            assert!(
                split.seller_amount >= 0,
                "seller went negative at amount {} bps {}",
                amount,
                bps,
            );
            assert_eq!(
                split.seller_amount + split.treasury_amount,
                amount,
                "split must conserve amount (amount {}, bps {})",
                amount,
                bps,
            );
        }
    }
}

/// Out-of-range fee_bps must be rejected so a fee can never exceed `amount`.
#[test]
#[should_panic(expected = "fee_bps must not exceed 10000")]
fn fee_bps_above_max_is_rejected() {
    let (_env, client) = setup();
    client.calculate_fee(&1_000, &10_001);
}

/// Negative amounts are rejected.
#[test]
#[should_panic(expected = "amount must be non-negative")]
fn negative_amount_is_rejected() {
    let (_env, client) = setup();
    client.calculate_fee(&-1, &100);
}

/// AC: Treasury balance accumulates correctly over multiple sessions.
#[test]
fn treasury_balance_accumulates_across_multiple_sessions() {
    let (_env, client) = setup();

    // Fresh contract starts with an empty treasury.
    assert_eq!(client.treasury_balance(), 0);

    // Session 1: 1000 @ 250 bps (2.5%) -> treasury 25, seller 975.
    let s1 = client.settle_session(&1_000, &250);
    assert_eq!(s1.treasury_amount, 25);
    assert_eq!(s1.seller_amount, 975);
    assert_eq!(client.treasury_balance(), 25);

    // Session 2: 1234 @ 123 bps -> treasury 15 (rounded down), seller 1219.
    let s2 = client.settle_session(&1_234, &123);
    assert_eq!(s2.treasury_amount, 15);
    assert_eq!(s2.seller_amount, 1_219);
    assert_eq!(client.treasury_balance(), 25 + 15);

    // Session 3: 500 @ 1000 bps (10%) -> treasury 50, seller 450.
    let s3 = client.settle_session(&500, &1_000);
    assert_eq!(s3.treasury_amount, 50);
    assert_eq!(s3.seller_amount, 450);
    assert_eq!(client.treasury_balance(), 25 + 15 + 50);

    // Session 4: 999 @ 0 bps -> treasury unchanged, seller gets everything.
    let s4 = client.settle_session(&999, &0);
    assert_eq!(s4.treasury_amount, 0);
    assert_eq!(s4.seller_amount, 999);
    assert_eq!(client.treasury_balance(), 25 + 15 + 50);

    // Session 5: 200 @ 10_000 bps (100%) -> entire amount goes to treasury.
    let s5 = client.settle_session(&200, &10_000);
    assert_eq!(s5.treasury_amount, 200);
    assert_eq!(s5.seller_amount, 0);
    assert_eq!(client.treasury_balance(), 25 + 15 + 50 + 200);
}

/// Treasury balances are isolated per contract instance.
#[test]
fn treasury_balance_is_isolated_per_contract_instance() {
    let env = Env::default();

    let id_a = env.register(Contract, ());
    let id_b = env.register(Contract, ());
    let client_a = ContractClient::new(&env, &id_a);
    let client_b = ContractClient::new(&env, &id_b);

    client_a.settle_session(&1_000, &500); // treasury_a += 50
    client_a.settle_session(&2_000, &250); // treasury_a += 50

    assert_eq!(client_a.treasury_balance(), 100);
    assert_eq!(
        client_b.treasury_balance(),
        0,
        "instance B must not see instance A's treasury"
    );
}
