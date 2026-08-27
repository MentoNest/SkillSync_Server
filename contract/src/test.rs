#![cfg(test)]
use super::*;
use soroban_sdk::{testutils::Address as _, Env, Address, IntoVal, Symbol};

// ============================================================================
// Single Session Escrow Contract Tests
// ============================================================================

mod test_single_session {
    use super::super::{Contract, ContractClient, SingleSessionState as SessionState};
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
    fn test_lock_complete_approve() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, ..) = setup(&env);
        client.lock();
        assert!(matches!(client.get_state(), SessionState::Locked));
        client.complete();
        assert!(matches!(client.get_state(), SessionState::Completed));
        client.approve();
        assert!(matches!(client.get_state(), SessionState::Pending));
    }

    #[test]
    fn test_refund_path() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, ..) = setup(&env);
        client.lock();
        client.refund();
        assert!(matches!(client.get_state(), SessionState::Refunded));
    }

    #[test]
    fn test_dispute_and_resolve() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, _, _, admin) = setup(&env);
        client.lock();
        client.complete();
        client.dispute();
        assert!(matches!(client.get_state(), SessionState::Disputed));
        client.resolve(&admin, &50_u32);
        assert!(matches!(client.get_state(), SessionState::Refunded));
    }

    #[test]
    fn test_initial_state_is_pending() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, ..) = setup(&env);
        assert!(matches!(client.get_state(), SessionState::Pending));
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
    }
}

// ============================================================================
// Multi Session Escrow Contract Tests
// ============================================================================

mod test_multi_session {
    use super::super::{EscrowContract, EscrowContractClient, SessionState, DISPUTE_WINDOW};
    use soroban_sdk::{testutils::{Address as _, Ledger}, Env, Address, IntoVal, Symbol};
    use soroban_sdk::token::{Client as TokenClient, StellarAssetClient};

    fn setup() -> (Env, Address, Address, Address, Address, Address) {
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
        let (env, buyer, seller, treasury, token_id, admin) = setup();
        let contract_id = env.register(EscrowContract, ());
        let client = EscrowContractClient::new(&env, &contract_id);
        client.initialize(&admin, &treasury);
        client.lock_funds(&1, &buyer, &seller, &500, &token_id);
        let s = client.get_session(&1);
        assert!(matches!(s.state, SessionState::Locked));
        assert_eq!(TokenClient::new(&env, &token_id).balance(&contract_id), 500);
    }

    #[test]
    #[should_panic]
    fn test_lock_funds_zero_amount_reverts() {
        let (env, buyer, seller, treasury, token_id, admin) = setup();
        let client = EscrowContractClient::new(&env, &env.register(EscrowContract, ()));
        client.initialize(&admin, &treasury);
        client.lock_funds(&1, &buyer, &seller, &0, &token_id);
    }

    #[test]
    #[should_panic]
    fn test_lock_funds_duplicate_session_reverts() {
        let (env, buyer, seller, treasury, token_id, admin) = setup();
        let client = EscrowContractClient::new(&env, &env.register(EscrowContract, ()));
        client.initialize(&admin, &treasury);
        client.lock_funds(&1, &buyer, &seller, &100, &token_id);
        client.lock_funds(&1, &buyer, &seller, &100, &token_id);
    }

    #[test]
    fn test_complete_and_approve_happy_path() {
        let (env, buyer, seller, treasury, token_id, admin) = setup();
        let cid = env.register(EscrowContract, ());
        let client = EscrowContractClient::new(&env, &cid);
        client.initialize(&admin, &treasury);
        
        // Admin sets platform fee to 500 bps (5%)
        client.set_platform_fee(&500);
        assert_eq!(client.get_platform_fee(), 500);
        
        client.lock_funds(&1, &buyer, &seller, &1000, &token_id);
        client.complete(&1);
        assert!(matches!(client.get_session(&1).state, SessionState::Completed));
        
        client.approve(&1, &token_id);
        let s = client.get_session(&1);
        assert!(matches!(s.state, SessionState::Approved));
        assert_eq!(TokenClient::new(&env, &token_id).balance(&seller), 950);
        assert_eq!(TokenClient::new(&env, &token_id).balance(&treasury), 50);
    }

    #[test]
    #[should_panic]
    fn test_seller_cannot_complete_before_lock() {
        let (env, buyer, seller, treasury, token_id, admin) = setup();
        let client = EscrowContractClient::new(&env, &env.register(EscrowContract, ()));
        client.initialize(&admin, &treasury);
        client.complete(&99);
    }

    #[test]
    #[should_panic]
    fn test_buyer_cannot_approve_before_complete() {
        let (env, buyer, seller, treasury, token_id, admin) = setup();
        let client = EscrowContractClient::new(&env, &env.register(EscrowContract, ()));
        client.initialize(&admin, &treasury);
        client.lock_funds(&1, &buyer, &seller, &500, &token_id);
        client.approve(&1, &token_id); // not completed yet
    }

    #[test]
    fn test_buyer_can_refund_before_complete() {
        let (env, buyer, seller, treasury, token_id, admin) = setup();
        let cid = env.register(EscrowContract, ());
        let client = EscrowContractClient::new(&env, &cid);
        client.initialize(&admin, &treasury);
        client.lock_funds(&1, &buyer, &seller, &600, &token_id);
        client.refund(&1, &token_id);
        assert_eq!(TokenClient::new(&env, &token_id).balance(&buyer), 1000);
        assert!(matches!(client.get_session(&1).state, SessionState::Refunded));
    }

