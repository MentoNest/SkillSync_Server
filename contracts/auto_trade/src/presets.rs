use soroban_sdk::{Env, Address, Vec};
use crate::types::{ExitStrategy, StrategyStatus, TakeProfitTier, StopLossTier};
use crate::storage::{next_strategy_id, save_strategy};

/// Conservative: 3 TPs (20%, 50%, 100%) + flat 10% trail from entry
pub fn create_conservative(
    env: &Env,
    user: Address,
    signal_id: u64,
    entry_price: i128,
    position_size: i128,
) -> u64 {
    let tp1 = entry_price + (entry_price * 2000) / 10000;
    let tp2 = entry_price + (entry_price * 5000) / 10000;
    let tp3 = entry_price + (entry_price * 10000) / 10000;

    let mut tps: Vec<TakeProfitTier> = Vec::new(env);
    tps.push_back(TakeProfitTier { price: tp1, position_pct: 3333, executed: false });
    tps.push_back(TakeProfitTier { price: tp2, position_pct: 5000, executed: false });
    tps.push_back(TakeProfitTier { price: tp3, position_pct: 10000, executed: false });

    let mut sls: Vec<StopLossTier> = Vec::new(env);
    sls.push_back(StopLossTier {
        trigger_profit_pct: 0,
        trail_pct: 1000,
        active: true,
        highest_price: entry_price,
    });

    let id = next_strategy_id(env);
    save_strategy(env, id, &ExitStrategy {
        user,
        signal_id,
        entry_price,
        current_position_size: position_size,
        take_profit_tiers: tps,
        stop_loss_tiers: sls,
        status: StrategyStatus::Active,
    });
    id
}

/// Balanced: 2 TPs (30%, 80%) + tiered trails (10% → 7% after 30%)
pub fn create_balanced(
    env: &Env,
    user: Address,
    signal_id: u64,
    entry_price: i128,
    position_size: i128,
) -> u64 {
    let tp1 = entry_price + (entry_price * 3000) / 10000;
    let tp2 = entry_price + (entry_price * 8000) / 10000;

    let mut tps: Vec<TakeProfitTier> = Vec::new(env);
    tps.push_back(TakeProfitTier { price: tp1, position_pct: 5000, executed: false });
    tps.push_back(TakeProfitTier { price: tp2, position_pct: 10000, executed: false });

    let mut sls: Vec<StopLossTier> = Vec::new(env);
    sls.push_back(StopLossTier {
        trigger_profit_pct: 0,
        trail_pct: 1000,
        active: true,
        highest_price: entry_price,
    });
    sls.push_back(StopLossTier {
        trigger_profit_pct: 3000,
        trail_pct: 700,
        active: false,
        highest_price: entry_price,
    });

    let id = next_strategy_id(env);
    save_strategy(env, id, &ExitStrategy {
        user,
        signal_id,
        entry_price,
        current_position_size: position_size,
        take_profit_tiers: tps,
        stop_loss_tiers: sls,
        status: StrategyStatus::Active,
    });
    id
}

/// Aggressive: 4 TPs (15%, 30%, 60%, 150%) + tight 5% trail after 15%
pub fn create_aggressive(
    env: &Env,
    user: Address,
    signal_id: u64,
    entry_price: i128,
    position_size: i128,
) -> u64 {
    let tp1 = entry_price + (entry_price * 1500) / 10000;
    let tp2 = entry_price + (entry_price * 3000) / 10000;
    let tp3 = entry_price + (entry_price * 6000) / 10000;
    let tp4 = entry_price + (entry_price * 15000) / 10000;

    let mut tps: Vec<TakeProfitTier> = Vec::new(env);
    tps.push_back(TakeProfitTier { price: tp1, position_pct: 2500, executed: false });
    tps.push_back(TakeProfitTier { price: tp2, position_pct: 3333, executed: false });
    tps.push_back(TakeProfitTier { price: tp3, position_pct: 5000, executed: false });
    tps.push_back(TakeProfitTier { price: tp4, position_pct: 10000, executed: false });

    let mut sls: Vec<StopLossTier> = Vec::new(env);
    sls.push_back(StopLossTier {
        trigger_profit_pct: 1500,
        trail_pct: 500,
        active: false,
        highest_price: entry_price,
    });

    let id = next_strategy_id(env);
    save_strategy(env, id, &ExitStrategy {
        user,
        signal_id,
        entry_price,
        current_position_size: position_size,
        take_profit_tiers: tps,
        stop_loss_tiers: sls,
        status: StrategyStatus::Active,
    });
    id
}
