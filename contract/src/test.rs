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
        client.initialize(&admin, &treasury, &604800);
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
        client.initialize(&admin, &treasury, &604800);
        client.lock_funds(&1, &buyer, &seller, &0, &token_id);
    }

    #[test]
    #[should_panic]
    fn test_lock_funds_duplicate_session_reverts() {
        let (env, buyer, seller, treasury, token_id, admin) = setup();
        let client = EscrowContractClient::new(&env, &env.register(EscrowContract, ()));
        client.initialize(&admin, &treasury, &604800);
        client.lock_funds(&1, &buyer, &seller, &100, &token_id);
        client.lock_funds(&1, &buyer, &seller, &100, &token_id);
    }

    #[test]
    fn test_complete_and_approve_happy_path() {
        let (env, buyer, seller, treasury, token_id, admin) = setup();
        let cid = env.register(EscrowContract, ());
        let client = EscrowContractClient::new(&env, &cid);
        client.initialize(&admin, &treasury, &604800);
        
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
        client.initialize(&admin, &treasury, &604800);
        client.complete(&99);
    }

    #[test]
    #[should_panic]
    fn test_buyer_cannot_approve_before_complete() {
        let (env, buyer, seller, treasury, token_id, admin) = setup();
        let client = EscrowContractClient::new(&env, &env.register(EscrowContract, ()));
        client.initialize(&admin, &treasury, &604800);
        client.lock_funds(&1, &buyer, &seller, &500, &token_id);
        client.approve(&1, &token_id); // not completed yet
    }

    #[test]
    fn test_buyer_can_refund_before_complete() {
        let (env, buyer, seller, treasury, token_id, admin) = setup();
        let cid = env.register(EscrowContract, ());
        let client = EscrowContractClient::new(&env, &cid);
        client.initialize(&admin, &treasury, &604800);
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
        client.initialize(&admin, &treasury, &604800);
        client.lock_funds(&1, &buyer, &seller, &500, &token_id);
        client.complete(&1);
        client.refund(&1, &token_id); // should panic — not Locked
    }

    #[test]
    #[should_panic]
    fn test_refund_reverts_if_already_approved() {
        let (env, buyer, seller, treasury, token_id, admin) = setup();
        let client = EscrowContractClient::new(&env, &env.register(EscrowContract, ()));
        client.initialize(&admin, &treasury, &604800);
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
        client.initialize(&admin, &treasury, &604800);
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
        client.initialize(&admin, &treasury, &604800);
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
        client.initialize(&admin, &treasury, &604800);
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
        client.initialize(&admin, &treasury, &604800);

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
        client.initialize(&admin, &treasury, &604800);
        client.set_platform_fee(&1001);
    }

    #[test]
    fn test_treasury_admin_flow() {
        let (env, _, _, treasury, _, admin) = setup();
        let cid = env.register(EscrowContract, ());
        let client = EscrowContractClient::new(&env, &cid);
        client.initialize(&admin, &treasury, &604800);

        assert_eq!(client.get_treasury(), treasury);

        let new_treasury = Address::generate(&env);
        client.set_treasury(&new_treasury);
        assert_eq!(client.get_treasury(), new_treasury);

        let events = env.events().all();
        let last_event = events.last().unwrap();
        assert_eq!(last_event.0, cid);
        assert_eq!(last_event.1, (Symbol::new(&env, "TreasuryUpdated"),).into_val(&env));
        assert_eq!(last_event.2, (treasury, new_treasury, admin).into_val(&env));
    }

    #[test]
    fn test_initialize_emits_initialized_event() {
        let (env, _, _, treasury, _, admin) = setup();
        let cid = env.register(EscrowContract, ());
        let client = EscrowContractClient::new(&env, &cid);
        let dispute_window = 604800_u32;
        client.initialize(&admin, &treasury, &dispute_window);
        let events = env.events().all();
        let last = events.last().unwrap();
        assert_eq!(last.0, cid);
        assert_eq!(
            last.1,
            (Symbol::new(&env, "Initialized"),).into_val(&env)
        );
        assert_eq!(
            last.2,
            (admin, treasury, dispute_window).into_val(&env)
        );
    }
}

// ============================================================================
// SkillSync Escrow Contract Tests — issues #521 #522 #523 #525 #526 #527
// ============================================================================