    #[test]
    #[should_panic]
    fn test_refund_reverts_if_already_completed() {
        let (env, buyer, seller, treasury, token_id, admin) = setup();
        let client = EscrowContractClient::new(&env, &env.register(EscrowContract, ()));
        client.initialize(&admin, &treasury);
        client.lock_funds(&1, &buyer, &seller, &500, &token_id);
        client.complete(&1);
        client.refund(&1, &token_id); // should panic — not Locked
    }

    #[test]
    #[should_panic]
    fn test_refund_reverts_if_already_approved() {
        let (env, buyer, seller, treasury, token_id, admin) = setup();
        let client = EscrowContractClient::new(&env, &env.register(EscrowContract, ()));
        client.initialize(&admin, &treasury);
        client.lock_funds(&1, &buyer, &seller, &500, &token_id);
        client.complete(&1);
        client.approve(&1, &token_id);
        client.refund(&1, &token_id); // should panic — not Locked
    }

    #[test]
    fn test_auto_refund_after_window() {
        let (env, buyer, seller, treasury, token_id, admin) = setup();
        let cid = env.register(EscrowContract, ());
        let client = EscrowContractClient::new(&env, &cid);
        client.initialize(&admin, &treasury);
        client.lock_funds(&1, &buyer, &seller, &800, &token_id);
        client.complete(&1);
        env.ledger().set_timestamp(env.ledger().timestamp() + DISPUTE_WINDOW + 1);
        client.auto_refund(&1, &token_id);
        assert!(matches!(client.get_session(&1).state, SessionState::AutoRefunded));
        assert_eq!(TokenClient::new(&env, &token_id).balance(&buyer), 1000);
    }

    #[test]
    #[should_panic]
    fn test_auto_refund_before_window_reverts() {
        let (env, buyer, seller, treasury, token_id, admin) = setup();
        let client = EscrowContractClient::new(&env, &env.register(EscrowContract, ()));
        client.initialize(&admin, &treasury);
        client.lock_funds(&1, &buyer, &seller, &500, &token_id);
        client.complete(&1);
        // Do NOT advance time — should panic
        client.auto_refund(&1, &token_id);
    }

    #[test]
    #[should_panic]
    fn test_approve_after_auto_refund_reverts() {
        let (env, buyer, seller, treasury, token_id, admin) = setup();
        let client = EscrowContractClient::new(&env, &env.register(EscrowContract, ()));
        client.initialize(&admin, &treasury);
        client.lock_funds(&1, &buyer, &seller, &500, &token_id);
        client.complete(&1);
        env.ledger().set_timestamp(env.ledger().timestamp() + DISPUTE_WINDOW + 1);
        client.auto_refund(&1, &token_id);
        client.approve(&1, &token_id); // should panic — not Completed
    }

