#![cfg(test)]

use soroban_sdk::{testutils::Address as _, Address, Env, Vec};
use crate::{
    exit_strategy::{adjust_position, check_and_execute_exits},
    presets::{create_aggressive, create_balanced, create_conservative},
    storage::{get_strategy, next_strategy_id, save_strategy},
    types::{ExitStrategy, StrategyStatus, StopLossTier, TakeProfitTier, TradeType},
};

fn setup_custom(
    env: &Env,
    entry: i128,
    size: i128,
    tps: Vec<TakeProfitTier>,
    sls: Vec<StopLossTier>,
) -> u64 {
    let id = next_strategy_id(env);
    save_strategy(env, id, &ExitStrategy {
        user: Address::generate(env),
        signal_id: 1,
        entry_price: entry,
        current_position_size: size,
        take_profit_tiers: tps,
        stop_loss_tiers: sls,
        status: StrategyStatus::Active,
    });
    id
}

#[test]
fn test_tp1_partial_close() {
    let env = Env::default();
    let entry = 1_000_000i128;
    let size = 10_000i128;

    let mut tps: Vec<TakeProfitTier> = Vec::new(&env);
    tps.push_back(TakeProfitTier { price: 1_200_000, position_pct: 3333, executed: false });

    let id = setup_custom(&env, entry, size, tps, Vec::new(&env));
    let trades = check_and_execute_exits(&env, id, 1_200_000).unwrap();

    assert_eq!(trades.len(), 1);
    assert_eq!(trades.get(0).unwrap().trade_type, TradeType::TakeProfit);
    assert_eq!(trades.get(0).unwrap().amount, (size * 3333) / 10000);

    let s = get_strategy(&env, id).unwrap();
    assert_eq!(s.current_position_size, size - (size * 3333) / 10000);
    assert_eq!(s.status, StrategyStatus::Active);
}

#[test]
fn test_all_three_tp_tiers_hit_sequentially() {
    let env = Env::default();
    let entry = 1_000_000i128;
    let size = 10_000i128;

    let mut tps: Vec<TakeProfitTier> = Vec::new(&env);
    tps.push_back(TakeProfitTier { price: 1_200_000, position_pct: 3333, executed: false });
    tps.push_back(TakeProfitTier { price: 1_500_000, position_pct: 5000, executed: false });
    tps.push_back(TakeProfitTier { price: 2_000_000, position_pct: 10000, executed: false });

    let id = setup_custom(&env, entry, size, tps, Vec::new(&env));

    let t1 = check_and_execute_exits(&env, id, 1_200_000).unwrap();
    assert_eq!(t1.len(), 1);
    let after_tp1 = get_strategy(&env, id).unwrap().current_position_size;

    let t2 = check_and_execute_exits(&env, id, 1_500_000).unwrap();
    assert_eq!(t2.len(), 1);
    let after_tp2 = get_strategy(&env, id).unwrap().current_position_size;
    assert_eq!(after_tp2, after_tp1 - (after_tp1 * 5000) / 10000);

    let t3 = check_and_execute_exits(&env, id, 2_000_000).unwrap();
    assert_eq!(t3.len(), 1);
    let s = get_strategy(&env, id).unwrap();
    assert_eq!(s.current_position_size, 0);
    assert_eq!(s.status, StrategyStatus::Complete);
}

#[test]
fn test_multiple_tps_hit_in_same_price_update() {
    let env = Env::default();
    let mut tps: Vec<TakeProfitTier> = Vec::new(&env);
    tps.push_back(TakeProfitTier { price: 1_200_000, position_pct: 3333, executed: false });
    tps.push_back(TakeProfitTier { price: 1_500_000, position_pct: 5000, executed: false });

    let id = setup_custom(&env, 1_000_000, 10_000, tps, Vec::new(&env));
    let trades = check_and_execute_exits(&env, id, 1_600_000).unwrap();
    assert_eq!(trades.len(), 2);
}

#[test]
fn test_tp_not_triggered_below_price() {
    let env = Env::default();
    let mut tps: Vec<TakeProfitTier> = Vec::new(&env);
    tps.push_back(TakeProfitTier { price: 1_200_000, position_pct: 3333, executed: false });

    let id = setup_custom(&env, 1_000_000, 10_000, tps, Vec::new(&env));
    let trades = check_and_execute_exits(&env, id, 1_100_000).unwrap();
    assert_eq!(trades.len(), 0);
}

