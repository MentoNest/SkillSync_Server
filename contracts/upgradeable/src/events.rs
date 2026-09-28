use soroban_sdk::{contractevent, Address, BytesN, Env};

/// Emitted when the contract's WASM implementation is upgraded.
///
/// Allows off-chain indexers and monitoring services to observe upgrades
/// by tracking the previous and new WASM hashes, the caller that performed
/// the upgrade, and the ledger timestamp at which it occurred.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ContractUpgraded {
    #[topic]
    pub old_wasm_hash: BytesN<32>,
    #[topic]
    pub new_wasm_hash: BytesN<32>,
    pub upgraded_by: Address,
    pub timestamp: u64,
}

/// Emit a [`ContractUpgraded`] event.
///
/// Should be called from the upgrade path after the new WASM hash has been
/// installed, so off-chain consumers can monitor upgrades.
pub fn emit_contract_upgraded(
    env: &Env,
    old_wasm_hash: BytesN<32>,
    new_wasm_hash: BytesN<32>,
    upgraded_by: Address,
) {
    let timestamp = env.ledger().timestamp();
    ContractUpgraded {
        old_wasm_hash,
        new_wasm_hash,
        upgraded_by,
        timestamp,
    }
    .publish(env);
}
