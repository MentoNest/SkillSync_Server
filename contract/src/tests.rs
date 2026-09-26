//! Integration tests for the error taxonomy.
//!
//! These are deliberately written against the generated client rather than
//! the internal modules: the point is to prove that a given *public* entry
//! point surfaces a given *wire* code, which is what an off-chain caller
//! actually observes. A unit test inside a module can only prove the module
//! returns an error, not that the error survives the contract boundary.

#[cfg(test)]
mod tests {
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::{Address, Bytes, Env, String};

    use crate::errors::ContractError;
    use crate::testutil;
    use crate::{SkillSyncContract, SkillSyncContractClient};

    /// Environment, initialized contract, a client, and a token to escrow in.
    ///
    /// The token is registered but not funded: funding lives in [`Harness::lock`]
    /// so it sits next to the assertion that depends on it.
    struct Harness {
        env: Env,
        admin: Address,
        treasury: Address,
        token: Address,
        client: SkillSyncContractClient<'static>,
    }

    impl Harness {
        fn new() -> Self {
            let env = Env::default();
            env.mock_all_auths();

            let contract_id = env.register(SkillSyncContract, ());
            let client = SkillSyncContractClient::new(&env, &contract_id);

            let admin: Address = Address::generate(&env);
            let treasury: Address = Address::generate(&env);
            client.initialize(&admin, &treasury).unwrap();
            let token = testutil::new_token(&env);

            Harness {
                env,
                admin,
                treasury,
                token,
                client,
            }
        }

        /// Create a session escrowing `amount` of the harness token between
        /// `buyer` and `seller`, funding the buyer first.
        fn lock(&self, id: &Bytes, buyer: &Address, seller: &Address, amount: i128) {
            testutil::fund(&self.env, &self.token, buyer, amount);
            self.client
                .lock_funds(id, buyer, seller, &amount, &self.token)
                .unwrap();
        }
    }

    fn session_id(env: &Env, byte: u8) -> Bytes {
        Bytes::from_slice(env, &[byte; 32])
    }