#[test]
fn test_stop_triggered_before_any_tp() {
    let env = Env::default();
    let entry = 1_000_000i128;
    let size = 10_000i128;

    let mut sls: Vec<StopLossTier> = Vec::new(&env);
    sls.push_back(StopLossTier {
        trigger_profit_pct: 0,
        trail_pct: 1000,
        active: true,
        highest_price: entry,
    });

    let id = setup_custom(&env, entry, size, Vec::new(&env), sls);
    let stop_price = entry - (entry * 1000) / 10000;
    let trades = check_and_execute_exits(&env, id, stop_price - 1).unwrap();

    assert_eq!(trades.len(), 1);
    assert_eq!(trades.get(0).unwrap().trade_type, TradeType::TrailingStop);
    assert_eq!(trades.get(0).unwrap().amount, size);

    let s = get_strategy(&env, id).unwrap();
    assert_eq!(s.current_position_size, 0);
    assert_eq!(s.status, StrategyStatus::StopHit);
}

#[test]
fn test_trailing_stop_tightens_after_profit_threshold() {
    let env = Env::default();
    let entry = 1_000_000i128;

    let mut sls: Vec<StopLossTier> = Vec::new(&env);
    sls.push_back(StopLossTier { trigger_profit_pct: 0, trail_pct: 1000, active: true, highest_price: entry });
    sls.push_back(StopLossTier { trigger_profit_pct: 2000, trail_pct: 700, active: false, highest_price: entry });

    let id = setup_custom(&env, entry, 5_000, Vec::new(&env), sls);

    let high_price = entry + (entry * 2500) / 10000;
    let trades = check_and_execute_exits(&env, id, high_price).unwrap();
    assert_eq!(trades.len(), 0);
    assert!(get_strategy(&env, id).unwrap().stop_loss_tiers.get(1).unwrap().active);

    let tight_stop = high_price - (high_price * 700) / 10000;
    let trades2 = check_and_execute_exits(&env, id, tight_stop - 1).unwrap();
    assert_eq!(trades2.len(), 1);
    assert_eq!(trades2.get(0).unwrap().trade_type, TradeType::TrailingStop);
}

#[test]
fn test_stop_not_triggered_above_stop_price() {
    let env = Env::default();
    let entry = 1_000_000i128;

    let mut sls: Vec<StopLossTier> = Vec::new(&env);
    sls.push_back(StopLossTier { trigger_profit_pct: 0, trail_pct: 1000, active: true, highest_price: entry });

    let id = setup_custom(&env, entry, 5_000, Vec::new(&env), sls);
    let trades = check_and_execute_exits(&env, id, 960_000).unwrap();
    assert_eq!(trades.len(), 0);
    assert_eq!(get_strategy(&env, id).unwrap().status, StrategyStatus::Active);
}

#[test]
fn test_conservative_preset_structure() {
    let env = Env::default();
    let id = create_conservative(&env, Address::generate(&env), 1, 1_000_000, 10_000);
    let s = get_strategy(&env, id).unwrap();
    assert_eq!(s.take_profit_tiers.len(), 3);
    assert_eq!(s.stop_loss_tiers.len(), 1);
    assert_eq!(s.stop_loss_tiers.get(0).unwrap().trail_pct, 1000);
}

#[test]
fn test_balanced_preset_structure() {
    let env = Env::default();
    let id = create_balanced(&env, Address::generate(&env), 1, 1_000_000, 10_000);
    let s = get_strategy(&env, id).unwrap();
    assert_eq!(s.take_profit_tiers.len(), 2);
    assert_eq!(s.stop_loss_tiers.len(), 2);
    assert!(s.stop_loss_tiers.get(1).unwrap().trail_pct < s.stop_loss_tiers.get(0).unwrap().trail_pct);
}

#[test]
fn test_aggressive_preset_structure() {
    let env = Env::default();
    let id = create_aggressive(&env, Address::generate(&env), 1, 1_000_000, 10_000);
    let s = get_strategy(&env, id).unwrap();
    assert_eq!(s.take_profit_tiers.len(), 4);
    assert_eq!(s.stop_loss_tiers.get(0).unwrap().trail_pct, 500);
}

#[test]
fn test_manual_position_adjustment() {
    let env = Env::default();
    let id = setup_custom(&env, 1_000_000, 10_000, Vec::new(&env), Vec::new(&env));
    adjust_position(&env, id, 6000).unwrap();
    assert_eq!(get_strategy(&env, id).unwrap().current_position_size, 6000);
}

#[test]
fn test_manual_full_close_marks_complete() {
    let env = Env::default();
    let id = setup_custom(&env, 1_000_000, 10_000, Vec::new(&env), Vec::new(&env));
    adjust_position(&env, id, 0).unwrap();
    assert_eq!(get_strategy(&env, id).unwrap().status, StrategyStatus::Complete);
}

#[test]
fn test_check_exits_on_inactive_strategy_returns_error() {
    let env = Env::default();
    let id = setup_custom(&env, 1_000_000, 10_000, Vec::new(&env), Vec::new(&env));
    adjust_position(&env, id, 0).unwrap();
    let result = check_and_execute_exits(&env, id, 2_000_000);
    assert!(result.is_err());
}
