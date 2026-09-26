use soroban_sdk::{contracttype, symbol_short, Address, BytesN, Env};

use crate::admin::require_admin;
use crate::errors::ContractError;

/// Admin-scheduled WASM upgrades.
///
/// A two-step flow: the admin first stages a WASM hash with
/// [`stage_upgrade`], then a separate [`execute_upgrade`] transaction applies
/// it via the Soroban deployer. Splitting the two means a bad hash can be
/// staged and inspected without putting the contract at risk, and it keeps
/// the deployer call in its own transaction so a failure there cannot leave
/// the contract half-upgraded.
///
/// Storage keys owned by this module.
#[contracttype]
#[derive(Clone)]
enum UpgradeKey {
    /// The WASM hash staged by the admin, if any.
    StagedWasmHash,
}

fn is_zero_hash(hash: &BytesN<32>) -> bool {
    hash.to_array().iter().all(|byte| *byte == 0)
}

/// Stage `new_hash` as the WASM to upgrade to on the next
/// [`execute_upgrade`] call.
///
/// A zero hash is rejected up front: it is the classic "someone passed an
/// uninitialized `BytesN`" mistake, and letting it through would stage an
/// upgrade that can only fail later, at execution time, with no way to tell
/// what went wrong.
///
/// # Errors
/// - [`ContractError::NotInitialized`] if the contract is not initialized.
/// - [`ContractError::NotAdmin`] if `caller` is not the admin.
/// - [`ContractError::InvalidWasmHash`] if `new_hash` is all zeroes.
///
/// # Events
/// Emits `UpgradeStaged` with the staged hash.
pub fn stage_upgrade(env: &Env, caller: Address, new_hash: BytesN<32>) -> Result<(), ContractError> {
    require_admin(env, &caller)?;

    if is_zero_hash(&new_hash) {
        return Err(ContractError::InvalidWasmHash);
    }

    env.storage()
        .instance()
        .set(&UpgradeKey::StagedWasmHash, &new_hash);

    env.events()
        .publish((symbol_short!("upg_stage"),), new_hash);

    Ok(())
}

/// Apply the hash staged by [`stage_upgrade`] to the running contract.
///
/// The deployer call is the only thing that can fail here, and it fails in
/// ways the caller cannot pre-empt (missing WASM in the archive, a hash that
/// does not match any available build, a deployer that is not this
/// contract's). All of those collapse to [`ContractError::UpgradeFailed`],
/// since the contract has no way to inspect the deployer's internals. The
/// staged hash is cleared regardless, so a failed attempt cannot be retried
/// indefinitely against a bad deployment.
///
/// # Errors
/// - [`ContractError::NotInitialized`] if the contract is not initialized.
/// - [`ContractError::NotAdmin`] if `caller` is not the admin.
/// - [`ContractError::InvalidWasmHash`] if no hash has been staged.
/// - [`ContractError::UpgradeFailed`] if the deployer rejects the upgrade.
///
/// # Events
/// Emits `Upgraded` with the hash that was applied.
pub fn execute_upgrade(env: &Env, caller: Address) -> Result<(), ContractError> {
    require_admin(env, &caller)?;

    let staged: Option<BytesN<32>> = env
        .storage()
        .instance()
        .get(&UpgradeKey::StagedWasmHash);

    let hash = staged.ok_or(ContractError::InvalidWasmHash)?;

    // Clear the staged hash *before* the deployer call. If the call traps,
    // the whole transaction reverts anyway; if it somehow did not, we still
    // do not want a consumed hash to be replayable.
    remove_staged_hash(env);

    env.deployer()
        .update_current_contract_wasm(hash)
        .map_err(|_| ContractError::UpgradeFailed)?;

    env.events().publish((symbol_short!("upgraded"),), hash);

    Ok(())
}

/// The WASM hash staged for the next upgrade, if any.
pub fn get_staged_wasm_hash(env: &Env) -> Option<BytesN<32>> {
    env.storage()
        .instance()
        .get(&UpgradeKey::StagedWasmHash)
}

/// Discard any staged WASM hash (admin only).
///
/// # Errors
/// - [`ContractError::NotInitialized`] if the contract is not initialized.
/// - [`ContractError::NotAdmin`] if `caller` is not the admin.
pub fn cancel_upgrade(env: &Env, caller: Address) -> Result<(), ContractError> {
    require_admin(env, &caller)?;
    remove_staged_hash(env);
    env.events().publish((symbol_short!("upg_cancel"),), ());
    Ok(())
}

fn remove_staged_hash(env: &Env) {
    env.storage().instance().remove(&UpgradeKey::StagedWasmHash);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{SkillSyncContract, SkillSyncContractClient};
    use soroban_sdk::testutils::Address as _;

    fn setup() -> (Env, Address, Address, SkillSyncContractClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(SkillSyncContract, ());
        let client = SkillSyncContractClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        client.initialize(&admin, &treasury);
        (env, admin, treasury, client)
    }

    fn hash(env: &Env, byte: u8) -> BytesN<32> {
        BytesN::from_array(env, &[byte; 32])
    }

    #[test]
    fn stage_then_execute_upgrades_the_contract() {
        let (env, admin, _treasury, client) = setup();
        let wasm = hash(&env, 0xAB);

        client.stage_upgrade(&admin, &wasm);
        assert_eq!(client.get_staged_wasm_hash(), Some(wasm.clone()));

        client.execute_upgrade(&admin);
        assert_eq!(client.get_staged_wasm_hash(), None);
    }

    #[test]
    fn staging_a_zero_hash_is_rejected() {
        let (env, admin, _treasury, client) = setup();
        let zero = BytesN::from_array(&env, &[0u8; 32]);

        let err = client
            .try_stage_upgrade(&admin, &zero)
            .expect_err("Expected InvalidWasmHash");
        assert_eq!(
            err.unwrap_or_else(|e| panic!("Unexpected error: {:?}", e)),
            ContractError::InvalidWasmHash
        );
        assert_eq!(client.get_staged_wasm_hash(), None);
    }

    #[test]
    fn executing_without_a_staged_hash_is_rejected() {
        let (_env, admin, _treasury, client) = setup();

        let err = client
            .try_execute_upgrade(&admin)
            .expect_err("Expected InvalidWasmHash");
        assert_eq!(
            err.unwrap_or_else(|e| panic!("Unexpected error: {:?}", e)),
            ContractError::InvalidWasmHash
        );
    }

    #[test]
    fn only_the_admin_can_stage_or_execute() {
        let (env, _admin, _treasury, client) = setup();
        let attacker = Address::generate(&env);
        let wasm = hash(&env, 0xAB);

        let err = client
            .try_stage_upgrade(&attacker, &wasm)
            .expect_err("Expected NotAdmin");
        assert_eq!(
            err.unwrap_or_else(|e| panic!("Unexpected error: {:?}", e)),
            ContractError::NotAdmin
        );
    }

    #[test]
    fn cancel_discards_the_staged_hash() {
        let (env, admin, _treasury, client) = setup();
        let wasm = hash(&env, 0xAB);

        client.stage_upgrade(&admin, &wasm);
        client.cancel_upgrade(&admin);
        assert_eq!(client.get_staged_wasm_hash(), None);
    }
}
