use soroban_sdk::{token, Address, Env};

use crate::errors::ContractError;
use crate::storage;

fn token_client(env: &Env) -> Result<token::Client<'_>, ContractError> {
    let token = storage::get_token(env).ok_or(ContractError::TokenNotConfigured)?;
    Ok(token::Client::new(env, &token))
}

/// Moves `amount` of the payment token from `from` into the contract.
pub fn pull_in(env: &Env, from: &Address, amount: i128) -> Result<(), ContractError> {
    token_client(env)?.transfer(from, &env.current_contract_address(), &amount);
    Ok(())
}

/// Pays `amount` of the payment token out of the contract to `to`.
pub fn pay_out(env: &Env, to: &Address, amount: i128) -> Result<(), ContractError> {
    if amount > 0 {
        token_client(env)?.transfer(&env.current_contract_address(), to, &amount);
    }
    Ok(())
}
