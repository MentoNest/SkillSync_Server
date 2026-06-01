use soroban_sdk::Env;
use crate::types::{DataKey, ExitStrategy};

pub fn get_strategy(env: &Env, strategy_id: u64) -> Option<ExitStrategy> {
    env.storage().persistent().get(&DataKey::Strategy(strategy_id))
}

pub fn save_strategy(env: &Env, strategy_id: u64, strategy: &ExitStrategy) {
    env.storage()
        .persistent()
        .set(&DataKey::Strategy(strategy_id), strategy);
}

pub fn next_strategy_id(env: &Env) -> u64 {
    let count: u64 = env
        .storage()
        .persistent()
        .get(&DataKey::StrategyCount)
        .unwrap_or(0);
    let next = count + 1;
    env.storage()
        .persistent()
        .set(&DataKey::StrategyCount, &next);
    next
}
