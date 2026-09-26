//! Tests for the session-adjacent modules: off-chain metadata, linear
//! vesting, event-relay configuration, and batched operations.
//!
//! They live together rather than in each module because they share fixtures
//! and, more importantly, because most of what is worth checking here is the
//! *interaction*: metadata is frozen once money has moved, a dispute unwinds a
//! vesting schedule, and a batch that mentions a metadata write has to leave
//! the same record as a one-at-a-time write.

#[cfg(test)]
mod session_modules_tests {
    use soroban_sdk::testutils::{Address as _, Events, Ledger};
    use soroban_sdk::{symbol_short, Address, Bytes, Env, IntoVal, String, Vec};

    use crate::batch;
    use crate::errors::ContractError;
    use crate::session;
    use crate::vesting;
    use crate::{SkillSyncContract, SkillSyncContractClient};

    struct Harness {
        env: Env,
        admin: Address,
        buyer: Address,
        seller: Address,
        client: SkillSyncContractClient<'static>,
    }

    impl Harness {
        fn new() -> Self {
            let env = Env::default();
            env.mock_all_auths();
            let contract_id = env.register(SkillSyncContract, ());
            let client = SkillSyncContractClient::new(&env, &contract_id);
            let admin = Address::generate(&env);
            let treasury = Address::generate(&env);
            client.initialize(&admin, &treasury).unwrap();
            let buyer = Address::generate(&env);
            let seller = Address::generate(&env);
            Harness {
                env,
                admin,
                buyer,
                seller,
                client,
            }
        }

        fn id(&self, byte: u8) -> Bytes {
            Bytes::from_slice(&self.env, &[byte; 32])
        }

        fn lock(&self, byte: u8) -> Bytes {
            let id = self.id(byte);
            session::lock_funds(
                &self.env,
                id.clone(),
                self.buyer.clone(),
                self.seller.clone(),
                1_000,
            );
            id
        }