    fn setup_fresh_client<'a>() -> (Env, EscrowContractClient<'a>) {
        let env = Env::default();
        let contract_id = env.register(EscrowContract, ());
        let client = EscrowContractClient::new(&env, &contract_id);
        (env, client)
    }

    #[test]
    fn fee_zero_bps_seller_receives_full_amount() {
        let (_env, client) = setup_fresh_client();
        let split = client.calculate_fee(&1_000, &0);
        assert_eq!(split.seller_amount, 1_000);
        assert_eq!(split.treasury_amount, 0);
        assert_eq!(split.seller_amount + split.treasury_amount, 1_000);
    }

    #[test]
    fn fee_1000_bps_seller_receives_ninety_percent() {
        let (_env, client) = setup_fresh_client();
        let split = client.calculate_fee(&1_000, &1_000);
        assert_eq!(split.seller_amount, 900);
        assert_eq!(split.treasury_amount, 100);
        assert_eq!(split.seller_amount + split.treasury_amount, 1_000);
    }

    #[test]
    fn fee_with_odd_amount_rounds_down_to_smallest_unit() {
        let (_env, client) = setup_fresh_client();
        let split = client.calculate_fee(&1234, &123);
        assert_eq!(split.treasury_amount, 15, "treasury must round down");
        assert_eq!(split.seller_amount, 1234 - 15);
        assert_eq!(split.seller_amount + split.treasury_amount, 1234);
    }

    #[test]
    fn fee_rounding_behaviour_is_consistent() {
        let (_env, client) = setup_fresh_client();
        let s = client.calculate_fee(&1, &9_999);
        assert_eq!(s.treasury_amount, 0);
        assert_eq!(s.seller_amount, 1);

        let s = client.calculate_fee(&9_999, &1);
        assert_eq!(s.treasury_amount, 0);
        assert_eq!(s.seller_amount, 9_999);

        let s = client.calculate_fee(&12_345, &333);
        assert_eq!(s.treasury_amount, 411);
        assert_eq!(s.seller_amount, 12_345 - 411);
    }

    #[test]
    fn fee_never_exceeds_amount() {
        let (_env, client) = setup_fresh_client();
        let max_fee = client.calculate_fee(&1_000, &10_000);
        assert_eq!(max_fee.treasury_amount, 1_000);
        assert_eq!(max_fee.seller_amount, 0);

        let bps_samples: [u32; 11] = [
            0, 1, 50, 250, 999, 1_000, 4_999, 5_000, 7_500, 9_999, 10_000,
        ];
        let amount_samples: [i128; 5] = [1, 7, 1_234, 9_999, 1_000_000_000];

        for amount in amount_samples {
            for bps in bps_samples {
                let split = client.calculate_fee(&amount, &bps);
                assert!(split.treasury_amount <= amount);
                assert!(split.seller_amount >= 0);
                assert_eq!(split.seller_amount + split.treasury_amount, amount);
            }
        }
    }

    #[test]
    #[should_panic(expected = "fee_bps must not exceed 10000")]
    fn fee_bps_above_max_is_rejected() {
        let (_env, client) = setup_fresh_client();
        client.calculate_fee(&1_000, &10_001);
    }

    #[test]
    #[should_panic(expected = "amount must be non-negative")]
    fn negative_amount_is_rejected() {
        let (_env, client) = setup_fresh_client();
        client.calculate_fee(&-1, &100);
    }

    #[test]
    fn treasury_balance_accumulates_across_multiple_sessions() {
        let (_env, client) = setup_fresh_client();
        assert_eq!(client.treasury_balance(), 0);

        let s1 = client.settle_session(&1_000, &250);
        assert_eq!(s1.treasury_amount, 25);
        assert_eq!(client.treasury_balance(), 25);

        let s2 = client.settle_session(&1_234, &123);
        assert_eq!(s2.treasury_amount, 15);
        assert_eq!(client.treasury_balance(), 40);

        let s3 = client.settle_session(&500, &1_000);
        assert_eq!(s3.treasury_amount, 50);
        assert_eq!(client.treasury_balance(), 90);

        let s4 = client.settle_session(&999, &0);
        assert_eq!(s4.treasury_amount, 0);
        assert_eq!(client.treasury_balance(), 90);

        let s5 = client.settle_session(&200, &10_000);
        assert_eq!(s5.treasury_amount, 200);
        assert_eq!(client.treasury_balance(), 290);
    }

    #[test]
    fn treasury_balance_is_isolated_per_contract_instance() {
        let env = Env::default();
        let id_a = env.register(EscrowContract, ());
        let id_b = env.register(EscrowContract, ());
        let client_a = EscrowContractClient::new(&env, &id_a);
        let client_b = EscrowContractClient::new(&env, &id_b);

        client_a.settle_session(&1_000, &500);
        client_a.settle_session(&2_000, &250);

        assert_eq!(client_a.treasury_balance(), 100);
        assert_eq!(client_b.treasury_balance(), 0);
    }

    #[test]
    fn test_platform_fee_admin_flow() {
        let (env, _, _, treasury, _, admin) = setup();
        let cid = env.register(EscrowContract, ());
        let client = EscrowContractClient::new(&env, &cid);
        client.initialize(&admin, &treasury);

        assert_eq!(client.get_platform_fee(), 0);

        client.set_platform_fee(&250);
        assert_eq!(client.get_platform_fee(), 250);

        let events = env.events().all();
        let last_event = events.last().unwrap();
        assert_eq!(last_event.0, cid);
        assert_eq!(last_event.1, (Symbol::new(&env, "PlatformFeeUpdated"),).into_val(&env));
        assert_eq!(last_event.2, 250_u32.into_val(&env));
    }

    #[test]
    #[should_panic(expected = "fee_bps must not exceed 1000")]
    fn test_platform_fee_above_max_reverts() {
        let (env, _, _, treasury, _, admin) = setup();
        let cid = env.register(EscrowContract, ());
        let client = EscrowContractClient::new(&env, &cid);
        client.initialize(&admin, &treasury);
        client.set_platform_fee(&1001);
    }

    #[test]
    fn test_treasury_admin_flow() {
        let (env, _, _, treasury, _, admin) = setup();
        let cid = env.register(EscrowContract, ());
        let client = EscrowContractClient::new(&env, &cid);
        client.initialize(&admin, &treasury);

        assert_eq!(client.get_treasury(), treasury);

        let new_treasury = Address::generate(&env);
        client.set_treasury(&new_treasury);
        assert_eq!(client.get_treasury(), new_treasury);

        let events = env.events().all();
        let last_event = events.last().unwrap();
        assert_eq!(last_event.0, cid);
        assert_eq!(last_event.1, (Symbol::new(&env, "TreasuryUpdated"),).into_val(&env));
        assert_eq!(last_event.2, new_treasury.into_val(&env));
    }
}

// ============================================================================
// SkillSync Escrow Contract Tests — issues #521 #522 #523 #525 #526 #527
// ============================================================================

mod test_skillsync_escrow {
    use super::super::{EscrowError, FeeSplit, SkillSyncEscrow, SkillSyncEscrowClient, Status};
    use soroban_sdk::{
        testutils::Address as _,
        token::{Client as TokenClient, StellarAssetClient},
        vec, Address, BytesN, Env, IntoVal, Symbol, Vec,
    };

    fn make_id(env: &Env, n: u8) -> BytesN<32> {
        BytesN::from_array(env, &[n; 32])
    }

    fn setup() -> (Env, Address, Address, Address, Address, Address) {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        let token_id = env
            .register_stellar_asset_contract_v2(admin.clone())
            .address();
        StellarAssetClient::new(&env, &token_id).mint(&buyer, &1000);
        let cid = env.register(SkillSyncEscrow, ());
        (env, admin, buyer, seller, token_id, cid)
    }

