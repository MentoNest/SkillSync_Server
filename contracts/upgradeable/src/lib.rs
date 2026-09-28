#![no_std]

use soroban_sdk::{contract, contractevent, contractimpl, contracttype, Address, BytesN, Env};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    Admin,
    WasmHash,
}

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

#[contract]
pub struct UpgradeableContract;

#[contractimpl]
impl UpgradeableContract {
    pub fn initialize(env: Env, admin: Address, wasm_hash: BytesN<32>) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::WasmHash, &wasm_hash);
    }

    pub fn upgrade(env: Env, new_wasm_hash: BytesN<32>) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("not initialized");
        admin.require_auth();

        let old_wasm_hash: BytesN<32> = env
            .storage()
            .instance()
            .get(&DataKey::WasmHash)
            .expect("not initialized");

        env.storage()
            .instance()
            .set(&DataKey::WasmHash, &new_wasm_hash);

        ContractUpgraded {
            old_wasm_hash,
            new_wasm_hash,
            upgraded_by: admin,
            timestamp: env.ledger().timestamp(),
        }
        .publish(&env);
    }

    pub fn wasm_hash(env: Env) -> BytesN<32> {
        env.storage()
            .instance()
            .get(&DataKey::WasmHash)
            .expect("not initialized")
    }
}