    /// Unwrap a `try_*` result down to the contract error it surfaced.
    ///
    /// The outer `Result` is the host call (did the transaction run at all),
    /// the inner one is the contract's own `Result`. Asserting on the inner
    /// one is what distinguishes "the contract rejected this with 402" from
    /// "the host blew up".
    fn contract_error<T, E>(res: Result<Result<T, E>, Result<E, soroban_sdk::Error>>) -> E
    where
        E: core::fmt::Debug,
    {
        match res {
            Ok(Ok(_)) => panic!("expected the call to be rejected"),
            Ok(Err(e)) => e,
            Err(host) => panic!("host-level failure, expected a contract error: {:?}", host),
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // Initialization band (1–99)
    // ─────────────────────────────────────────────────────────────────────

    #[test]
    fn initialize_succeeds_once() {
        let h = Harness::new();
        assert!(h.client.try_initialize(&h.admin, &h.treasury).is_ok());
    }

    #[test]
    fn already_initialized_is_reported_as_such() {
        let h = Harness::new();
        let err = contract_error(h.client.try_initialize(&h.admin, &h.treasury));
        assert_eq!(err, ContractError::AlreadyInitialized);
        assert_eq!(err.code(), 1);
    }

    #[test]
    fn admin_only_setters_report_not_initialized_before_initialize() {
        let h = Harness::new();
        let err = contract_error(h.client.try_set_platform_fee(&h.admin, &100));
        assert_eq!(err, ContractError::NotInitialized);
        assert_eq!(err.code(), 2);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Authorization band (200–299)
    // ─────────────────────────────────────────────────────────────────────

    #[test]
    fn non_admin_fee_update_reports_not_admin() {
        let h = Harness::new();
        let attacker = Address::generate(&h.env);

        let err = contract_error(h.client.try_set_platform_fee(&attacker, &100));
        assert_eq!(err, ContractError::NotAdmin);
        assert_eq!(err.code(), 201);
    }

    #[test]
    fn refund_by_a_non_buyer_reports_not_buyer() {
        let h = Harness::new();
        let buyer = Address::generate(&h.env);
        let seller = Address::generate(&h.env);
        let id = session_id(&h.env, 1);
        h.lock(&id, &buyer, &seller, 1_000);

        let err = contract_error(h.client.try_refund_session(&id, &seller));
        assert_eq!(err, ContractError::NotBuyer);
        assert_eq!(err.code(), 202);
    }

    #[test]
    fn completion_by_a_non_seller_reports_not_seller() {
        let h = Harness::new();
        let buyer = Address::generate(&h.env);
        let seller = Address::generate(&h.env);
        let id = session_id(&h.env, 1);
        h.lock(&id, &buyer, &seller, 1_000);

        let err = contract_error(h.client.try_complete_session(&id, &buyer));
        assert_eq!(err, ContractError::NotSeller);
        assert_eq!(err.code(), 203);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Session validation band (300–399)
    // ─────────────────────────────────────────────────────────────────────

    #[test]
    fn acting_on_a_missing_session_reports_not_found() {
        let h = Harness::new();
        let caller = Address::generate(&h.env);
        let missing = session_id(&h.env, 9);

        for err in [
            contract_error(h.client.try_complete_session(&missing, &caller)),
            contract_error(h.client.try_approve_session(&missing, &caller)),
            contract_error(h.client.try_refund_session(&missing, &caller)),
        ] {
            assert_eq!(err, ContractError::SessionNotFound);
            assert_eq!(err.code(), 300);
        }
    }

    #[test]
    fn a_second_lock_reports_duplicate_session_id() {
        let h = Harness::new();
        let buyer = Address::generate(&h.env);
        let seller = Address::generate(&h.env);
        let id = session_id(&h.env, 1);
        h.lock(&id, &buyer, &seller, 1_000);

        let err = contract_error(
            h.client
                .try_lock_funds(&id, &buyer, &seller, &1_000, &h.token),
        );
        assert_eq!(err, ContractError::DuplicateSessionId);
        assert_eq!(err.code(), 301);
    }

    #[test]
    fn approving_a_locked_session_reports_invalid_state() {
        let h = Harness::new();
        let buyer = Address::generate(&h.env);
        let seller = Address::generate(&h.env);
        let id = session_id(&h.env, 1);
        h.lock(&id, &buyer, &seller, 1_000);

        let err = contract_error(h.client.try_approve_session(&id, &buyer));
        assert_eq!(err, ContractError::InvalidSessionState);
        assert_eq!(err.code(), 302);
    }

    #[test]
    fn completing_twice_reports_already_completed() {
        let h = Harness::new();
        let buyer = Address::generate(&h.env);
        let seller = Address::generate(&h.env);
        let id = session_id(&h.env, 1);
        h.lock(&id, &buyer, &seller, 1_000);
        h.client.complete_session(&id, &seller).unwrap();

        let err = contract_error(h.client.try_complete_session(&id, &seller));
        assert_eq!(err, ContractError::SessionAlreadyCompleted);
        assert_eq!(err.code(), 303);
    }

    #[test]
    fn approving_twice_reports_already_approved() {
        let h = Harness::new();
        let buyer = Address::generate(&h.env);
        let seller = Address::generate(&h.env);
        let id = session_id(&h.env, 1);
        h.lock(&id, &buyer, &seller, 1_000);
        h.client.complete_session(&id, &seller).unwrap();
        h.client.approve_session(&id, &buyer).unwrap();

        let err = contract_error(h.client.try_approve_session(&id, &buyer));
        assert_eq!(err, ContractError::SessionAlreadyApproved);
        assert_eq!(err.code(), 304);
    }

    #[test]
    fn refunding_twice_reports_already_refunded() {
        let h = Harness::new();
        let buyer = Address::generate(&h.env);
        let seller = Address::generate(&h.env);
        let id = session_id(&h.env, 1);
        h.lock(&id, &buyer, &seller, 1_000);
        h.client.refund_session(&id, &buyer).unwrap();

        let err = contract_error(h.client.try_refund_session(&id, &buyer));
        assert_eq!(err, ContractError::SessionAlreadyRefunded);
        assert_eq!(err.code(), 305);
    }

    #[test]
    fn acting_on_a_disputed_session_reports_session_in_dispute() {
        let h = Harness::new();
        let buyer = Address::generate(&h.env);
        let seller = Address::generate(&h.env);
        let id = session_id(&h.env, 1);
        h.lock(&id, &buyer, &seller, 1_000);
        h.client.complete_session(&id, &seller).unwrap();
        h.client
            .open_dispute(&id, &buyer, &String::from_str(&h.env, "not delivered"))
            .unwrap();

        for err in [
            contract_error(h.client.try_approve_session(&id, &buyer)),
            contract_error(h.client.try_refund_session(&id, &buyer)),
        ] {
            assert_eq!(err, ContractError::SessionInDispute);
            assert_eq!(err.code(), 306);
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // Financial validation band (400–499)
    // ─────────────────────────────────────────────────────────────────────

    #[test]
    fn locking_a_non_positive_amount_reports_invalid_amount() {
        let h = Harness::new();
        let buyer = Address::generate(&h.env);
        let seller = Address::generate(&h.env);

        for amount in [0_i128, -1] {
            let err = contract_error(
                h.client
                    .try_lock_funds(&session_id(&h.env, 1), &buyer, &seller, &amount, &h.token),
            );
            assert_eq!(err, ContractError::InvalidAmount);
            assert_eq!(err.code(), 400);
        }
    }

    #[test]
    fn locking_without_enough_of_the_token_reports_a_transfer_failure() {
        let h = Harness::new();
        let buyer = Address::generate(&h.env);
        let seller = Address::generate(&h.env);
        testutil::fund(&h.env, &h.token, &buyer, 10);

        let err = contract_error(
            h.client
                .try_lock_funds(&session_id(&h.env, 1), &buyer, &seller, &1_000, &h.token),
        );
        assert_eq!(err, ContractError::TokenTransferFailed);
        assert_eq!(err.code(), 406);
    }

    #[test]
    fn a_fee_above_ten_percent_reports_fee_too_high() {
        let h = Harness::new();
        let err = contract_error(h.client.try_set_platform_fee(&h.admin, &1_001));
        assert_eq!(err, ContractError::FeeTooHigh);
        assert_eq!(err.code(), 402);
    }

    #[test]
    fn a_dispute_split_that_does_not_sum_reports_invalid_split() {
        let h = Harness::new();
        let buyer = Address::generate(&h.env);
        let seller = Address::generate(&h.env);
        let id = session_id(&h.env, 1);
        h.lock(&id, &buyer, &seller, 1_000);
        h.client
            .open_dispute(&id, &buyer, &String::from_str(&h.env, "nope"))
            .unwrap();

        let err = contract_error(
            h.client
                .try_resolve_dispute(&id, &h.admin, &500, &400, &0),
        );
        assert_eq!(err, ContractError::InvalidSplit);
        assert_eq!(err.code(), 403);
    }

    #[test]
    fn an_overflowing_dispute_split_reports_overflow() {
        let h = Harness::new();
        let buyer = Address::generate(&h.env);
        let seller = Address::generate(&h.env);
        let id = session_id(&h.env, 1);
        h.lock(&id, &buyer, &seller, 1_000);
        h.client
            .open_dispute(&id, &buyer, &String::from_str(&h.env, "nope"))
            .unwrap();

        let err = contract_error(
            h.client
                .try_resolve_dispute(&id, &h.admin, &i128::MAX, &1, &0),
        );
        assert_eq!(err, ContractError::Overflow);
        assert_eq!(err.code(), 404);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Timeout / dispute band (500–599)
    // ─────────────────────────────────────────────────────────────────────

    #[test]
    fn resolving_without_a_dispute_reports_dispute_not_open() {
        let h = Harness::new();
        let buyer = Address::generate(&h.env);
        let seller = Address::generate(&h.env);
        let id = session_id(&h.env, 1);
        h.lock(&id, &buyer, &seller, 1_000);

        let err = contract_error(
            h.client
                .try_resolve_dispute(&id, &h.admin, &1_000, &0, &0),
        );
        assert_eq!(err, ContractError::DisputeNotOpen);
        assert_eq!(err.code(), 502);
    }

    #[test]
    fn disputing_twice_reports_dispute_already_open() {
        let h = Harness::new();
        let buyer = Address::generate(&h.env);
        let seller = Address::generate(&h.env);
        let id = session_id(&h.env, 1);
        h.lock(&id, &buyer, &seller, 1_000);
        h.client
            .open_dispute(&id, &buyer, &String::from_str(&h.env, "first"))
            .unwrap();

        let err = contract_error(
            h.client
                .try_open_dispute(&id, &seller, &String::from_str(&h.env, "second")),
        );
        assert_eq!(err, ContractError::DisputeAlreadyOpen);
        assert_eq!(err.code(), 501);
    }

    #[test]
    fn disputing_by_a_stranger_reports_unauthorized() {
        let h = Harness::new();
        let buyer = Address::generate(&h.env);
        let seller = Address::generate(&h.env);
        let stranger = Address::generate(&h.env);
        let id = session_id(&h.env, 1);
        h.lock(&id, &buyer, &seller, 1_000);

        let err = contract_error(
            h.client
                .try_open_dispute(&id, &stranger, &String::from_str(&h.env, "nosy")),
        );
        assert_eq!(err, ContractError::Unauthorized);
        assert_eq!(err.code(), 200);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Upgrade band (600–699)
    // ─────────────────────────────────────────────────────────────────────

    #[test]
    fn a_zero_wasm_hash_reports_invalid_wasm_hash() {
        let h = Harness::new();
        let zero = soroban_sdk::BytesN::from_array(&h.env, &[0u8; 32]);

        let err = contract_error(h.client.try_stage_upgrade(&h.admin, &zero));
        assert_eq!(err, ContractError::InvalidWasmHash);
        assert_eq!(err.code(), 600);
    }

    #[test]
    fn executing_an_upgrade_with_nothing_staged_reports_invalid_wasm_hash() {
        let h = Harness::new();
        let err = contract_error(h.client.try_execute_upgrade(&h.admin));
        assert_eq!(err, ContractError::InvalidWasmHash);
        assert_eq!(err.code(), 600);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Happy paths that must keep working
    // ─────────────────────────────────────────────────────────────────────

    #[test]
    fn platform_fee_accepts_the_whole_allowed_range() {
        let h = Harness::new();

        // 0 bps, 1000 bps (exactly 10%, the ceiling) and a mid value.
        for bps in [0_u32, 250, 1_000] {
            h.client.set_platform_fee(&h.admin, &bps).unwrap();
            assert_eq!(h.client.get_platform_fee(), bps);
        }
    }

    #[test]
    fn platform_fee_defaults_to_zero() {
        let h = Harness::new();
        assert_eq!(h.client.get_platform_fee(), 0);
    }

    // ─────────────────────────────────────────────────────────────────────
    // String conversion
    // ─────────────────────────────────────────────────────────────────────

    #[test]
    fn every_error_converts_to_a_code_and_a_readable_string() {
        use std::format;
        use std::string::ToString;

        let pairs = [
            (ContractError::NotAdmin, 201),
            (ContractError::NotBuyer, 202),
            (ContractError::NotSeller, 203),
            (ContractError::SessionInDispute, 306),
            (ContractError::InsufficientBalance, 401),
            (ContractError::FeeTooHigh, 402),
            (ContractError::InvalidWasmHash, 600),
            (ContractError::UpgradeFailed, 601),
        ];

        for (error, code) in pairs {
            assert_eq!(error.code(), code);
            let rendered = error.to_string();
            assert!(
                rendered.contains(&format!("{}", code)),
                "{:?} string form {:?} is missing its code",
                error,
                rendered
            );
            assert!(
                rendered.contains(" - "),
                "{:?} string form {:?} is missing a description",
                error,
                rendered
            );
        }
    }
}