    // ── #525: session struct & helpers ───────────────────────────────────────

    #[test]
    fn test_lock_funds_stores_session_with_locked_status() {
        let (env, admin, buyer, seller, token_id, cid) = setup();
        let client = SkillSyncEscrowClient::new(&env, &cid);
        client.initialize(&admin);
        let id = make_id(&env, 1);
        client.lock_funds(&id, &buyer, &seller, &500, &token_id);
        let s = client.get_session(&id);
        assert!(matches!(s.status, Status::Locked));
        assert_eq!(s.buyer, buyer);
        assert_eq!(s.seller, seller);
        assert_eq!(s.amount, 500);
    }

    // ── #523: lock_funds ─────────────────────────────────────────────────────

    #[test]
    fn test_lock_funds_transfers_tokens_to_contract() {
        let (env, admin, buyer, seller, token_id, cid) = setup();
        let client = SkillSyncEscrowClient::new(&env, &cid);
        client.initialize(&admin);
        let id = make_id(&env, 2);
        client.lock_funds(&id, &buyer, &seller, &300, &token_id);
        assert_eq!(TokenClient::new(&env, &token_id).balance(&cid), 300);
        assert_eq!(TokenClient::new(&env, &token_id).balance(&buyer), 700);
    }

    #[test]
    fn test_lock_funds_emits_funds_locked_event() {
        let (env, admin, buyer, seller, token_id, cid) = setup();
        let client = SkillSyncEscrowClient::new(&env, &cid);
        client.initialize(&admin);
        let id = make_id(&env, 3);
        client.lock_funds(&id, &buyer, &seller, &100, &token_id);
        let events = env.events().all();
        let last = events.last().unwrap();
        assert_eq!(last.0, cid);
        assert_eq!(
            last.1,
            (Symbol::new(&env, "FundsLocked"), id.clone()).into_val(&env)
        );
        assert_eq!(last.2, 100_i128.into_val(&env));
    }

    #[test]
    #[should_panic]
    fn test_lock_funds_zero_amount_reverts() {
        let (env, admin, buyer, seller, token_id, cid) = setup();
        let client = SkillSyncEscrowClient::new(&env, &cid);
        client.initialize(&admin);
        client.lock_funds(&make_id(&env, 4), &buyer, &seller, &0, &token_id);
    }

    // ── #526: DuplicateSessionId — lock_funds ─────────────────────────────────

    #[test]
    #[should_panic(expected = "DuplicateSessionId")]
    fn test_lock_funds_duplicate_session_id_reverts() {
        let (env, admin, buyer, seller, token_id, cid) = setup();
        let client = SkillSyncEscrowClient::new(&env, &cid);
        client.initialize(&admin);
        let id = make_id(&env, 5);
        client.lock_funds(&id, &buyer, &seller, &100, &token_id);
        client.lock_funds(&id, &buyer, &seller, &100, &token_id);
    }

    // ── #527: complete_session ────────────────────────────────────────────────

    #[test]
    fn test_complete_session_seller_only_locked_to_completed() {
        let (env, admin, buyer, seller, token_id, cid) = setup();
        let client = SkillSyncEscrowClient::new(&env, &cid);
        client.initialize(&admin);
        let id = make_id(&env, 10);
        client.lock_funds(&id, &buyer, &seller, &500, &token_id);
        client.complete_session(&id);
        let s = client.get_session(&id);
        assert!(matches!(s.status, Status::Completed));
        assert!(s.completed_at > 0);
    }

    #[test]
    fn test_complete_session_emits_session_completed_event() {
        let (env, admin, buyer, seller, token_id, cid) = setup();
        let client = SkillSyncEscrowClient::new(&env, &cid);
        client.initialize(&admin);
        let id = make_id(&env, 11);
        client.lock_funds(&id, &buyer, &seller, &200, &token_id);
        client.complete_session(&id);
        let events = env.events().all();
        let last = events.last().unwrap();
        assert_eq!(last.0, cid);
        assert_eq!(
            last.1,
            (Symbol::new(&env, "SessionCompleted"), id.clone()).into_val(&env)
        );
    }

    #[test]
    #[should_panic]
    fn test_complete_session_requires_locked_state() {
        let (env, admin, .., cid) = setup();
        let client = SkillSyncEscrowClient::new(&env, &cid);
        client.initialize(&admin);
        let id = make_id(&env, 12);
        // session doesn't exist — should panic
        client.complete_session(&id);
    }

    // ── #526: DuplicateSessionId — complete_session ───────────────────────────

    #[test]
    #[should_panic(expected = "DuplicateSessionId")]
    fn test_complete_session_already_completed_reverts_with_duplicate_id() {
        let (env, admin, buyer, seller, token_id, cid) = setup();
        let client = SkillSyncEscrowClient::new(&env, &cid);
        client.initialize(&admin);
        let id = make_id(&env, 13);
        client.lock_funds(&id, &buyer, &seller, &100, &token_id);
        client.complete_session(&id);
        client.complete_session(&id); // already Completed → DuplicateSessionId
    }

    // ── #526: DuplicateSessionId — refund_session ─────────────────────────────

