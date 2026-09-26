#[cfg(test)]
mod tests {
    use soroban_sdk::{testutils::Address as _, Address, Env};

    use crate::{errors::ContractError, SkillSyncContract, SkillSyncContractClient};

    /// Create a fresh test environment and contract client.
    fn setup() -> (Env, Address, Address, SkillSyncContractClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(SkillSyncContract, ());
        let client = SkillSyncContractClient::new(&env, &contract_id);

        let admin: Address = Address::generate(&env);
        let treasury: Address = Address::generate(&env);

        (env, admin, treasury, client)
    }

    // ─────────────────────────────────────────────────────────────────────
    // initialize()
    // ─────────────────────────────────────────────────────────────────────

    #[test]
    fn test_initialize_success() {
        let (_env, admin, treasury, client) = setup();
        let result = client.try_initialize(&admin, &treasury);
        assert!(result.is_ok());
    }

    #[test]
    fn test_initialize_only_once() {
        let (_env, admin, treasury, client) = setup();
        client.initialize(&admin, &treasury);

        // Second call must revert
        let err = client
            .try_initialize(&admin, &treasury)
            .expect_err("Expected AlreadyInitialized error");

        assert_eq!(
            err.unwrap_or_else(|e| panic!("Unexpected error: {:?}", e)),
            ContractError::AlreadyInitialized
        );
    }

    // ─────────────────────────────────────────────────────────────────────
    // set_platform_fee() / get_platform_fee()
    // ─────────────────────────────────────────────────────────────────────

    #[test]
    fn test_set_platform_fee_success() {
        let (_env, admin, treasury, client) = setup();
        client.initialize(&admin, &treasury);

        client.set_platform_fee(&admin, &250); // 2.5%
        assert_eq!(client.get_platform_fee(), 250);
    }

    #[test]
    fn test_set_platform_fee_max_boundary() {
        let (_env, admin, treasury, client) = setup();
        client.initialize(&admin, &treasury);

        client.set_platform_fee(&admin, &1000); // Exactly 10% — allowed
        assert_eq!(client.get_platform_fee(), 1000);
    }

    #[test]
    fn test_set_platform_fee_zero() {
        let (_env, admin, treasury, client) = setup();
        client.initialize(&admin, &treasury);

        client.set_platform_fee(&admin, &0); // 0% — allowed
        assert_eq!(client.get_platform_fee(), 0);
    }

    #[test]
    fn test_set_platform_fee_exceeds_max() {
        let (_env, admin, treasury, client) = setup();
        client.initialize(&admin, &treasury);

        let err = client
            .try_set_platform_fee(&admin, &1001) // > 1000 — must fail
            .expect_err("Expected FeeTooHigh error");

        assert_eq!(
            err.unwrap_or_else(|e| panic!("Unexpected error: {:?}", e)),
            ContractError::FeeTooHigh
        );
    }

    #[test]
    fn test_set_platform_fee_non_admin() {
        let (env, admin, treasury, client) = setup();
        client.initialize(&admin, &treasury);

        let attacker = Address::generate(&env);
        let err = client
            .try_set_platform_fee(&attacker, &100)
            .expect_err("Expected NotAdmin error");

        assert_eq!(
            err.unwrap_or_else(|e| panic!("Unexpected error: {:?}", e)),
            ContractError::NotAdmin
        );
    }

    #[test]
    fn test_get_platform_fee_default() {
        // Before any set_platform_fee call, default is 0
        let (_env, admin, treasury, client) = setup();
        client.initialize(&admin, &treasury);

        assert_eq!(client.get_platform_fee(), 0);
    }

    #[test]
    fn test_set_platform_fee_before_init() {
        let (_env, admin, _treasury, client) = setup();

        let err = client
            .try_set_platform_fee(&admin, &100)
            .expect_err("Expected NotInitialized error");

        assert_eq!(
            err.unwrap_or_else(|e| panic!("Unexpected error: {:?}", e)),
            ContractError::NotInitialized
        );
    }
}
