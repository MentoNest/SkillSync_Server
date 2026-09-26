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
    use crate::{SkillSyncContract, SkillSyncContractClient};

    /// Fresh environment, initialized contract, and a client bound to it.
    fn setup() -> (Env, Address, Address, SkillSyncContractClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(SkillSyncContract, ());
        let client = SkillSyncContractClient::new(&env, &contract_id);

        let admin: Address = Address::generate(&env);
        let treasury: Address = Address::generate(&env);
        client.initialize(&admin, &treasury);

        (env, admin, treasury, client)
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
    fn already_initialized_is_reported_as_such() {
        let (_env, admin, treasury, client) = setup();

        let err = contract_error(client.try_initialize(&admin, &treasury));
        assert_eq!(err, ContractError::AlreadyInitialized);
        assert_eq!(err.code(), 1);
    }

    #[test]
    fn admin_only_setters_report_not_initialized_before_initialize() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(SkillSyncContract, ());
        let client = SkillSyncContractClient::new(&env, &contract_id);
        let admin = Address::generate(&env);

        let err = contract_error(client.try_set_platform_fee(&admin, &100));
        assert_eq!(err, ContractError::NotInitialized);
        assert_eq!(err.code(), 2);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Authorization band (200–299)
    // ─────────────────────────────────────────────────────────────────────

    #[test]
    fn non_admin_fee_update_reports_not_admin() {
        let (env, _admin, _treasury, client) = setup();
        let attacker = Address::generate(&env);

        let err = contract_error(client.try_set_platform_fee(&attacker, &100));
        assert_eq!(err, ContractError::NotAdmin);
        assert_eq!(err.code(), 201);
    }

    #[test]
    fn refund_by_a_non_buyer_reports_not_buyer() {
        let (env, _admin, _treasury, client) = setup();
        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        let id = session_id(&env, 1);
        client.lock_funds(&id, &buyer, &seller, &1_000);

        let err = contract_error(client.try_refund_session(&id, &seller));
        assert_eq!(err, ContractError::NotBuyer);
        assert_eq!(err.code(), 202);
    }

    #[test]
    fn completion_by_a_non_seller_reports_not_seller() {
        let (env, _admin, _treasury, client) = setup();
        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        let id = session_id(&env, 1);
        client.lock_funds(&id, &buyer, &seller, &1_000);

        let err = contract_error(client.try_complete_session(&id, &buyer));
        assert_eq!(err, ContractError::NotSeller);
        assert_eq!(err.code(), 203);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Session validation band (300–399)
    // ─────────────────────────────────────────────────────────────────────

    #[test]
    fn acting_on_a_missing_session_reports_not_found() {
        let (env, _admin, _treasury, client) = setup();
        let caller = Address::generate(&env);
        let missing = session_id(&env, 9);

        for err in [
            contract_error(client.try_complete_session(&missing, &caller)),
            contract_error(client.try_approve_session(&missing, &caller)),
            contract_error(client.try_refund_session(&missing, &caller)),
        ] {
            assert_eq!(err, ContractError::SessionNotFound);
            assert_eq!(err.code(), 300);
        }
    }

    #[test]
    fn a_second_lock_reports_duplicate_session_id() {
        let (env, _admin, _treasury, client) = setup();
        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        let id = session_id(&env, 1);
        client.lock_funds(&id, &buyer, &seller, &1_000);

        let err = contract_error(client.try_lock_funds(&id, &buyer, &seller, &1_000));
        assert_eq!(err, ContractError::DuplicateSessionId);
        assert_eq!(err.code(), 301);
    }

    #[test]
    fn approving_a_locked_session_reports_invalid_state() {
        let (env, _admin, _treasury, client) = setup();
        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        let id = session_id(&env, 1);
        client.lock_funds(&id, &buyer, &seller, &1_000);

        let err = contract_error(client.try_approve_session(&id, &buyer));
        assert_eq!(err, ContractError::InvalidSessionState);
        assert_eq!(err.code(), 302);
    }

    #[test]
    fn completing_twice_reports_already_completed() {
        let (env, _admin, _treasury, client) = setup();
        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        let id = session_id(&env, 1);
        client.lock_funds(&id, &buyer, &seller, &1_000);
        client.complete_session(&id, &seller);

        let err = contract_error(client.try_complete_session(&id, &seller));
        assert_eq!(err, ContractError::SessionAlreadyCompleted);
        assert_eq!(err.code(), 303);
    }

    #[test]
    fn approving_twice_reports_already_approved() {
        let (env, _admin, treasury, client) = setup();
        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        let id = session_id(&env, 1);
        client.lock_funds(&id, &buyer, &seller, &1_000);
        client.complete_session(&id, &seller);
        client.approve_session(&id, &buyer);

        let err = contract_error(client.try_approve_session(&id, &buyer));
        assert_eq!(err, ContractError::SessionAlreadyApproved);
        assert_eq!(err.code(), 304);
    }

    #[test]
    fn refunding_twice_reports_already_refunded() {
        let (env, _admin, _treasury, client) = setup();
        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        let id = session_id(&env, 1);
        client.lock_funds(&id, &buyer, &seller, &1_000);
        client.refund_session(&id, &buyer);

        let err = contract_error(client.try_refund_session(&id, &buyer));
        assert_eq!(err, ContractError::SessionAlreadyRefunded);
        assert_eq!(err.code(), 305);
    }

    #[test]
    fn acting_on_a_disputed_session_reports_session_in_dispute() {
        let (env, _admin, _treasury, client) = setup();
        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        let id = session_id(&env, 1);
        client.lock_funds(&id, &buyer, &seller, &1_000);
        client.complete_session(&id, &seller);
        client.open_dispute(&id, &buyer, &String::from_str(&env, "not delivered"));

        for err in [
            contract_error(client.try_approve_session(&id, &buyer)),
            contract_error(client.try_refund_session(&id, &buyer)),
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
        let (env, _admin, _treasury, client) = setup();
        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);

        for amount in [0_i128, -1] {
            let err = contract_error(
                client.try_lock_funds(&session_id(&env, 1), &buyer, &seller, &amount),
            );
            assert_eq!(err, ContractError::InvalidAmount);
            assert_eq!(err.code(), 400);
        }
    }

    #[test]
    fn a_fee_above_ten_percent_reports_fee_too_high() {
        let (_env, admin, _treasury, client) = setup();

        let err = contract_error(client.try_set_platform_fee(&admin, &1_001));
        assert_eq!(err, ContractError::FeeTooHigh);
        assert_eq!(err.code(), 402);
    }

    #[test]
    fn a_dispute_split_that_does_not_sum_reports_invalid_split() {
        let (env, admin, _treasury, client) = setup();
        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        let id = session_id(&env, 1);
        client.lock_funds(&id, &buyer, &seller, &1_000);
        client.open_dispute(&id, &buyer, &String::from_str(&env, "nope"));

        let err = contract_error(client.try_resolve_dispute(&id, &admin, &500, &400, &0));
        assert_eq!(err, ContractError::InvalidSplit);
        assert_eq!(err.code(), 403);
    }

    #[test]
    fn an_overflowing_dispute_split_reports_overflow() {
        let (env, admin, _treasury, client) = setup();
        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        let id = session_id(&env, 1);
        client.lock_funds(&id, &buyer, &seller, &1_000);
        client.open_dispute(&id, &buyer, &String::from_str(&env, "nope"));

        let err = contract_error(
            client.try_resolve_dispute(&id, &admin, &i128::MAX, &1, &0),
        );
        assert_eq!(err, ContractError::Overflow);
        assert_eq!(err.code(), 404);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Timeout / dispute band (500–599)
    // ─────────────────────────────────────────────────────────────────────

    #[test]
    fn resolving_without_a_dispute_reports_dispute_not_open() {
        let (env, admin, _treasury, client) = setup();
        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        let id = session_id(&env, 1);
        client.lock_funds(&id, &buyer, &seller, &1_000);

        let err = contract_error(client.try_resolve_dispute(&id, &admin, &1_000, &0, &0));
        assert_eq!(err, ContractError::DisputeNotOpen);
        assert_eq!(err.code(), 502);
    }

    #[test]
    fn disputing_twice_reports_dispute_already_open() {
        let (env, _admin, _treasury, client) = setup();
        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        let id = session_id(&env, 1);
        client.lock_funds(&id, &buyer, &seller, &1_000);
        client.open_dispute(&id, &buyer, &String::from_str(&env, "first"));

        let err = contract_error(
            client.try_open_dispute(&id, &seller, &String::from_str(&env, "second")),
        );
        assert_eq!(err, ContractError::DisputeAlreadyOpen);
        assert_eq!(err.code(), 501);
    }

    #[test]
    fn disputing_by_a_stranger_reports_unauthorized() {
        let (env, _admin, _treasury, client) = setup();
        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        let stranger = Address::generate(&env);
        let id = session_id(&env, 1);
        client.lock_funds(&id, &buyer, &seller, &1_000);

        let err = contract_error(
            client.try_open_dispute(&id, &stranger, &String::from_str(&env, "nosy")),
        );
        assert_eq!(err, ContractError::Unauthorized);
        assert_eq!(err.code(), 200);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Upgrade band (600–699)
    // ─────────────────────────────────────────────────────────────────────

    #[test]
    fn a_zero_wasm_hash_reports_invalid_wasm_hash() {
        let (env, admin, _treasury, client) = setup();
        let zero = soroban_sdk::BytesN::from_array(&env, &[0u8; 32]);

        let err = contract_error(client.try_stage_upgrade(&admin, &zero));
        assert_eq!(err, ContractError::InvalidWasmHash);
        assert_eq!(err.code(), 600);
    }

    #[test]
    fn executing_an_upgrade_with_nothing_staged_reports_invalid_wasm_hash() {
        let (_env, admin, _treasury, client) = setup();

        let err = contract_error(client.try_execute_upgrade(&admin));
        assert_eq!(err, ContractError::InvalidWasmHash);
        assert_eq!(err.code(), 600);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Happy paths
    // ─────────────────────────────────────────────────────────────────────

    #[test]
    fn initialize_succeeds_once() {
        let (_env, admin, treasury, client) = setup();
        assert!(client.try_initialize(&admin, &treasury).is_ok());
    }

    #[test]
    fn platform_fee_accepts_the_whole_allowed_range() {
        let (_env, admin, _treasury, client) = setup();

        // 0 bps, 1000 bps (exactly 10%, the ceiling) and a mid value.
        for bps in [0_u32, 250, 1_000] {
            client.set_platform_fee(&admin, &bps);
            assert_eq!(client.get_platform_fee(), bps);
        }
    }

    #[test]
    fn platform_fee_defaults_to_zero() {
        let (_env, _admin, _treasury, client) = setup();
        assert_eq!(client.get_platform_fee(), 0);
    }

    // ─────────────────────────────────────────────────────────────────────
    // String conversion
    // ─────────────────────────────────────────────────────────────────────

    #[test]
    fn every_error_converts_to_a_code_and_a_readable_string() {
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
                rendered.contains(&std::format!("{}", code)),
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
