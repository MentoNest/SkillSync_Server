#![no_std]

use soroban_sdk::{contract, contractimpl, Address, Bytes32, Env, panic_with_error, symbol_short, log};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u32)]
pub enum SessionStatus {
    Locked = 0,
    Released = 1,
    Refunded = 2,
}

#[derive(Debug, Clone)]
pub struct EscrowSession {
    pub session_id: Bytes32,
    pub buyer: Address,
    pub seller: Address,
    pub amount: i128,
    pub status: SessionStatus,
}

#[contract]
pub struct SkillsyncContract;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum ContractError {
    SessionAlreadyExists = 1,
    AmountMustBePositive = 2,
    TransferFailed = 3,
}

#[contractimpl]
impl SkillsyncContract {
    pub fn lock_funds(env: Env, session_id: Bytes32, seller: Address, amount: i128) {
        // Revert if amount is not greater than 0
        if amount <= 0 {
            panic_with_error!(&env, ContractError::AmountMustBePositive);
        }

        // Revert if session ID already exists
        let session_key = (symbol_short!("session"), session_id);
        if env.storage().persistent().has(&session_key) {
            panic_with_error!(&env, ContractError::SessionAlreadyExists);
        }

        // Get the buyer (the caller of this function)
        let buyer = Address::from(env.current_contract_address().caller());
        
        // Require the buyer to authenticate
        buyer.require_auth();

        // Transfer native tokens from buyer to this contract
        env.ledger().transfer_native(&buyer, &env.current_contract_address(), amount);

        // Create and store the session with status = Locked
        let session = EscrowSession {
            session_id: session_id.clone(),
            buyer: buyer.clone(),
            seller: seller.clone(),
            amount,
            status: SessionStatus::Locked,
        };
        env.storage().persistent().set(&session_key, &session);

        // Emit FundsLocked event
        log!(&env, "FundsLocked: session_id={:X}, buyer={:A}, seller={:A}, amount={}", session_id, buyer, seller, amount);
        env.events().publish(
            (symbol_short!("FundsLocked"), session_id.clone()),
            (buyer, seller, amount)
        );
    }

    pub fn hello(env: Env) -> Symbol {
        symbol_short!("Hello")
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{
        symbol_short,
        testutils::{Address as _, Ledger},
        Address, Bytes32, Env,
    };

    #[test]
    #[should_panic(expected = "AmountMustBePositive")]
    fn test_lock_funds_zero_amount() {
        let env = Env::default();
        let contract_id = env.register_contract(None, SkillsyncContract);
        let client = SkillsyncContractClient::new(&env, &contract_id);

        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        let session_id = Bytes32::from([0u8; 32]);

        // Mock the caller to be the buyer
        env.set_caller(buyer.clone());
        // Fund the buyer with native tokens
        env.ledger().mint_native(&buyer, 1000);

        // This should panic because amount is 0
        client.lock_funds(session_id, seller, 0);
    }

    #[test]
    #[should_panic(expected = "SessionAlreadyExists")]
    fn test_lock_funds_duplicate_session() {
        let env = Env::default();
        let contract_id = env.register_contract(None, SkillsyncContract);
        let client = SkillsyncContractClient::new(&env, &contract_id);

        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        let session_id = Bytes32::from([0u8; 32]);

        env.set_caller(buyer.clone());
        env.ledger().mint_native(&buyer, 1000);

        // First call should succeed
        client.lock_funds(session_id.clone(), seller.clone(), 100);
        // Second call with same session_id should panic
        client.lock_funds(session_id, seller, 100);
    }

    #[test]
    fn test_lock_funds_success() {
        let env = Env::default();
        let contract_id = env.register_contract(None, SkillsyncContract);
        let client = SkillsyncContractClient::new(&env, &contract_id);

        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        let session_id = Bytes32::from([0u8; 32]);
        let amount = 100;

        env.set_caller(buyer.clone());
        env.ledger().mint_native(&buyer, 1000);

        // Call lock_funds
        client.lock_funds(session_id.clone(), seller.clone(), amount);

        // Check that the session is stored
        let session_key = (symbol_short!("session"), session_id);
        let session: EscrowSession = env.storage().persistent().get(&session_key).unwrap();
        assert_eq!(session.status, SessionStatus::Locked);
        assert_eq!(session.buyer, buyer);
        assert_eq!(session.seller, seller);
        assert_eq!(session.amount, amount);

        // Check balances: buyer should have 1000 - 100 = 900, contract should have 100
        assert_eq!(env.ledger().balance_native(&buyer), 900);
        assert_eq!(env.ledger().balance_native(&contract_id), 100);

        // Check that the FundsLocked event was emitted
        let events = env.events().all();
        assert_eq!(events.len(), 1);
        let event = events.get(0);
        assert_eq!(event.topics(), (symbol_short!("FundsLocked"), session_id));
        assert_eq!(event.data(), (buyer, seller, amount));
    }

    #[test]
    fn test_hello() {
        let env = Env::default();
        let contract_id = env.register_contract(None, SkillsyncContract);
        let client = SkillsyncContractClient::new(&env, &contract_id);

        let msg = client.hello();
        assert_eq!(msg, symbol_short!("Hello"));
    }
}