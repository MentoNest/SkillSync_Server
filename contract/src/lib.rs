#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, token, Address, BytesN, Env, String,
    Symbol,
};
type Bytes32 = BytesN<32>;

mod archive;
mod conditional;
mod dao;

#[contract]
pub struct SkillssyncEscrow;

const DEFAULT_PLATFORM_FEE_BPS: u32 = 100;
const DEFAULT_DISPUTE_WINDOW_LEDGERS: u32 = 1000;
const MAX_PLATFORM_FEE_BPS: u32 = 1000;

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    Admin,
    Treasury,
    PlatformFeeBps,
    DisputeWindow,
    PaymentToken,
    Initialized,
    WasmHash,
    Session(Bytes32),
}

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum SessionStatus {
    Locked,
    Completed,
    Approved,
    Refunded,
    Disputed,
    Resolved,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Session {
    pub buyer: Address,
    pub seller: Address,
    pub amount: i128,
    pub status: SessionStatus,
    pub created_at: u64,
    pub completed_at: u64,
    pub dispute_opened_at: u64,
    pub dispute_resolved_at: u64,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum ContractError {
    AlreadyInitialized = 1,
    Unauthorized = 2,
    InvalidPlatformFee = 3,
    InvalidAmount = 4,
    DuplicateSessionId = 5,
    SessionNotFound = 6,
    InvalidSessionStatus = 7,
    PaymentTokenNotConfigured = 8,
    InvalidResolution = 9,
    InvalidShares = 10,
}

fn read_admin(env: &Env) -> Option<Address> {
    env.storage().persistent().get(&DataKey::Admin)
}

fn require_admin(env: &Env) -> Result<Address, ContractError> {
    let admin = read_admin(env).ok_or(ContractError::Unauthorized)?;
    admin.require_auth();
    Ok(admin)
}

fn read_treasury(env: &Env) -> Option<Address> {
    env.storage().persistent().get(&DataKey::Treasury)
}

fn read_platform_fee(env: &Env) -> u32 {
    env.storage()
        .persistent()
        .get(&DataKey::PlatformFeeBps)
        .unwrap_or(DEFAULT_PLATFORM_FEE_BPS)
}

fn read_dispute_window(env: &Env) -> u32 {
    env.storage()
        .persistent()
        .get(&DataKey::DisputeWindow)
        .unwrap_or(DEFAULT_DISPUTE_WINDOW_LEDGERS)
}

fn read_payment_token(env: &Env) -> Option<Address> {
    env.storage().persistent().get(&DataKey::PaymentToken)
}

fn load_session(env: &Env, session_id: Bytes32) -> Option<Session> {
    env.storage().persistent().get(&DataKey::Session(session_id))
}

fn save_session(env: &Env, session_id: Bytes32, session: &Session) {
    env.storage()
        .persistent()
        .set(&DataKey::Session(session_id), session);
}

fn session_exists(env: &Env, session_id: Bytes32) -> bool {
    archive::is_archived(env, &session_id)
        || env
            .storage()
            .persistent()
            .has(&DataKey::Session(session_id))
}

fn apply_fee(env: &Env, amount: i128) -> (i128, i128) {
    let fee_bps = read_platform_fee(env);
    if amount <= 0 || fee_bps == 0 {
        return (amount, 0);
    }
    let fee_amount = amount / 10_000 * fee_bps as i128
        + amount % 10_000 * fee_bps as i128 / 10_000;
    (amount - fee_amount, fee_amount)
}

fn transfer_treasury_fee(
    env: &Env,
    token: &token::Client,
    fee_amount: i128,
) -> Result<(), ContractError> {
    if fee_amount > 0 {
        let treasury = read_treasury(env).ok_or(ContractError::Unauthorized)?;
        token.transfer(
            &env.current_contract_address(),
            &treasury,
            &fee_amount,
        );
    }
    Ok(())
}

#[contractimpl]
impl SkillssyncEscrow {
    pub fn set_payment_token(env: Env, token: Address) -> Result<(), ContractError> {
        require_admin(&env)?;
        env.storage().persistent().set(&DataKey::PaymentToken, &token);
        env.events()
            .publish((Symbol::new(&env, "payment_token_updated"),), token);
        Ok(())
    }

    pub fn get_payment_token(env: Env) -> Option<Address> {
        read_payment_token(&env)
    }

    pub fn set_platform_fee(env: Env, new_fee_bps: u32) -> Result<(), ContractError> {
        require_admin(&env)?;
        if new_fee_bps > MAX_PLATFORM_FEE_BPS {
            return Err(ContractError::InvalidPlatformFee);
        }
        env.storage()
            .persistent()
            .set(&DataKey::PlatformFeeBps, &new_fee_bps);
        env.events().publish(
            (Symbol::new(&env, "platform_fee_updated"),),
            new_fee_bps,
        );
        Ok(())
    }

    pub fn get_platform_fee(env: Env) -> u32 {
        read_platform_fee(&env)
    }

    pub fn set_treasury(env: Env, new_treasury: Address) -> Result<(), ContractError> {
        require_admin(&env)?;
        env.storage()
            .persistent()
            .set(&DataKey::Treasury, &new_treasury);
        env.events()
            .publish((Symbol::new(&env, "treasury_updated"),), new_treasury);
        Ok(())
    }

    pub fn get_treasury(env: Env) -> Option<Address> {
        read_treasury(&env)
    }

    pub fn lock_funds(
        env: Env,
        session_id: Bytes32,
        buyer: Address,
        seller: Address,
        amount: i128,
    ) -> Result<(), ContractError> {
        if amount <= 0 {
            return Err(ContractError::InvalidAmount);
        }
        if session_exists(&env, session_id.clone()) {
            return Err(ContractError::DuplicateSessionId);
        }
        buyer.require_auth();
        let token_addr =
            read_payment_token(&env).ok_or(ContractError::PaymentTokenNotConfigured)?;
        let token = token::Client::new(&env, &token_addr);
        token.transfer(&buyer, &env.current_contract_address(), &amount);
        let session = Session {
            buyer: buyer.clone(),
            seller: seller.clone(),
            amount,
            status: SessionStatus::Locked,
            created_at: env.ledger().timestamp(),
            completed_at: 0,
            dispute_opened_at: 0,
            dispute_resolved_at: 0,
        };
        save_session(&env, session_id.clone(), &session);
        archive::track_session(&env, &session_id);
        env.events().publish(
            (Symbol::new(&env, "funds_locked"),),
            (session_id, buyer, seller, amount),
        );
        Ok(())
    }

    pub fn complete_session(env: Env, session_id: Bytes32) -> Result<(), ContractError> {
        let mut session =
            load_session(&env, session_id.clone()).ok_or(ContractError::SessionNotFound)?;
        session.seller.require_auth();
        if session.status != SessionStatus::Locked {
            return Err(ContractError::DuplicateSessionId);
        }
        session.status = SessionStatus::Completed;
        session.completed_at = env.ledger().timestamp();
        save_session(&env, session_id.clone(), &session);
        env.events()
            .publish((Symbol::new(&env, "session_completed"),), session_id);
        Ok(())
    }

    pub fn approve_session(env: Env, session_id: Bytes32) -> Result<(), ContractError> {
        let mut session =
            load_session(&env, session_id.clone()).ok_or(ContractError::SessionNotFound)?;
        session.buyer.require_auth();
        if session.status != SessionStatus::Completed {
            return Err(ContractError::InvalidSessionStatus);
        }
        let (payout, fee) = apply_fee(&env, session.amount);
        let token_addr =
            read_payment_token(&env).ok_or(ContractError::PaymentTokenNotConfigured)?;
        let token = token::Client::new(&env, &token_addr);
        let contract = env.current_contract_address();
        token.transfer(&contract, &session.seller, &payout);
        transfer_treasury_fee(&env, &token, fee)?;
        session.status = SessionStatus::Approved;
        save_session(&env, session_id.clone(), &session);
        env.events().publish(
            (Symbol::new(&env, "session_approved"),),
            (session_id, payout, fee),
        );
        Ok(())
    }

    pub fn refund_session(env: Env, session_id: Bytes32) -> Result<(), ContractError> {
        conditional::reject_conditional(&env, &session_id);
        let mut session =
            load_session(&env, session_id.clone()).ok_or(ContractError::SessionNotFound)?;
        session.buyer.require_auth();
        if session.status == SessionStatus::Refunded {
            return Err(ContractError::DuplicateSessionId);
        }
        if session.status != SessionStatus::Locked {
            return Err(ContractError::InvalidSessionStatus);
        }
        let token_addr =
            read_payment_token(&env).ok_or(ContractError::PaymentTokenNotConfigured)?;
        let token = token::Client::new(&env, &token_addr);
        token.transfer(
            &env.current_contract_address(),
            &session.buyer,
            &session.amount,
        );
        session.status = SessionStatus::Refunded;
        save_session(&env, session_id.clone(), &session);
        env.events().publish(
            (Symbol::new(&env, "session_refunded"),),
            (session_id, session.amount),
        );
        Ok(())
    }

    pub fn open_dispute(
        env: Env,
        session_id: Bytes32,
        reason: String,
    ) -> Result<(), ContractError> {
        let mut session =
            load_session(&env, session_id.clone()).ok_or(ContractError::SessionNotFound)?;
        if session.status != SessionStatus::Completed
            && session.status != SessionStatus::Locked
        {
            return Err(ContractError::InvalidSessionStatus);
        }
        session.buyer.require_auth();
        session.status = SessionStatus::Disputed;
        session.dispute_opened_at = env.ledger().timestamp();
        save_session(&env, session_id.clone(), &session);
        env.events().publish(
            (Symbol::new(&env, "DisputeOpened"),),
            (session_id, reason),
        );
        Ok(())
    }

    pub fn resolve_dispute(
        env: Env,
        session_id: Bytes32,
        resolution: u32,
        buyer_share: i128,
        seller_share: i128,
    ) -> Result<(), ContractError> {
        dao::ensure_admin_may_resolve(&env, &session_id);
        require_admin(&env)?;
        let mut session =
            load_session(&env, session_id.clone()).ok_or(ContractError::SessionNotFound)?;
        if session.status != SessionStatus::Disputed {
            return Err(ContractError::InvalidSessionStatus);
        }
        if buyer_share < 0
            || seller_share < 0
            || buyer_share
                .checked_add(seller_share)
                .map_or(true, |total| total != session.amount)
        {
            return Err(ContractError::InvalidShares);
        }
        match resolution {
            0 | 1 | 2 => {}
            _ => return Err(ContractError::InvalidResolution),
        }
        if resolution == 0 && (buyer_share != session.amount || seller_share != 0) {
            return Err(ContractError::InvalidShares);
        }
        if resolution == 1 && (seller_share != session.amount || buyer_share != 0) {
            return Err(ContractError::InvalidShares);
        }

        let token_addr =
            read_payment_token(&env).ok_or(ContractError::PaymentTokenNotConfigured)?;
        let token = token::Client::new(&env, &token_addr);
        let contract = env.current_contract_address();

        let (settlement, fee) = apply_fee(&env, session.amount);
        let buyer_payout = if buyer_share == session.amount {
            settlement
        } else if seller_share == session.amount {
            0
        } else {
            buyer_share
                .checked_mul(settlement)
                .and_then(|value| value.checked_div(session.amount))
                .unwrap_or(0)
        };
        let seller_payout = settlement - buyer_payout;
        if buyer_payout > 0 {
            token.transfer(&contract, &session.buyer, &buyer_payout);
        }
        if seller_payout > 0 {
            token.transfer(&contract, &session.seller, &seller_payout);
        }
        transfer_treasury_fee(&env, &token, fee)?;

        session.status = SessionStatus::Resolved;
        session.dispute_resolved_at = env.ledger().timestamp();
        save_session(&env, session_id.clone(), &session);
        env.events().publish(
            (Symbol::new(&env, "DisputeResolved"),),
            (session_id, resolution, buyer_share, seller_share),
        );
        Ok(())
    }

    pub fn auto_refund(env: Env, session_id: Bytes32) -> Result<(), ContractError> {
        let mut session =
            load_session(&env, session_id.clone()).ok_or(ContractError::SessionNotFound)?;
        if session.status != SessionStatus::Completed {
            return Err(ContractError::InvalidSessionStatus);
        }
        let deadline = session
            .completed_at
            .checked_add(read_dispute_window(&env) as u64)
            .ok_or(ContractError::InvalidSessionStatus)?;
        if env.ledger().timestamp() <= deadline {
            return Err(ContractError::InvalidSessionStatus);
        }
        let token_addr =
            read_payment_token(&env).ok_or(ContractError::PaymentTokenNotConfigured)?;
        let token = token::Client::new(&env, &token_addr);
        token.transfer(
            &env.current_contract_address(),
            &session.buyer,
            &session.amount,
        );
        session.status = SessionStatus::Refunded;
        save_session(&env, session_id.clone(), &session);
        env.events().publish(
            (Symbol::new(&env, "AutoRefundExecuted"),),
            (session_id, session.amount),
        );
        Ok(())
    }

    pub fn get_session(env: Env, session_id: Bytes32) -> Option<Session> {
        load_session(&env, session_id)
    }
}

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn apply_fee_zero_fee() {
        let env = Env::default();
        let contract = env.register(SkillssyncEscrow, ());
        env.as_contract(&contract, || {
            env.storage()
                .persistent()
                .set(&DataKey::PlatformFeeBps, &0u32);
            assert_eq!(apply_fee(&env, 10_000), (10_000, 0));
        });
    }

    #[test]
    fn apply_fee_max_fee() {
        let env = Env::default();
        let contract = env.register(SkillssyncEscrow, ());
        env.as_contract(&contract, || {
            env.storage()
                .persistent()
                .set(&DataKey::PlatformFeeBps, &MAX_PLATFORM_FEE_BPS);
            assert_eq!(apply_fee(&env, 10_001), (9_001, 1_000));
        });
    }

    #[test]
    fn apply_fee_rounding() {
        let env = Env::default();
        let contract = env.register(SkillssyncEscrow, ());
        env.as_contract(&contract, || {
            env.storage()
                .persistent()
                .set(&DataKey::PlatformFeeBps, &100u32);
            assert_eq!(apply_fee(&env, 49), (49, 0));
            assert_eq!(apply_fee(&env, 10_001), (9_901, 100));
        });
    }
}