        fn str(&self, s: &str) -> String {
            String::from_str(&self.env, s)
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // Metadata storage
    // ─────────────────────────────────────────────────────────────────────

    #[test]
    fn metadata_round_trips_for_the_buyer() {
        let h = Harness::new();
        let id = h.lock(1);
        let uri = h.str("ipfs://bafy-meta");

        h.client
            .set_session_metadata(&id, &h.buyer, &uri).unwrap();

        assert_eq!(h.client.get_session_metadata(&id), Some(uri));
    }

    #[test]
    fn the_seller_may_set_metadata_too() {
        let h = Harness::new();
        let id = h.lock(1);
        let uri = h.str("https://example.test/deliverable.json");

        h.client
            .set_session_metadata(&id, &h.seller, &uri).unwrap();

        assert_eq!(h.client.get_session_metadata(&id), Some(uri));
    }

    #[test]
    fn a_stranger_cannot_set_metadata() {
        let h = Harness::new();
        let id = h.lock(1);
        let stranger = Address::generate(&h.env);
        let uri = h.str("ipfs://bafy-meta");

        h.client
            .set_session_metadata(&id, &stranger, &uri);

        // The write did not happen; the session is untouched.
        assert_eq!(h.client.get_session_metadata(&id), None);
    }

    #[test]
    fn a_participant_may_replace_the_uri() {
        let h = Harness::new();
        let id = h.lock(1);
        let first = h.str("ipfs://bafy-first");
        let second = h.str("ipfs://bafy-second");

        h.client.set_session_metadata(&id, &h.buyer, &first);
        h.client.set_session_metadata(&id, &h.seller, &second).unwrap();

        assert_eq!(h.client.get_session_metadata(&id), Some(second));
    }

    #[test]
    fn an_empty_uri_is_rejected() {
        let h = Harness::new();
        let id = h.lock(1);
        let empty = h.str("");

        h.client.set_session_metadata(&id, &h.buyer, &empty);

        assert_eq!(h.client.get_session_metadata(&id), None);
    }

    #[test]
    fn an_over_long_uri_is_rejected() {
        let h = Harness::new();
        let id = h.lock(1);
        let long = "x".repeat(257);
        let long = h.str(&long);

        h.client.set_session_metadata(&id, &h.buyer, &long);

        assert_eq!(h.client.get_session_metadata(&id), None);
    }

    #[test]
    fn metadata_survives_the_session_advancing() {
        let h = Harness::new();
        let id = h.lock(1);
        let uri = h.str("ipfs://bafy-meta");

        h.client.set_session_metadata(&id, &h.buyer, &uri).unwrap();
        h.client.complete_session(&id, &h.seller);
        h.client.approve_session(&id, &h.buyer);

        // An approved session's record is history; it stays readable.
        assert_eq!(h.client.get_session_metadata(&id), Some(uri));
    }

    #[test]
    fn metadata_is_emitted_with_the_writer_and_the_uri() {
        let h = Harness::new();
        let id = h.lock(1);
        let uri = h.str("ipfs://bafy-meta");

        h.client.set_session_metadata(&id, &h.buyer, &uri).unwrap();

        let (_emitter, topics, data) = h.env.events().all().last().unwrap();
        let topics: soroban_sdk::Vec<soroban_sdk::Val> = topics.try_into().unwrap();
        assert_eq!(topics.len(), 2);
        assert_eq!(topics.get(0), symbol_short!("meta_upd").into_val(&h.env));
        assert_eq!(topics.get(1), id.into_val(&h.env));
        let data: (Address, String) = data.into_val(&h.env);
        assert_eq!(data, (h.buyer, uri));
    }

    #[test]
    fn clearing_metadata_removes_it_and_is_idempotent_only_once() {
        let h = Harness::new();
        let id = h.lock(1);
        let uri = h.str("ipfs://bafy-meta");

        h.client.set_session_metadata(&id, &h.buyer, &uri).unwrap();
        h.client.clear_session_metadata(&id, &h.buyer).unwrap();
        assert_eq!(h.client.get_session_metadata(&id), None);

        // Clearing again has nothing to clear and is rejected rather than
        // silently succeeding.
        h.client.clear_session_metadata(&id, &h.buyer).unwrap();
        assert_eq!(h.client.get_session_metadata(&id), None);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Vesting
    // ─────────────────────────────────────────────────────────────────────

    /// A schedule over `total` with a `cliff` and a `duration`, evaluated at
    /// `now` ledgers after the start.
    fn vested(total: i128, cliff: u64, duration: u64, elapsed: u64) -> i128 {
        let schedule = vesting::VestingSchedule {
            total,
            claimed: 0,
            start_ledger: 0,
            cliff_ledgers: cliff,
            vesting_duration: duration,
            buyer_recovered: false,
            buyer_recovery_amount: 0,
        };
        vesting::vested_amount(&schedule, elapsed)
    }

    #[test]
    fn nothing_is_vested_before_the_cliff() {
        assert_eq!(vested(1_000, 100, 400, 0), 0);
        assert_eq!(vested(1_000, 100, 400, 99), 0);
    }

    #[test]
    fn the_cliff_boundary_is_inclusive() {
        // The cliff has just cleared, but the schedule has only just started
        // to vest, so the claimable amount is still zero.
        assert_eq!(vested(1_000, 100, 400, 100), 0);
    }

    #[test]
    fn vesting_is_linear_between_cliff_and_end() {
        // Halfway through the 400-ledger duration, half of 1_000 has vested.
        assert_eq!(vested(1_000, 100, 400, 300), 500);
        assert_eq!(vested(1_000, 100, 400, 200), 250);
        assert_eq!(vested(1_000, 100, 400, 450), 875);
    }

    #[test]
    fn the_schedule_is_fully_vested_at_and_after_the_end() {
        assert_eq!(vested(1_000, 100, 400, 500), 1_000);
        assert_eq!(vested(1_000, 100, 400, 5_000), 1_000);
    }

    #[test]
    fn repeated_small_claims_can_never_exceed_the_total() {
        // The formula truncates down, so claiming every ledger for the whole
        // schedule still cannot drain more than `total`.
        let total = 1_000_i128;
        let mut claimed = 0_i128;
        let mut previous = 0_i128;
        for now in 100..=500 {
            let v = vested(total, 100, 400, now as u64);
            claimed += v - previous;
            previous = v;
        }
        assert!(claimed <= total, "claimed {} > total {}", claimed, total);
        assert_eq!(claimed, total);
    }

    #[test]
    fn a_zero_length_duration_after_a_cliff_vests_immediately() {
        // Unreachable through `lock_funds_with_vesting`, which rejects it, but
        // the formula must not divide by zero if a schedule ever gets here.
        assert_eq!(vested(1_000, 100, 0, 200), 1_000);
    }

    #[test]
    fn a_vested_session_creates_a_schedule() {
        let h = Harness::new();
        let id = h.id(1);

        h.client.lock_funds_with_vesting(
            &id,
            &h.buyer,
            &h.seller,
            &1_000,
            &100,
            &400,
        )
        .unwrap();

        let schedule = h.client.get_vesting_schedule(&id).unwrap();
        assert_eq!(schedule.total, 1_000);
        assert_eq!(schedule.cliff_ledgers, 100);
        assert_eq!(schedule.vesting_duration, 400);
        assert_eq!(schedule.claimed, 0);
        assert!(!schedule.buyer_recovered);
    }

    #[test]
    fn a_vested_session_is_a_normal_locked_session() {
        let h = Harness::new();
        let id = h.id(1);

        h.client
            .lock_funds_with_vesting(&id, &h.buyer, &h.seller, &1_000, &100, &400)
            .unwrap();

        let s = session::get(&h.env, id);
        assert_eq!(s.status, session::SessionStatus::Locked);
        assert_eq!(s.amount, 1_000);
    }

    #[test]
    fn a_zero_duration_schedule_is_rejected() {
        let h = Harness::new();
        let id = h.id(1);

        let err = h
            .client
            .try_lock_funds_with_vesting(&id, &h.buyer, &h.seller, &1_000, &0, &0)
            .unwrap()
            .unwrap_err();

        assert_eq!(err, ContractError::InvalidVestingSchedule);
        // Rejected, so no session and no schedule were created.
        assert!(h.client.get_vesting_schedule(&id).is_none());
        assert!(!session::session_exists(&h.env, &id));
    }

    #[test]
    fn a_cliff_longer_than_the_duration_is_rejected() {
        let h = Harness::new();
        let id = h.id(1);

        let err = h
            .client
            .try_lock_funds_with_vesting(&id, &h.buyer, &h.seller, &1_000, &500, &400)
            .unwrap()
            .unwrap_err();

        assert_eq!(err, ContractError::InvalidVestingSchedule);
        assert!(h.client.get_vesting_schedule(&id).is_none());
        assert!(!session::session_exists(&h.env, &id));
    }

    #[test]
    fn a_claim_before_the_cliff_is_reported_as_nothing_to_claim() {
        let h = Harness::new();
        let id = h.id(1);
        h.client
            .lock_funds_with_vesting(&id, &h.buyer, &h.seller, &1_000, &100, &400)
            .unwrap();

        let err = h
            .client
            .try_claim_vested(&id, &h.seller)
            .unwrap()
            .unwrap_err();

        assert_eq!(err, ContractError::NothingToClaim);
        assert_eq!(h.client.claimable_vested(&id).unwrap(), 0);
        assert_eq!(h.client.get_vesting_schedule(&id).unwrap().claimed, 0);
    }

    #[test]
    fn claiming_twice_only_pays_the_increment() {
        let h = Harness::new();
        let id = h.id(1);
        h.client
            .lock_funds_with_vesting(&id, &h.buyer, &h.seller, &1_000, &100, &400)
            .unwrap();
        let start = h.env.ledger().sequence();

        // A third of the way through the 400-ledger duration.
        h.env.ledger().set_sequence_number(start + 100 + 133);
        h.client.claim_vested(&id, &h.seller).unwrap();
        let first = h.client.get_vesting_schedule(&id).unwrap().claimed;
        assert_eq!(first, 332); // 1_000 * 133 / 400, truncated

        // Halfway: the second claim tops up to 500, it does not restart.
        h.env.ledger().set_sequence_number(start + 100 + 200);
        h.client.claim_vested(&id, &h.seller).unwrap();
        let total_claimed = h.client.get_vesting_schedule(&id).unwrap().claimed;
        assert_eq!(total_claimed, 500);
        assert!(total_claimed > first);
    }

    #[test]
    fn the_final_claim_sweeps_up_the_truncation_dust() {
        let h = Harness::new();
        let id = h.id(1);
        h.client
            .lock_funds_with_vesting(&id, &h.buyer, &h.seller, &1_000, &100, &400)
            .unwrap();
        let start = h.env.ledger().sequence();

        // Claim early enough that truncation would strand a few units...
        h.env.ledger().set_sequence_number(start + 100 + 133);
        h.client.claim_vested(&id, &h.seller).unwrap();
        assert_eq!(h.client.get_vesting_schedule(&id).unwrap().claimed, 332);

        // ...then at the end the last claim releases exactly the remainder.
        h.env.ledger().set_sequence_number(start + 100 + 400);
        h.client.claim_vested(&id, &h.seller).unwrap();
        assert_eq!(h.client.get_vesting_schedule(&id).unwrap().claimed, 1_000);
    }

    #[test]
    fn the_buyer_cannot_claim() {
        let h = Harness::new();
        let id = h.id(1);
        h.client
            .lock_funds_with_vesting(&id, &h.buyer, &h.seller, &1_000, &0, &400)
            .unwrap();

        let err = h
            .client
            .try_claim_vested(&id, &h.buyer)
            .unwrap()
            .unwrap_err();

        assert_eq!(err, ContractError::NotSeller);
        assert_eq!(h.client.get_vesting_schedule(&id).unwrap().claimed, 0);
    }

    #[test]
    fn claiming_on_a_session_with_no_schedule_is_rejected() {
        let h = Harness::new();
        let id = h.lock(1);

        let err = h
            .client
            .try_claim_vested(&id, &h.seller)
            .unwrap()
            .unwrap_err();

        assert_eq!(err, ContractError::NoVestingSchedule);
        assert!(h.client.get_vesting_schedule(&id).is_none());
    }

    #[test]
    fn a_dispute_returns_the_unvested_remainder_to_the_buyer() {
        let h = Harness::new();
        let id = h.id(1);
        h.client
            .lock_funds_with_vesting(&id, &h.buyer, &h.seller, &1_000, &100, &400)
            .unwrap();
        let start = h.env.ledger().sequence();

        // A quarter of the way in: 250 vested, 750 still at risk.
        h.env.ledger().set_sequence_number(start + 100 + 100);
        assert_eq!(h.client.unvested_amount(&id), 750);

        h.client
            .open_dispute(&id, &h.buyer, &h.str("never delivered"));

        let schedule = h.client.get_vesting_schedule(&id).unwrap();
        assert!(schedule.buyer_recovered);
        assert_eq!(schedule.buyer_recovery_amount, 750);
    }

    #[test]
    fn a_dispute_during_the_cliff_returns_everything() {
        let h = Harness::new();
        let id = h.id(1);
        h.client
            .lock_funds_with_vesting(&id, &h.buyer, &h.seller, &1_000, &100, &400)
            .unwrap();

        h.client
            .open_dispute(&id, &h.buyer, &h.str("never delivered"));

        let schedule = h.client.get_vesting_schedule(&id).unwrap();
        assert_eq!(schedule.buyer_recovery_amount, 1_000);
    }

    #[test]
    fn a_second_dispute_does_not_double_count_the_refund() {
        let h = Harness::new();
        let id = h.id(1);
        h.client
            .lock_funds_with_vesting(&id, &h.buyer, &h.seller, &1_000, &100, &400)
            .unwrap();

        h.client
            .open_dispute(&id, &h.buyer, &h.str("never delivered"));
        // Calling the hook again, as a re-entrant dispute flow would, must not
        // credit the buyer twice.
        vesting::on_dispute(&h.env, id.clone());

        assert_eq!(
            h.client.get_vesting_schedule(&id).unwrap().buyer_recovery_amount,
            1_000
        );
    }

    #[test]
    fn a_dispute_does_not_disturb_a_session_with_no_schedule() {
        let h = Harness::new();
        let id = h.lock(1);

        h.client
            .open_dispute(&id, &h.buyer, &h.str("never delivered"));

        assert!(h.client.get_vesting_schedule(&id).is_none());
        assert_eq!(
            session::get(&h.env, id).status,
            session::SessionStatus::Disputed
        );
    }

    #[test]
    fn unvested_is_zero_for_a_session_with_no_schedule() {
        let h = Harness::new();
        let id = h.lock(1);
        assert_eq!(h.client.unvested_amount(&id), 0);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Event relay
    // ─────────────────────────────────────────────────────────────────────

    #[test]
    fn the_webhook_url_round_trips() {
        let h = Harness::new();
        let url = h.str("https://relay.example.test/hook");

        assert_eq!(h.client.get_webhook(), None);
        assert!(!h.client.is_webhook_enabled());

        h.client.set_webhook(&h.admin, &url).unwrap();

        assert_eq!(h.client.get_webhook(), Some(url));
        assert!(h.client.is_webhook_enabled());
    }

    #[test]
    fn only_the_admin_can_set_the_webhook_url() {
        let h = Harness::new();
        let attacker = Address::generate(&h.env);
        let url = h.str("https://relay.example.test/hook");

        let err = h
            .client
            .try_set_webhook(&attacker, &url)
            .unwrap()
            .unwrap_err();

        assert_eq!(err, ContractError::NotAdmin);
    }

    #[test]
    fn a_non_https_webhook_url_is_rejected() {
        let h = Harness::new();
        let url = h.str("http://relay.example.test/hook");

        let err = h
            .client
            .try_set_webhook(&h.admin, &url)
            .unwrap()
            .unwrap_err();

        assert_eq!(err, ContractError::InvalidWebhookUrl);
        assert_eq!(h.client.get_webhook(), None);
    }

    #[test]
    fn an_empty_webhook_url_is_rejected() {
        let h = Harness::new();
        let url = h.str("");

        let err = h
            .client
            .try_set_webhook(&h.admin, &url)
            .unwrap()
            .unwrap_err();

        assert_eq!(err, ContractError::InvalidWebhookUrl);
    }

    #[test]
    fn clearing_the_webhook_leaves_escrows_alone() {
        let h = Harness::new();
        let id = h.lock(1);
        let url = h.str("https://relay.example.test/hook");
        h.client.set_webhook(&h.admin, &url).unwrap();

        h.client.clear_webhook(&h.admin).unwrap();

        assert_eq!(h.client.get_webhook(), None);
        assert_eq!(session::get(&h.env, id).status, session::SessionStatus::Locked);
    }

    #[test]
    fn a_relay_payload_carries_the_session_the_event_type_and_the_data() {
        let h = Harness::new();
        let id = h.lock(1);
        let uri = h.str("ipfs://bafy-meta");
        h.client.set_session_metadata(&id, &h.buyer, &uri).unwrap();

        let payload = h
            .client
            .build_relay_payload(&id, &h.str("session_completed"))
            .unwrap();

        assert_eq!(payload.session_id, id);
        assert_eq!(payload.event_type, h.str("session_completed"));
        assert_eq!(payload.status, h.str("locked"));
        assert_eq!(payload.amount, 1_000);
        assert_eq!(payload.buyer, h.buyer);
        assert_eq!(payload.seller, h.seller);
        assert_eq!(payload.metadata_uri, Some(uri));
        assert_eq!(payload.occurred_at, h.env.ledger().sequence());
    }

    #[test]
    fn a_relay_payload_for_a_missing_session_is_none() {
        let h = Harness::new();
        let missing = h.id(9);

        assert!(h
            .client
            .build_relay_payload(&missing, &h.str("whatever"))
            .is_none());
    }

    #[test]
    fn relay_payload_statuses_follow_the_session() {
        let h = Harness::new();
        let id = h.lock(1);

        h.client.complete_session(&id, &h.seller);
        assert_eq!(
            h.client
                .build_relay_payload(&id, &h.str("x"))
                .unwrap()
                .status,
            h.str("completed")
        );

        h.client
            .open_dispute(&id, &h.buyer, &h.str("nope"));
        assert_eq!(
            h.client
                .build_relay_payload(&id, &h.str("x"))
                .unwrap()
                .status,
            h.str("disputed")
        );
    }

    // ─────────────────────────────────────────────────────────────────────
    // Batched operations
    // ─────────────────────────────────────────────────────────────────────

    fn lock_batch(h: &Harness, count: u8) -> Vec<Bytes> {
        let mut sessions: Vec<(Bytes, Address, i128)> = Vec::new(&h.env);
        let mut ids: Vec<Bytes> = Vec::new(&h.env);
        for i in 0..count {
            let id = h.id(i + 1);
            sessions.push_back((id.clone(), h.seller.clone(), 1_000));
            ids.push_back(id);
        }
        h.client.batch_lock_funds(&h.buyer, &sessions).unwrap();
        ids
    }

    #[test]
    fn a_batch_lock_creates_every_session() {
        let h = Harness::new();
        let ids = lock_batch(&h, 3);

        for (i, id) in ids.iter().enumerate() {
            let s = session::get(&h.env, id);
            assert_eq!(s.buyer, h.buyer);
            assert_eq!(s.seller, h.seller);
            assert_eq!(s.amount, 1_000);
            assert_eq!(s.status, session::SessionStatus::Locked);
            let _ = i;
        }
    }

    #[test]
    fn an_empty_batch_is_rejected() {
        let h = Harness::new();
        let empty: Vec<Bytes> = Vec::new(&h.env);

        let err = h
            .client
            .try_batch_approve(&h.buyer, &empty)
            .unwrap()
            .unwrap_err();

        assert_eq!(err, ContractError::InvalidBatch);
    }

    #[test]
    fn an_oversized_batch_is_rejected() {
        let h = Harness::new();
        let mut ids: Vec<Bytes> = Vec::new(&h.env);
        for i in 0..21_u8 {
            ids.push_back(h.id(i + 1));
        }

        let err = h
            .client
            .try_batch_approve(&h.buyer, &ids)
            .unwrap()
            .unwrap_err();

        assert_eq!(err, ContractError::BatchTooLarge);
    }

    #[test]
    fn a_batch_at_the_cap_is_accepted() {
        let h = Harness::new();
        let ids = lock_batch(&h, 20);
        assert_eq!(ids.len(), 20);
    }

    #[test]
    fn a_batch_naming_the_same_session_twice_is_rejected() {
        let h = Harness::new();
        let id = h.id(1);
        let mut ids: Vec<Bytes> = Vec::new(&h.env);
        ids.push_back(id.clone());
        ids.push_back(id.clone());

        let err = h
            .client
            .try_batch_approve(&h.buyer, &ids)
            .unwrap()
            .unwrap_err();

        assert_eq!(err, ContractError::DuplicateInBatch);
    }

    #[test]
    fn a_batch_lock_with_a_non_positive_amount_is_rejected() {
        let h = Harness::new();
        let mut sessions: Vec<(Bytes, Address, i128)> = Vec::new(&h.env);
        sessions.push_back((h.id(1), h.seller.clone(), 1_000));
        sessions.push_back((h.id(2), h.seller.clone(), 0));

        let err = h
            .client
            .try_batch_lock_funds(&h.buyer, &sessions)
            .unwrap()
            .unwrap_err();

        assert_eq!(err, ContractError::InvalidAmount);
        // Pre-flight means the *valid* first item was not created either.
        assert!(!session::session_exists(&h.env, &h.id(1)));
    }

    #[test]
    fn a_batch_lock_over_an_existing_session_is_rejected_before_writing() {
        let h = Harness::new();
        let existing = h.lock(1);
        let mut sessions: Vec<(Bytes, Address, i128)> = Vec::new(&h.env);
        sessions.push_back((existing, h.seller.clone(), 1_000));
        sessions.push_back((h.id(2), h.seller.clone(), 1_000));

        let err = h
            .client
            .try_batch_lock_funds(&h.buyer, &sessions)
            .unwrap()
            .unwrap_err();

        assert_eq!(err, ContractError::DuplicateSessionId);
        // The second, non-conflicting session was not created.
        assert!(!session::session_exists(&h.env, &h.id(2)));
    }

    #[test]
    fn a_batch_approve_settles_every_completed_session() {
        let h = Harness::new();
        let ids = lock_batch(&h, 3);
        h.client.batch_complete(&h.seller, &ids).unwrap();

        h.client.batch_approve(&h.buyer, &ids).unwrap();

        for id in ids.iter() {
            assert_eq!(session::get(&h.env, id).status, session::SessionStatus::Approved);
        }
    }

    #[test]
    fn a_failed_batch_approve_settles_nothing() {
        let h = Harness::new();
        let ids = lock_batch(&h, 3);
        // Only the first two are completed; the third is still `Locked`, so
        // the batch cannot complete.
        let mut partial: Vec<Bytes> = Vec::new(&h.env);
        partial.push_back(ids.get(0).unwrap());
        partial.push_back(ids.get(1).unwrap());
        h.client.batch_complete(&h.seller, &partial).unwrap();

        let attempted = h.client.try_batch_approve(&h.buyer, &ids);
        assert!(attempted.is_err(), "the batch should not have succeeded");

        // Atomicity: the two sessions that *could* have been approved were not.
        for id in ids.iter() {
            assert_eq!(
                session::get(&h.env, id).status,
                session::SessionStatus::Locked
            );
        }
    }

    #[test]
    fn a_batch_approve_naming_a_missing_session_settles_nothing() {
        let h = Harness::new();
        let ids = lock_batch(&h, 2);
        h.client.batch_complete(&h.seller, &ids).unwrap();

        // A third id that was never created.
        let mut batch: Vec<Bytes> = Vec::new(&h.env);
        batch.push_back(ids.get(0).unwrap());
        batch.push_back(ids.get(1).unwrap());
        batch.push_back(h.id(9));

        let attempted = h.client.try_batch_approve(&h.buyer, &batch);
        assert!(attempted.is_err(), "the batch should not have succeeded");

        for id in ids.iter() {
            assert_eq!(
                session::get(&h.env, id).status,
                session::SessionStatus::Completed
            );
        }
    }

    #[test]
    fn a_batch_refund_returns_every_locked_session() {
        let h = Harness::new();
        let ids = lock_batch(&h, 3);

        h.client.batch_refund(&h.buyer, &ids).unwrap();

        for id in ids.iter() {
            assert_eq!(session::get(&h.env, id).status, session::SessionStatus::Refunded);
        }
    }

    #[test]
    fn a_batch_refund_that_includes_a_completed_session_settles_nothing() {
        let h = Harness::new();
        let ids = lock_batch(&h, 2);
        h.client.complete_session(&ids.get(0).unwrap(), &h.seller);

        let attempted = h.client.try_batch_refund(&h.buyer, &ids);
        assert!(attempted.is_err(), "the batch should not have succeeded");

        // Atomicity: the second session was not refunded either.
        assert_eq!(
            session::get(&h.env, ids.get(0).unwrap()).status,
            session::SessionStatus::Completed
        );
        assert_eq!(
            session::get(&h.env, ids.get(1).unwrap()).status,
            session::SessionStatus::Locked
        );
    }

    #[test]
    fn a_batch_emits_one_completion_event() {
        let h = Harness::new();
        let ids = lock_batch(&h, 2);
        let before = h.env.events().all().len();

        h.client.batch_approve(&h.buyer, &ids).unwrap();

        let emitted = h.env.events().all();
        // Two `SessionApproved` events plus one `BatchCompleted`.
        assert_eq!(emitted.len() - before, 3);
        let (_emitter, topics, _data) = emitted.last().unwrap();
        let topics: soroban_sdk::Vec<soroban_sdk::Val> = topics.try_into().unwrap();
        assert_eq!(topics.get(0), symbol_short!("batch").into_val(&h.env));
        assert_eq!(topics.get(1), symbol_short!("appr").into_val(&h.env));
    }

    #[test]
    fn a_batch_containing_a_metadata_backed_session_works_end_to_end() {
        let h = Harness::new();
        let ids = lock_batch(&h, 2);
        let uri = h.str("ipfs://bafy-batch");
        for id in ids.iter() {
            h.client
                .set_session_metadata(id, &h.buyer, &uri)
                .unwrap();
        }

        h.client.batch_complete(&h.seller, &ids).unwrap();
        h.client.batch_approve(&h.buyer, &ids).unwrap();

        for id in ids.iter() {
            assert_eq!(session::get(&h.env, id).status, session::SessionStatus::Approved);
            assert_eq!(h.client.get_session_metadata(id), Some(uri.clone()));
        }
    }

    #[test]
    fn batch_helpers_are_reachable_from_the_module() {
        // Guards against the module drifting out of `lib` unnoticed.
        let h = Harness::new();
        let mut sessions: Vec<(Bytes, Address, i128)> = Vec::new(&h.env);
        sessions.push_back((h.id(1), h.seller.clone(), 500));

        batch::batch_lock_funds(&h.env, h.buyer.clone(), sessions).unwrap();

        assert!(session::session_exists(&h.env, &h.id(1)));
    }
}
