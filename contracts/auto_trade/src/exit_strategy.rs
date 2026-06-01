use soroban_sdk::{Env, Vec};
use crate::types::{ExitStrategy, ExecutedTrade, StrategyStatus, TradeType};
use crate::storage::{get_strategy, save_strategy};

fn calculate_trailing_stop(highest_price: i128, trail_pct: u32) -> i128 {
    highest_price - (highest_price * trail_pct as i128) / 10000
}

pub fn check_and_execute_exits(
    env: &Env,
    strategy_id: u64,
    current_price: i128,
) -> Result<Vec<ExecutedTrade>, &'static str> {
    let mut strategy: ExitStrategy = get_strategy(env, strategy_id)
        .ok_or("strategy not found")?;

    if strategy.status != StrategyStatus::Active {
        return Err("strategy not active");
    }

    let mut executed_trades: Vec<ExecutedTrade> = Vec::new(env);

    // ── Take-profit tiers ────────────────────────────────────────────────────
    let tp_len = strategy.take_profit_tiers.len();
    for i in 0..tp_len {
        let mut tp = strategy.take_profit_tiers.get(i).unwrap();

        if tp.executed || current_price < tp.price {
            continue;
        }

        let close_amount =
            (strategy.current_position_size * tp.position_pct as i128) / 10000;

        if close_amount <= 0 {
            tp.executed = true;
            strategy.take_profit_tiers.set(i, tp);
            continue;
        }

        strategy.current_position_size -= close_amount;
        tp.executed = true;
        strategy.take_profit_tiers.set(i, tp.clone());

        executed_trades.push_back(ExecutedTrade {
            strategy_id,
            trade_type: TradeType::TakeProfit,
            amount: close_amount,
            price: current_price,
            tier_price: tp.price,
        });
    }

    // ── Trailing stop tiers ──────────────────────────────────────────────────
    // profit_pct scaled x100 (e.g. 2000 = 20.00%)
    let current_profit_pct =
        ((current_price - strategy.entry_price) * 10000) / strategy.entry_price;

    let sl_len = strategy.stop_loss_tiers.len();
    for i in 0..sl_len {
        let mut tier = strategy.stop_loss_tiers.get(i).unwrap();

        if current_profit_pct >= tier.trigger_profit_pct as i128 {
            tier.active = true;
        }

        if tier.active && current_price > tier.highest_price {
            tier.highest_price = current_price;
        }

        strategy.stop_loss_tiers.set(i, tier);
    }

    // Find active tier with tightest trail
    let mut tightest: Option<(i128, u32)> = None;
    for i in 0..sl_len {
        let tier = strategy.stop_loss_tiers.get(i).unwrap();
        if !tier.active {
            continue;
        }
        match tightest {
            None => tightest = Some((tier.highest_price, tier.trail_pct)),
            Some((hp, tp)) => {
                if tier.trail_pct < tp {
                    tightest = Some((tier.highest_price, tier.trail_pct));
                } else if tier.trail_pct == tp && tier.highest_price > hp {
                    tightest = Some((tier.highest_price, tier.trail_pct));
                }
            }
        }
    }

    if let Some((highest_price, trail_pct)) = tightest {
        let stop_price = calculate_trailing_stop(highest_price, trail_pct);

        if current_price <= stop_price && strategy.current_position_size > 0 {
            let remaining = strategy.current_position_size;
            strategy.current_position_size = 0;
            strategy.status = StrategyStatus::StopHit;

            executed_trades.push_back(ExecutedTrade {
                strategy_id,
                trade_type: TradeType::TrailingStop,
                amount: remaining,
                price: current_price,
                tier_price: stop_price,
            });
        }
    }

    // ── Mark complete if fully exited ────────────────────────────────────────
    if strategy.current_position_size == 0 && strategy.status == StrategyStatus::Active {
        strategy.status = StrategyStatus::Complete;
    }

    save_strategy(env, strategy_id, &strategy);
    Ok(executed_trades)
}

pub fn adjust_position(
    env: &Env,
    strategy_id: u64,
    new_size: i128,
) -> Result<(), &'static str> {
    let mut strategy: ExitStrategy = get_strategy(env, strategy_id)
        .ok_or("strategy not found")?;

    if strategy.status != StrategyStatus::Active {
        return Err("strategy not active");
    }
    if new_size < 0 {
        return Err("position size cannot be negative");
    }

    strategy.current_position_size = new_size;

    if new_size == 0 {
        strategy.status = StrategyStatus::Complete;
    }

    save_strategy(env, strategy_id, &strategy);
    Ok(())
}