    #[test]
    fn test_refund_session_locked_succeeds() {
        let (env, admin, buyer, seller, token_id, cid) = setup();
        let client = SkillSyncEscrowClient::new(&env, &cid);
        client.initialize(&admin);
        let id = make_id(&env, 20);
        client.lock_funds(&id, &buyer, &seller, &400, &token_id);
        client.refund_session(&id, &token_id);
        let s = client.get_session(&id);
        assert!(matches!(s.status, Status::Refunded));
        assert_eq!(TokenClient::new(&env, &token_id).balance(&buyer), 1000);
    }

    #[test]
    #[should_panic(expected = "DuplicateSessionId")]
    fn test_refund_session_already_refunded_reverts_with_duplicate_id() {
        let (env, admin, buyer, seller, token_id, cid) = setup();
        let client = SkillSyncEscrowClient::new(&env, &cid);
        client.initialize(&admin);
        let id = make_id(&env, 21);
        client.lock_funds(&id, &buyer, &seller, &100, &token_id);
        client.refund_session(&id, &token_id);
        client.refund_session(&id, &token_id); // already Refunded → DuplicateSessionId
    }

    // ── #526: approve_session state check ────────────────────────────────────

    #[test]
    fn test_approve_session_after_complete_succeeds() {
        let (env, admin, buyer, seller, token_id, cid) = setup();
        let client = SkillSyncEscrowClient::new(&env, &cid);
        client.initialize(&admin);
        let id = make_id(&env, 30);
        client.lock_funds(&id, &buyer, &seller, &600, &token_id);
        client.complete_session(&id);
        client.approve_session(&id, &token_id);
        let s = client.get_session(&id);
        assert!(matches!(s.status, Status::Approved));
        assert_eq!(TokenClient::new(&env, &token_id).balance(&seller), 600);
    }

    #[test]
    #[should_panic]
    fn test_approve_session_before_complete_reverts() {
        let (env, admin, buyer, seller, token_id, cid) = setup();
        let client = SkillSyncEscrowClient::new(&env, &cid);
        client.initialize(&admin);
        let id = make_id(&env, 31);
        client.lock_funds(&id, &buyer, &seller, &100, &token_id);
        client.approve_session(&id, &token_id); // not Completed → should panic
    }

    // ── #521: dispute window ─────────────────────────────────────────────────

    #[test]
    fn test_get_dispute_window_default_is_1000() {
        let (env, admin, .., cid) = setup();
        let client = SkillSyncEscrowClient::new(&env, &cid);
        client.initialize(&admin);
        assert_eq!(client.get_dispute_window(), 1000);
    }

    #[test]
    fn test_set_dispute_window_updates_value() {
        let (env, admin, .., cid) = setup();
        let client = SkillSyncEscrowClient::new(&env, &cid);
        client.initialize(&admin);
        client.set_dispute_window(&2000);
        assert_eq!(client.get_dispute_window(), 2000);
    }

    #[test]
    fn test_set_dispute_window_emits_event() {
        let (env, admin, .., cid) = setup();
        let client = SkillSyncEscrowClient::new(&env, &cid);
        client.initialize(&admin);
        client.set_dispute_window(&500);
        let events = env.events().all();
        let last = events.last().unwrap();
        assert_eq!(last.0, cid);
        assert_eq!(
            last.1,
            (Symbol::new(&env, "DisputeWindowUpdated"),).into_val(&env)
        );
        assert_eq!(last.2, 500_u32.into_val(&env));
    }

    // =========================================================================
    // Financial Validation Errors Tests (Issue 1: 400 - 404)
    // =========================================================================

    #[test]
    fn test_invalid_amount_error_400() {
        let (env, admin, buyer, seller, token_id, cid) = setup();
        let client = SkillSyncEscrowClient::new(&env, &cid);
        client.initialize(&admin);

        // Zero amount on lock_funds -> InvalidAmount (400)
        let res_zero = client.try_lock_funds(&make_id(&env, 40), &buyer, &seller, &0, &token_id);
        assert_eq!(res_zero, Err(Ok(EscrowError::InvalidAmount)));

        // Negative amount on lock_funds -> InvalidAmount (400)
        let res_neg = client.try_lock_funds(&make_id(&env, 41), &buyer, &seller, &-100, &token_id);
        assert_eq!(res_neg, Err(Ok(EscrowError::InvalidAmount)));

        // Zero or negative on calculate_fee -> InvalidAmount (400)
        let res_fee_zero = client.try_calculate_fee(&0, &100);
        assert_eq!(res_fee_zero, Err(Ok(EscrowError::InvalidAmount)));

        let res_fee_neg = client.try_calculate_fee(&-50, &100);
        assert_eq!(res_fee_neg, Err(Ok(EscrowError::InvalidAmount)));

        // Zero amount or negative split in validate_split -> InvalidAmount (400)
        let res_split_zero = client.try_validate_split(&0, &0, &0);
        assert_eq!(res_split_zero, Err(Ok(EscrowError::InvalidAmount)));

        let res_split_neg = client.try_validate_split(&100, &-20, &120);
        assert_eq!(res_split_neg, Err(Ok(EscrowError::InvalidAmount)));
    }

    #[test]
    fn test_insufficient_balance_error_401() {
        let (env, admin, buyer, seller, token_id, cid) = setup();
        let client = SkillSyncEscrowClient::new(&env, &cid);
        client.initialize(&admin);

        // Buyer only has 1000 minted tokens; try to lock 1001 -> InsufficientBalance (401)
        let res = client.try_lock_funds(&make_id(&env, 42), &buyer, &seller, &1001, &token_id);
        assert_eq!(res, Err(Ok(EscrowError::InsufficientBalance)));
    }

