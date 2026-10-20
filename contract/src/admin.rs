use soroban_sdk::{Address, Env};

use crate::errors::ContractError;
use crate::events;
use crate::storage;

/// Strkey of the all-zero account — Stellar's conventional "unset" address.
const ZERO_ACCOUNT: &str = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
/// Strkey of the all-zero contract address.
const ZERO_CONTRACT: &str = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4";

/// True when `address` is the zero account or the zero contract address.
///
/// Such an address has no key behind it, so an admin set to it could never
/// sign an admin call and a treasury set to it would silently burn fees.
fn is_zero_address(env: &Env, address: &Address) -> bool {
    address == &Address::from_str(env, ZERO_ACCOUNT)
        || address == &Address::from_str(env, ZERO_CONTRACT)
}

/// The `only_once` guard — the contract's take on an `only_once` modifier.
///
/// Runs before any state is written: the first call proceeds, every later
/// call reverts with [`ContractError::AlreadyInitialized`] *before* touching
/// storage, so a re-initialization can never overwrite the original admin
/// or treasury.
fn only_once(env: &Env) -> Result<(), ContractError> {
    if storage::is_initialized(env) {
        return Err(ContractError::AlreadyInitialized);
    }
    Ok(())
}

/// Initialize the contract state.
///
/// Callable exactly once, by the deployer: `admin.require_auth()` means the
/// address claiming the admin role must have signed the invocation, so an
/// arbitrary third party cannot initialize the contract with itself as admin.
///
/// On success:
/// - Stores `admin` and `treasury` in instance storage.
/// - Sets the `Initialized` flag (the only-once latch).
/// - Emits `Initialized(admin, treasury)`.
///
/// # Errors
/// - [`ContractError::AlreadyInitialized`] — any call after the first.
/// - [`ContractError::InvalidAdmin`] — `admin` is the zero address.
/// - [`ContractError::InvalidTreasury`] — `treasury` is the zero address.
pub fn initialize(
    env: &Env,
    admin: Address,
    treasury: Address,
) -> Result<(), ContractError> {
    // ── only_once modifier ──────────────────────────────────────────────
    only_once(env)?;

    // ── address validation ──────────────────────────────────────────────
    if is_zero_address(env, &admin) {
        return Err(ContractError::InvalidAdmin);
    }
    if is_zero_address(env, &treasury) {
        return Err(ContractError::InvalidTreasury);
    }

    // ── deployer authorization ──────────────────────────────────────────
    admin.require_auth();

    // ── persistent state ────────────────────────────────────────────────
    storage::set_admin(env, &admin);
    storage::set_treasury(env, &treasury);
    storage::set_initialized(env);

    // ── event ───────────────────────────────────────────────────────────
    events::emit_initialized(env, &admin, &treasury);

    Ok(())
}

/// Read the stored admin, failing when the contract is not initialized.
///
/// The entry point future admin-gated functions build on: one place decides
/// what "the contract is live" means.
pub fn require_admin(env: &Env) -> Result<Address, ContractError> {
    storage::get_admin(env).ok_or(ContractError::NotInitialized)
}

/// Read the stored treasury, failing when the contract is not initialized.
pub fn require_treasury(env: &Env) -> Result<Address, ContractError> {
    storage::get_treasury(env).ok_or(ContractError::NotInitialized)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{SkillSyncEscrow, SkillSyncEscrowClient};
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::Env;

    fn fresh() -> (Env, Address, SkillSyncEscrowClient<'static>, Address) {
        let env = Env::default();
        env.mock_all_auths();
        let id = env.register(SkillSyncEscrow, ());
        let client = SkillSyncEscrowClient::new(&env, &id);
        let signer = Address::generate(&env);
        (env, id, client, signer)
    }

    #[test]
    fn initialize_stores_the_admin_and_treasury() {
        let (env, id, client, admin) = fresh();
        let treasury = Address::generate(&env);
        client.initialize(&admin, &treasury);
        assert_eq!(client.get_treasury(), treasury);
        assert!(env.as_contract(&id, || storage::get_admin(&env) == Some(admin.clone())));
    }

    #[test]
    fn initialize_runs_only_once() {
        let (env, _, client, admin) = fresh();
        client.initialize(&admin, &Address::generate(&env));
        assert_eq!(
            client.try_initialize(&admin, &Address::generate(&env)),
            Err(Ok(ContractError::AlreadyInitialized))
        );
    }

    #[test]
    fn initialize_rejects_a_zero_admin() {
        let (env, _, client, _) = fresh();
        let zero_admin = Address::from_str(&env, ZERO_ACCOUNT);
        let treasury = Address::generate(&env);

        assert_eq!(
            client.try_initialize(&zero_admin, &treasury),
            Err(Ok(ContractError::InvalidAdmin))
        );
        // The failed call must not latch initialization.
        client.initialize(&Address::generate(&env), &treasury);
    }

    #[test]
    fn initialize_rejects_a_zero_contract_as_admin() {
        let (env, _, client, _) = fresh();
        let zero_admin = Address::from_str(&env, ZERO_CONTRACT);
        assert_eq!(
            client.try_initialize(&zero_admin, &Address::generate(&env)),
            Err(Ok(ContractError::InvalidAdmin))
        );
    }

    #[test]
    fn initialize_rejects_a_zero_treasury() {
        let (env, _, client, admin) = fresh();
        let zero_treasury = Address::from_str(&env, ZERO_ACCOUNT);
        assert_eq!(
            client.try_initialize(&admin, &zero_treasury),
            Err(Ok(ContractError::InvalidTreasury))
        );
        // The failed call must not latch initialization either.
        assert_eq!(
            client.try_get_treasury(),
            Err(Ok(ContractError::NotInitialized))
        );
    }

    #[test]
    fn admin_and_treasury_are_required_before_initialize() {
        let (_env, _id, client, _) = fresh();
        assert_eq!(
            client.try_get_treasury(),
            Err(Ok(ContractError::NotInitialized))
        );
    }
}
