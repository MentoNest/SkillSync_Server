#![no_std]

use soroban_sdk::{contract, contractimpl, Env, Symbol};

#[contract]
pub struct SkillsyncContract;

#[contractimpl]
impl SkillsyncContract {
    pub fn hello(env: Env) -> Symbol {
        Symbol::new(&env, "Hello")
    }
}

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn test_hello() {
        let env = Env::default();
        let contract_id = env.register_contract(None, SkillsyncContract);
        let client = SkillsyncContractClient::new(&env, &contract_id);

        let msg = client.hello();
        assert_eq!(msg, Symbol::new(&env, "Hello"));
    }
}