mod test_skillsync_escrow {
    use super::super::{SkillSyncEscrow, SkillSyncEscrowClient, Status, ContractUpgraded, Bytes32};
    use soroban_sdk::{
        testutils::Address as _,
        token::{Client as TokenClient, StellarAssetClient},
        Address, BytesN, Env, IntoVal, Symbol,
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
    #[should_panic(expected = "amount must be positive")]
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
        let s = client.get_session(&id);
        let events = env.events().all();
        let last = events.last().unwrap();
        assert_eq!(last.0, cid);
        assert_eq!(
            last.1,
            (Symbol::new(&env, "SessionCompleted"), id.clone()).into_val(&env)
        );
        assert_eq!(
            last.2,
            (seller.clone(), s.completed_at).into_val(&env)
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

    #[test]
    fn test_refund_session_emits_session_refunded_event() {
        let (env, admin, buyer, seller, token_id, cid) = setup();
        let client = SkillSyncEscrowClient::new(&env, &cid);
        client.initialize(&admin);
        let id = make_id(&env, 40);
        client.lock_funds(&id, &buyer, &seller, &500, &token_id);
        let timestamp = env.ledger().timestamp();
        client.refund_session(&id, &token_id);
        let events = env.events().all();
        let last = events.last().unwrap();
        assert_eq!(last.0, cid);
        assert_eq!(
            last.1,
            (Symbol::new(&env, "SessionRefunded"), id.clone()).into_val(&env)
        );
        assert_eq!(
            last.2,
            (buyer.clone(), 500_i128, timestamp).into_val(&env)
        );
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

    #[test]
    fn test_upgrade_emits_contract_upgraded_event() {
        let (env, admin, .., cid) = setup();
        let client = SkillSyncEscrowClient::new(&env, &cid);
        client.initialize(&admin);

        let new_wasm_hash = make_id(&env, 99);
        client.upgrade(&new_wasm_hash);

        let events = env.events().all();
        let last = events.last().unwrap();
        assert_eq!(last.0, cid);
        assert_eq!(
            last.1,
            (Symbol::new(&env, "ContractUpgraded"),).into_val(&env)
        );

        let event_data: ContractUpgraded = last.2.into_val(&env);
        assert_eq!(event_data.old_wasm_hash, Bytes32::from_array(&env, &[0; 32]));
        assert_eq!(event_data.new_wasm_hash, new_wasm_hash);
        assert_eq!(event_data.upgraded_by, admin);
        assert_eq!(event_data.timestamp, env.ledger().timestamp());

        // Upgrade again to check that old_wasm_hash updates
        let newer_wasm_hash = make_id(&env, 88);
        client.upgrade(&newer_wasm_hash);

        let events = env.events().all();
        let last = events.last().unwrap();
        let event_data: ContractUpgraded = last.2.into_val(&env);
        assert_eq!(event_data.old_wasm_hash, new_wasm_hash);
        assert_eq!(event_data.new_wasm_hash, newer_wasm_hash);
    }

    // ── #550: dispute_session ────────────────────────────────────────────────

    #[test]
    fn test_dispute_session_by_buyer_succeeds() {
        let (env, admin, buyer, seller, token_id, cid) = setup();
        let client = SkillSyncEscrowClient::new(&env, &cid);
        client.initialize(&admin);
        let id = make_id(&env, 100);
        client.lock_funds(&id, &buyer, &seller, &100, &token_id);
        
        let reason = soroban_sdk::String::from_str(&env, "Service not delivered");
        client.dispute_session(&id, &buyer, &reason);
        
        let s = client.get_session(&id);
        assert!(matches!(s.status, Status::Disputed));
        
        let events = env.events().all();
        let last = events.last().unwrap();
        assert_eq!(last.0, cid);
        assert_eq!(
            last.1,
            (Symbol::new(&env, "DisputeOpened"), id.clone()).into_val(&env)
        );
        assert_eq!(
            last.2,
            (buyer, reason, env.ledger().timestamp()).into_val(&env)
        );
    }

    #[test]
    fn test_dispute_session_by_seller_succeeds() {
        let (env, admin, buyer, seller, token_id, cid) = setup();
        let client = SkillSyncEscrowClient::new(&env, &cid);
        client.initialize(&admin);
        let id = make_id(&env, 101);
        client.lock_funds(&id, &buyer, &seller, &100, &token_id);
        client.complete_session(&id); // Seller completes it
        
        let reason = soroban_sdk::String::from_str(&env, "Buyer unresponsive");
        client.dispute_session(&id, &seller, &reason);
        
        let s = client.get_session(&id);
        assert!(matches!(s.status, Status::Disputed));
        
        let events = env.events().all();
        let last = events.last().unwrap();
        assert_eq!(last.0, cid);
        assert_eq!(
            last.1,
            (Symbol::new(&env, "DisputeOpened"), id.clone()).into_val(&env)
        );
        assert_eq!(
            last.2,
            (seller, reason, env.ledger().timestamp()).into_val(&env)
        );
    }

    #[test]
    #[should_panic(expected = "Unauthorized: must be buyer or seller")]
    fn test_dispute_session_by_unauthorized_reverts() {
        let (env, admin, buyer, seller, token_id, cid) = setup();
        let client = SkillSyncEscrowClient::new(&env, &cid);
        client.initialize(&admin);
        let id = make_id(&env, 102);
        client.lock_funds(&id, &buyer, &seller, &100, &token_id);
        
        let random_user = Address::generate(&env);
        let reason = soroban_sdk::String::from_str(&env, "Random reason");
        client.dispute_session(&id, &random_user, &reason);
    }

    #[test]
    #[should_panic(expected = "InvalidState: session must be Locked or Completed")]
    fn test_dispute_session_invalid_state_reverts() {
        let (env, admin, buyer, seller, token_id, cid) = setup();
        let client = SkillSyncEscrowClient::new(&env, &cid);
        client.initialize(&admin);
        let id = make_id(&env, 103);
        client.lock_funds(&id, &buyer, &seller, &100, &token_id);
        client.refund_session(&id, &token_id); // State becomes Refunded
        
        let reason = soroban_sdk::String::from_str(&env, "Want to dispute after refund");
        client.dispute_session(&id, &buyer, &reason); // Should panic
    }
}