    #[test]
    fn test_fee_too_high_error_402() {
        let (env, admin, _, _, _, cid) = setup();
        let client = SkillSyncEscrowClient::new(&env, &cid);
        client.initialize(&admin);

        // Fee exceeding 1000 bps (e.g. 1001 bps) -> FeeTooHigh (402)
        let res_set = client.try_set_platform_fee(&1001);
        assert_eq!(res_set, Err(Ok(EscrowError::FeeTooHigh)));

        let res_set_high = client.try_set_platform_fee(&5000);
        assert_eq!(res_set_high, Err(Ok(EscrowError::FeeTooHigh)));

        // calculate_fee with fee > 1000 bps -> FeeTooHigh (402)
        let res_calc = client.try_calculate_fee(&1000, &1001);
        assert_eq!(res_calc, Err(Ok(EscrowError::FeeTooHigh)));

        // Max fee 1000 bps succeeds
        assert!(client.try_set_platform_fee(&1000).is_ok());
        assert_eq!(client.get_platform_fee(), 1000);
    }

    #[test]
    fn test_invalid_split_error_403() {
        let (env, admin, buyer, seller, token_id, cid) = setup();
        let client = SkillSyncEscrowClient::new(&env, &cid);
        client.initialize(&admin);

        // validate_split sum mismatch -> InvalidSplit (403)
        let res = client.try_validate_split(&1000, &400, &500); // 400 + 500 = 900 != 1000
        assert_eq!(res, Err(Ok(EscrowError::InvalidSplit)));

        let res_over = client.try_validate_split(&1000, &600, &500); // 600 + 500 = 1100 != 1000
        assert_eq!(res_over, Err(Ok(EscrowError::InvalidSplit)));

        // resolve_dispute with mismatching split -> InvalidSplit (403)
        let id = make_id(&env, 43);
        client.lock_funds(&id, &buyer, &seller, &500, &token_id);
        client.dispute_session(&id);

        let res_dispute = client.try_resolve_dispute(&id, &200, &200, &token_id); // sum 400 != 500
        assert_eq!(res_dispute, Err(Ok(EscrowError::InvalidSplit)));
    }

    #[test]
    fn test_overflow_error_404() {
        let (env, admin, buyer, seller, token_id, cid) = setup();
        let client = SkillSyncEscrowClient::new(&env, &cid);
        client.initialize(&admin);

        // validate_split arithmetic overflow on sum -> Overflow (404)
        let res_overflow = client.try_validate_split(&100, &i128::MAX, &1);
        assert_eq!(res_overflow, Err(Ok(EscrowError::Overflow)));

        // batch_lock_funds with overflowing total amount -> Overflow (404)
        let mut sessions: Vec<(BytesN<32>, Address, i128)> = Vec::new(&env);
        sessions.push_back((make_id(&env, 44), seller.clone(), i128::MAX));
        sessions.push_back((make_id(&env, 45), seller.clone(), 1));

        let res_batch_overflow = client.try_batch_lock_funds(&sessions, &buyer, &token_id);
        assert_eq!(res_batch_overflow, Err(Ok(EscrowError::Overflow)));
    }

    // =========================================================================
    // Dispute & Resolution Happy Path Tests
    // =========================================================================

    #[test]
    fn test_dispute_and_resolve_happy_path() {
        let (env, admin, buyer, seller, token_id, cid) = setup();
        let client = SkillSyncEscrowClient::new(&env, &cid);
        client.initialize(&admin);

        let id = make_id(&env, 50);
        client.lock_funds(&id, &buyer, &seller, &500, &token_id);
        assert_eq!(TokenClient::new(&env, &token_id).balance(&buyer), 500);

        client.dispute_session(&id);
        let s = client.get_session(&id);
        assert!(matches!(s.status, Status::Disputed));

        // Resolve: 300 to buyer, 200 to seller
        client.resolve_dispute(&id, &300, &200, &token_id);
        let s_resolved = client.get_session(&id);
        assert!(matches!(s_resolved.status, Status::Resolved));
        assert!(s_resolved.dispute_resolved_at > 0);

        assert_eq!(TokenClient::new(&env, &token_id).balance(&buyer), 800);
        assert_eq!(TokenClient::new(&env, &token_id).balance(&seller), 200);
    }

    // =========================================================================
    // Batch Operations Module Tests (Issue 2)
    // =========================================================================

    #[test]
    fn test_batch_lock_funds_success() {
        let (env, admin, buyer, seller, token_id, cid) = setup();
        let client = SkillSyncEscrowClient::new(&env, &cid);
        client.initialize(&admin);

        let seller2 = Address::generate(&env);

        let id1 = make_id(&env, 60);
        let id2 = make_id(&env, 61);
        let id3 = make_id(&env, 62);

        let mut sessions: Vec<(BytesN<32>, Address, i128)> = Vec::new(&env);
        sessions.push_back((id1.clone(), seller.clone(), 200));
        sessions.push_back((id2.clone(), seller2.clone(), 300));
        sessions.push_back((id3.clone(), seller.clone(), 400));

        // Lock 3 sessions totalling 900
        client.batch_lock_funds(&sessions, &buyer, &token_id);

        assert_eq!(TokenClient::new(&env, &token_id).balance(&buyer), 100);
        assert_eq!(TokenClient::new(&env, &token_id).balance(&cid), 900);

        let s1 = client.get_session(&id1);
        assert!(matches!(s1.status, Status::Locked));
        assert_eq!(s1.amount, 200);
        assert_eq!(s1.seller, seller);

        let s2 = client.get_session(&id2);
        assert!(matches!(s2.status, Status::Locked));
        assert_eq!(s2.amount, 300);
        assert_eq!(s2.seller, seller2);

        let s3 = client.get_session(&id3);
        assert!(matches!(s3.status, Status::Locked));
        assert_eq!(s3.amount, 400);
    }

