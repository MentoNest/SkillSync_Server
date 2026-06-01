use soroban_sdk::{contracttype, Address};

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum StrategyStatus {
    Active,
    Complete,
    StopHit,
    Cancelled,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct TakeProfitTier {
    pub price: i128,
    pub position_pct: u32, // basis points (10000 = 100%)
    pub executed: bool,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct StopLossTier {
    pub trigger_profit_pct: u32, // activate after this % profit (scaled x100, e.g. 2000 = 20%)
    pub trail_pct: u32,          // trail by this % (scaled x100, e.g. 1000 = 10%)
    pub active: bool,
    pub highest_price: i128,     // tracks peak price for trailing calculation
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct ExitStrategy {
    pub user: Address,
    pub signal_id: u64,
    pub entry_price: i128,
    pub current_position_size: i128,
    pub take_profit_tiers: soroban_sdk::Vec<TakeProfitTier>,
    pub stop_loss_tiers: soroban_sdk::Vec<StopLossTier>,
    pub status: StrategyStatus,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct ExecutedTrade {
    pub strategy_id: u64,
    pub trade_type: TradeType,
    pub amount: i128,
    pub price: i128,
    pub tier_price: i128,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum TradeType {
    TakeProfit,
    TrailingStop,
}

#[contracttype]
pub enum DataKey {
    Strategy(u64),
    StrategyCount,
}
