#![no_std]

mod admin;
mod errors;
mod events;
mod storage;

pub use admin::initialize;

use soroban_sdk::{contract, contractimpl, Address, Env};

use errors::ContractError;

/// SkillSync platform contract.
///
/// Fresh initialization surface: a one-time `initialize(admin, treasury)`
/// that establishes the core administrative roles.
#[contract]
pub struct SkillSyncContract;

#[contractimpl]
impl SkillSyncContract {
    /// Initialize the contract. Callable only once, by the deployer.
    ///
    /// Sets up the core administrative state — admin and treasury addresses —
    /// and emits `Initialized`. Later calls revert with
    /// `ContractError::AlreadyInitialized`.
    ///
    /// # Arguments
    /// * `admin`    - Address that will govern the contract.
    /// * `treasury` - Address that receives platform fees.
    ///
    /// # Errors
    /// * [`ContractError::AlreadyInitialized`] - on any re-initialization.
    pub fn initialize(
        env: Env,
        admin: Address,
        treasury: Address,
    ) -> Result<(), ContractError> {
        admin::initialize(&env, admin, treasury)
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::Env;

    /// Unwrap a `try_` invocation: `Ok(Err(e))` is the contract rejecting
    /// itself, anything else is a host-level failure the test should flag.
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

    #[test]
    fn initialize_succeeds_on_first_call() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(SkillSyncContract, ());
        let client = SkillSyncContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);

        // First invocation is accepted; roles are persisted by initialize.
        client.initialize(&admin, &treasury).unwrap();
    }

    #[test]
    fn re_initialization_reverts_with_already_initialized() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(SkillSyncContract, ());
        let client = SkillSyncContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);

        client.initialize(&admin, &treasury).unwrap();

        let second_admin = Address::generate(&env);
        let err = contract_error(client.try_initialize(&second_admin, &treasury));
        assert_eq!(err, ContractError::AlreadyInitialized);
    }
}