    #[test]
    fn test_batch_lock_funds_invalid_amount_reverts_entire_batch() {
        let (env, admin, buyer, seller, token_id, cid) = setup();
        let client = SkillSyncEscrowClient::new(&env, &cid);
        client.initialize(&admin);

        let id1 = make_id(&env, 63);
        let id2 = make_id(&env, 64);

        let mut sessions: Vec<(BytesN<32>, Address, i128)> = Vec::new(&env);
        sessions.push_back((id1.clone(), seller.clone(), 200));
        sessions.push_back((id2.clone(), seller.clone(), 0)); // invalid amount

        let res = client.try_batch_lock_funds(&sessions, &buyer, &token_id);
        assert_eq!(res, Err(Ok(EscrowError::InvalidAmount)));

        // Verify no funds were transferred and no session saved
        assert_eq!(TokenClient::new(&env, &token_id).balance(&buyer), 1000);
        assert_eq!(TokenClient::new(&env, &token_id).balance(&cid), 0);
    }

    #[test]
    fn test_batch_lock_funds_insufficient_balance_reverts_entire_batch() {
        let (env, admin, buyer, seller, token_id, cid) = setup();
        let client = SkillSyncEscrowClient::new(&env, &cid);
        client.initialize(&admin);

        let id1 = make_id(&env, 65);
        let id2 = make_id(&env, 66);

        let mut sessions: Vec<(BytesN<32>, Address, i128)> = Vec::new(&env);
        sessions.push_back((id1.clone(), seller.clone(), 600));
        sessions.push_back((id2.clone(), seller.clone(), 500)); // Total 1100 > 1000 balance

        let res = client.try_batch_lock_funds(&sessions, &buyer, &token_id);
        assert_eq!(res, Err(Ok(EscrowError::InsufficientBalance)));

        assert_eq!(TokenClient::new(&env, &token_id).balance(&buyer), 1000);
        assert_eq!(TokenClient::new(&env, &token_id).balance(&cid), 0);
    }

    #[test]
    #[should_panic(expected = "DuplicateSessionId")]
    fn test_batch_lock_funds_duplicate_session_reverts_entire_batch() {
        let (env, admin, buyer, seller, token_id, cid) = setup();
        let client = SkillSyncEscrowClient::new(&env, &cid);
        client.initialize(&admin);

        let existing_id = make_id(&env, 67);
        client.lock_funds(&existing_id, &buyer, &seller, &100, &token_id);

        let id2 = make_id(&env, 68);
        let mut sessions: Vec<(BytesN<32>, Address, i128)> = Vec::new(&env);
        sessions.push_back((existing_id.clone(), seller.clone(), 200));
        sessions.push_back((id2.clone(), seller.clone(), 200));

        client.batch_lock_funds(&sessions, &buyer, &token_id);
    }

    #[test]
    fn test_batch_lock_funds_empty_noop() {
        let (env, admin, buyer, _, token_id, cid) = setup();
        let client = SkillSyncEscrowClient::new(&env, &cid);
        client.initialize(&admin);

        let empty: Vec<(BytesN<32>, Address, i128)> = Vec::new(&env);
        client.batch_lock_funds(&empty, &buyer, &token_id);
        assert_eq!(TokenClient::new(&env, &token_id).balance(&buyer), 1000);
    }

    #[test]
    fn test_batch_complete_success() {
        let (env, admin, buyer, seller, token_id, cid) = setup();
        let client = SkillSyncEscrowClient::new(&env, &cid);
        client.initialize(&admin);

        let id1 = make_id(&env, 70);
        let id2 = make_id(&env, 71);

        let mut sessions: Vec<(BytesN<32>, Address, i128)> = Vec::new(&env);
        sessions.push_back((id1.clone(), seller.clone(), 200));
        sessions.push_back((id2.clone(), seller.clone(), 300));
        client.batch_lock_funds(&sessions, &buyer, &token_id);

        let mut ids: Vec<BytesN<32>> = Vec::new(&env);
        ids.push_back(id1.clone());
        ids.push_back(id2.clone());

        client.batch_complete(&ids);

        let s1 = client.get_session(&id1);
        assert!(matches!(s1.status, Status::Completed));
        assert!(s1.completed_at > 0);

        let s2 = client.get_session(&id2);
        assert!(matches!(s2.status, Status::Completed));
        assert!(s2.completed_at > 0);
    }

