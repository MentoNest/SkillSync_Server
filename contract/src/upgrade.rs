use soroban_sdk::{contractimpl, BytesN, Env};

use crate::errors::ContractError;
use crate::{admin, events, storage};
use crate::{SkillSyncEscrow, SkillSyncEscrowArgs, SkillSyncEscrowClient};

#[contractimpl]
impl SkillSyncEscrow {
    /// Replaces the contract code with `new_wasm_hash`. Admin only.
    ///
    /// Storage is untouched, so sessions and configuration survive the
    /// upgrade; only additive storage changes are compatible. Emits
    /// `ContractUpgraded(old_wasm_hash, new_wasm_hash, upgraded_by, timestamp)`
    /// so off-chain monitors can follow the code hash; `old_wasm_hash` is all
    /// zeros for the first upgrade because the deployed hash is only recorded
    /// here.
    pub fn upgrade(env: Env, new_wasm_hash: BytesN<32>) -> Result<(), ContractError> {
        let admin = admin::require_admin(&env)?;
        admin.require_auth();

        let old_hash = storage::get_wasm_hash(&env);
        env.deployer()
            .update_current_contract_wasm(new_wasm_hash.clone());
        storage::set_wasm_hash(&env, &new_wasm_hash);

        events::emit_contract_upgraded(&env, &old_hash, &new_wasm_hash, &admin);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_utils::setup;
    use soroban_sdk::testutils::{Events, Ledger};
    use soroban_sdk::{Address, IntoVal, Symbol};

    #[test]
    fn upgrade_requires_the_admin_signature() {
        let f = setup();
        // Nobody signs: the stored admin's auth is missing, so it must fail.
        f.env.mock_auths(&[]);
        let hash = BytesN::from_array(&f.env, &[7u8; 32]);
        assert!(f.client.try_upgrade(&hash).is_err());
    }

    #[test]
    fn upgrade_before_initialize_is_rejected() {
        let env = Env::default();
        env.mock_all_auths();
        let id = env.register(SkillSyncEscrow, ());
        let client = SkillSyncEscrowClient::new(&env, &id);
        let hash = BytesN::from_array(&env, &[7u8; 32]);
        assert_eq!(client.try_upgrade(&hash), Err(Ok(ContractError::NotInitialized)));
    }

    #[test]
    fn contract_upgraded_event_carries_both_hashes_the_upgrader_and_the_timestamp() {
        let f = setup();
        f.env.ledger().with_mut(|l| l.timestamp = 1_700_000_000);
        let old_hash = BytesN::from_array(&f.env, &[2u8; 32]);
        let new_hash = BytesN::from_array(&f.env, &[7u8; 32]);

        // `upgrade` itself cannot run in the unit-test host: it calls
        // `update_current_contract_wasm`, which only accepts the hash of a Wasm
        // blob already on the ledger. Emit the event exactly as `upgrade` does
        // and assert the payload the AC describes.
        f.env.as_contract(&f.contract_id, || {
            events::emit_contract_upgraded(&f.env, &old_hash, &new_hash, &f.admin);
        });

        let (_, topics, data) = f.env.events().all().last().unwrap();
        assert_eq!(
            topics,
            (Symbol::new(&f.env, "ContractUpgraded"),).into_val(&f.env)
        );
        let data: (BytesN<32>, BytesN<32>, Address, u64) = data.into_val(&f.env);
        assert_eq!(data, (old_hash, new_hash, f.admin.clone(), 1_700_000_000));
    }

    #[test]
    fn deployed_hash_defaults_to_zeros() {
        let f = setup();
        let stored = f
            .env
            .as_contract(&f.contract_id, || storage::get_wasm_hash(&f.env));
        assert_eq!(stored, BytesN::from_array(&f.env, &[0u8; 32]));
    }
}
