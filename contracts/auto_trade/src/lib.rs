#![no_std]

mod exit_strategy;
mod presets;
mod storage;
mod types;

#[cfg(test)]
mod test;

use soroban_sdk::{contract, contractimpl, Address, Env, Vec};
use types::{ExitStrategy, ExecutedTrade, StrategyStatus};
use storage::{get_strategy, next_strategy_id, save_strategy};

#[contract]
pub struct AutoTradeContract;

#[contractimpl]
impl AutoTradeContract {
    pub fn create_strategy(
        env: Env,
        user: Address,
        signal_id: u64,
        entry_price: i128,
        position_size: i128,
        take_profit_tiers: Vec<types::TakeProfitTier>,
        stop_loss_tiers: Vec<types::StopLossTier>,
    ) -> u64 {
        user.require_auth();
        assert!(entry_price > 0, "entry price must be positive");
        assert!(position_size > 0, "position size must be positive");
        assert!(!take_profit_tiers.is_empty(), "at least one TP tier required");

        let id = next_strategy_id(&env);
        save_strategy(&env, id, &ExitStrategy {
            user,
            signal_id,
            entry_price,
            current_position_size: position_size,
            take_profit_tiers,
            stop_loss_tiers,
            status: StrategyStatus::Active,
        });
        id
    }

    pub fn create_conservative(
        env: Env,
        user: Address,
        signal_id: u64,
        entry_price: i128,
        position_size: i128,
    ) -> u64 {
        user.require_auth();
        presets::create_conservative(&env, user, signal_id, entry_price, position_size)
    }

    pub fn create_balanced(
        env: Env,
        user: Address,
        signal_id: u64,
        entry_price: i128,
        position_size: i128,
    ) -> u64 {
        user.require_auth();
        presets::create_balanced(&env, user, signal_id, entry_price, position_size)
    }

    pub fn create_aggressive(
        env: Env,
        user: Address,
        signal_id: u64,
        entry_price: i128,
        position_size: i128,
    ) -> u64 {
        user.require_auth();
        presets::create_aggressive(&env, user, signal_id, entry_price, position_size)
    }

    pub fn check_exits(
        env: Env,
        strategy_id: u64,
        current_price: i128,
    ) -> Vec<ExecutedTrade> {
        assert!(current_price > 0, "price must be positive");
        exit_strategy::check_and_execute_exits(&env, strategy_id, current_price)
            .unwrap_or_else(|_| Vec::new(&env))
    }

    pub fn adjust_position(
        env: Env,
        strategy_id: u64,
        user: Address,
        new_size: i128,
    ) {
        user.require_auth();
        let strategy = get_strategy(&env, strategy_id).expect("strategy not found");
        assert!(strategy.user == user, "unauthorized");
        exit_strategy::adjust_position(&env, strategy_id, new_size).expect("adjust failed");
    }

    pub fn cancel_strategy(env: Env, strategy_id: u64, user: Address) {
        user.require_auth();
        let mut strategy = get_strategy(&env, strategy_id).expect("strategy not found");
        assert!(strategy.user == user, "unauthorized");
        strategy.status = StrategyStatus::Cancelled;
        save_strategy(&env, strategy_id, &strategy);
    }

    pub fn get_strategy(env: Env, strategy_id: u64) -> Option<ExitStrategy> {
        get_strategy(&env, strategy_id)
    }

    pub fn get_status(env: Env, strategy_id: u64) -> Option<StrategyStatus> {
        get_strategy(&env, strategy_id).map(|s| s.status)
    }

    pub fn get_position_size(env: Env, strategy_id: u64) -> i128 {
        get_strategy(&env, strategy_id)
            .map(|s| s.current_position_size)
            .unwrap_or(0)
    }
}