    #[test]
    #[should_panic(expected = "DuplicateSessionId")]
    fn test_batch_complete_already_completed_reverts() {
        let (env, admin, buyer, seller, token_id, cid) = setup();
        let client = SkillSyncEscrowClient::new(&env, &cid);
        client.initialize(&admin);

        let id1 = make_id(&env, 72);
        let id2 = make_id(&env, 73);
        client.lock_funds(&id1, &buyer, &seller, &100, &token_id);
        client.lock_funds(&id2, &buyer, &seller, &100, &token_id);

        client.complete_session(&id1); // already completed

        let mut ids: Vec<BytesN<32>> = Vec::new(&env);
        ids.push_back(id1.clone());
        ids.push_back(id2.clone());

        client.batch_complete(&ids); // Should panic on id1
    }

    #[test]
    fn test_batch_approve_success() {
        let (env, admin, buyer, seller, token_id, cid) = setup();
        let client = SkillSyncEscrowClient::new(&env, &cid);
        client.initialize(&admin);

        let seller2 = Address::generate(&env);

        let id1 = make_id(&env, 80);
        let id2 = make_id(&env, 81);

        let mut sessions: Vec<(BytesN<32>, Address, i128)> = Vec::new(&env);
        sessions.push_back((id1.clone(), seller.clone(), 300));
        sessions.push_back((id2.clone(), seller2.clone(), 400));
        client.batch_lock_funds(&sessions, &buyer, &token_id);

        let mut ids: Vec<BytesN<32>> = Vec::new(&env);
        ids.push_back(id1.clone());
        ids.push_back(id2.clone());

        // Complete both
        client.batch_complete(&ids);

        // Approve both
        client.batch_approve(&ids, &token_id);

        assert_eq!(TokenClient::new(&env, &token_id).balance(&seller), 300);
        assert_eq!(TokenClient::new(&env, &token_id).balance(&seller2), 400);
        assert_eq!(TokenClient::new(&env, &token_id).balance(&cid), 0);

        let s1 = client.get_session(&id1);
        assert!(matches!(s1.status, Status::Approved));

        let s2 = client.get_session(&id2);
        assert!(matches!(s2.status, Status::Approved));
    }

    #[test]
    #[should_panic]
    fn test_batch_approve_not_completed_reverts() {
        let (env, admin, buyer, seller, token_id, cid) = setup();
        let client = SkillSyncEscrowClient::new(&env, &cid);
        client.initialize(&admin);

        let id1 = make_id(&env, 82);
        let id2 = make_id(&env, 83);
        client.lock_funds(&id1, &buyer, &seller, &100, &token_id);
        client.lock_funds(&id2, &buyer, &seller, &100, &token_id);

        client.complete_session(&id1); // only id1 is completed

        let mut ids: Vec<BytesN<32>> = Vec::new(&env);
        ids.push_back(id1);
        ids.push_back(id2); // id2 is Locked, not Completed

        client.batch_approve(&ids, &token_id); // should panic
    }

    #[test]
    fn test_batch_refund_success() {
        let (env, admin, buyer, seller, token_id, cid) = setup();
        let client = SkillSyncEscrowClient::new(&env, &cid);
        client.initialize(&admin);

        let id1 = make_id(&env, 90);
        let id2 = make_id(&env, 91);

        let mut sessions: Vec<(BytesN<32>, Address, i128)> = Vec::new(&env);
        sessions.push_back((id1.clone(), seller.clone(), 250));
        sessions.push_back((id2.clone(), seller.clone(), 350));
        client.batch_lock_funds(&sessions, &buyer, &token_id);

        assert_eq!(TokenClient::new(&env, &token_id).balance(&buyer), 400);

        let mut ids: Vec<BytesN<32>> = Vec::new(&env);
        ids.push_back(id1.clone());
        ids.push_back(id2.clone());

        client.batch_refund(&ids, &token_id);

        assert_eq!(TokenClient::new(&env, &token_id).balance(&buyer), 1000);
        assert_eq!(TokenClient::new(&env, &token_id).balance(&cid), 0);

        let s1 = client.get_session(&id1);
        assert!(matches!(s1.status, Status::Refunded));

        let s2 = client.get_session(&id2);
        assert!(matches!(s2.status, Status::Refunded));
    }

    #[test]
    #[should_panic(expected = "DuplicateSessionId")]
    fn test_batch_refund_already_refunded_reverts() {
        let (env, admin, buyer, seller, token_id, cid) = setup();
        let client = SkillSyncEscrowClient::new(&env, &cid);
        client.initialize(&admin);

        let id1 = make_id(&env, 92);
        let id2 = make_id(&env, 93);
        client.lock_funds(&id1, &buyer, &seller, &100, &token_id);
        client.lock_funds(&id2, &buyer, &seller, &100, &token_id);

        client.refund_session(&id1, &token_id); // already refunded

        let mut ids: Vec<BytesN<32>> = Vec::new(&env);
        ids.push_back(id1);
        ids.push_back(id2);

        client.batch_refund(&ids, &token_id); // should panic
    }

    #[test]
    fn test_skillsync_platform_fee_and_treasury() {
        let (env, admin, _, _, _, cid) = setup();
        let client = SkillSyncEscrowClient::new(&env, &cid);
        client.initialize(&admin);

        let treasury = Address::generate(&env);
        client.set_treasury(&treasury);
        assert_eq!(client.get_treasury(), treasury);

        client.set_platform_fee(&250); // 2.5%
        assert_eq!(client.get_platform_fee(), 250);

        let split: FeeSplit = client.calculate_fee(&1000, &250);
        assert_eq!(split.treasury_amount, 25);
        assert_eq!(split.seller_amount, 975);
    }
}
