use soroban_sdk::{contracttype, symbol_short, Address, Env, Symbol};

use crate::admin::require_admin;
use crate::errors::ContractError;
use crate::events;
use crate::storage;

/// SEP-41 token movement, and the platform fee's currency.
///
/// The contract does not implement a token; it calls one. Every movement goes
/// through a Soroban contract exposing the standard interface — `transfer(to,
/// amount)` and `transfer_from(from, to, amount)` — so any compliant token
/// works, not just the native asset. Each session records the token it
/// escrowed and that token never changes, so a session can never hold a mix:
/// settlement reads the token off the session and moves exactly that token.

/// Storage keys owned by this module.
#[contracttype]
#[derive(Clone)]
pub enum TokenKey {
    /// The token the platform fee is settled in, if the admin has pinned one.
    ///
    /// `None` means "settle the fee in whatever the session escrows", which is
    /// the default and the only option that needs no price lookup.
    FeeToken,
}

/// SEP-41 `transfer_from`. The name is longer than `symbol_short!` allows, so
/// it is built as a full `Symbol`.
fn transfer_from_symbol(env: &Env) -> Symbol {
    Symbol::new(env, "transfer_from")
}

/// SEP-41 `transfer`.
fn transfer_symbol(env: &Env) -> Symbol {
    Symbol::new(env, "transfer")
}

/// The token the platform fee is settled in, if the admin has pinned one.
pub fn get_fee_token(env: &Env) -> Option<Address> {
    env.storage().instance().get(&TokenKey::FeeToken)
}

/// Pin the token the platform fee is settled in (admin only).
///
/// Pinning a token other than the one a session escrows means the fee is
/// collected from the buyer in the pinned token and the seller receives the
/// escrowed amount in full. See [`crate::session::approve_session`] for how
/// the conversion is priced, and for what happens when no price is available.
///
/// # Errors
/// - [`ContractError::NotInitialized`] if the contract is not initialized.
/// - [`ContractError::NotAdmin`] if `caller` is not the admin.
///
/// # Events
/// Emits `FeeTokenSet` with the new fee token.
pub fn set_fee_token(env: &Env, caller: Address, fee_token: Address) -> Result<(), ContractError> {
    require_admin(env, &caller)?;

    env.storage()
        .instance()
        .set(&TokenKey::FeeToken, &fee_token);
    env.events()
        .publish((symbol_short!("fee_tok"),), fee_token);

    Ok(())
}

/// Go back to settling the fee in whatever the session escrows (admin only).
///
/// # Errors
/// - [`ContractError::NotInitialized`] if the contract is not initialized.
/// - [`ContractError::NotAdmin`] if `caller` is not the admin.
///
/// # Events
/// Emits `FeeTokenCleared`.
pub fn clear_fee_token(env: &Env, caller: Address) -> Result<(), ContractError> {
    require_admin(env, &caller)?;

    env.storage().instance().remove(&TokenKey::FeeToken);
    env.events()
        .publish((symbol_short!("fee_tclr"),), ());

    Ok(())
}

/// Pull `amount` of `token` from `from` into `to` using the token's
/// `transfer_from`.
///
/// This is how funds enter the escrow: the buyer is the one authorising the
/// pull, so a session cannot be opened against a buyer who has not approved
/// the allowance.
///
/// # Errors
/// [`ContractError::TokenTransferFailed`] if the call reverts, the token has
/// no such function, or it returns a shape this contract cannot read. Those
/// are indistinguishable from the outside — a Soroban cross-contract call
/// reports failure, not a reason — so they share one code and the underlying
/// reason is left to the transaction's own diagnostics.
pub fn pull_from(
    env: &Env,
    token: &Address,
    from: &Address,
    to: &Address,
    amount: i128,
) -> Result<(), ContractError> {
    env.try_invoke_contract::<(), _>(
        token,
        &transfer_from_symbol(env),
        (from.clone(), to.clone(), amount),
    )
    .map_err(|_| ContractError::TokenTransferFailed)
}

/// Send `amount` of `token` from the contract to `to` using the token's
/// `transfer`.
///
/// This is how funds leave the escrow, to the seller, the buyer, or the
/// treasury.
///
/// # Errors
/// [`ContractError::TokenTransferFailed`] under the same conditions as
/// [`pull_from`].
pub fn send_to(env: &Env, token: &Address, to: &Address, amount: i128) -> Result<(), ContractError> {
    env.try_invoke_contract::<(), _>(
        token,
        &transfer_symbol(env),
        (to.clone(), amount),
    )
    .map_err(|_| ContractError::TokenTransferFailed)
}

/// Send `amount` of `token` to the treasury, if one is configured and
/// `amount` is positive.
///
/// A zero fee is not an error: with the default 0 bps platform fee there is
/// simply nothing to route, and paying a zero-value transfer would be a
/// pointless cross-contract call. A missing treasury is also not an error,
/// because the fee was already deducted from the seller's payout and
/// dropping it on the floor would be worse than holding it in the contract.
pub fn route_fee_to_treasury(env: &Env, token: &Address, amount: i128) {
    if amount <= 0 {
        return;
    }
    let treasury = match storage::get_treasury(env) {
        Some(t) => t,
        None => return,
    };
    if let Err(e) = send_to(env, token, &treasury, amount) {
        // The fee has already been deducted from the seller's payout, so
        // surfacing this as an error would revert the whole approval and
        // strand the buyer. The tokens stay held by the contract and the
        // failure is announced, so an operator can recover them.
        events::emit_fee_routing_failed(env, token, &treasury, amount, &e);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testutil::{self, NotAToken};
    use crate::{SkillSyncContract, SkillSyncContractClient};
    use soroban_sdk::testutils::Address as _;

    struct Harness {
        env: Env,
        contract_id: Address,
        admin: Address,
        treasury: Address,
        client: SkillSyncContractClient<'static>,
    }

    impl Harness {
        fn new() -> Self {
            let env = Env::default();
            env.mock_all_auths();
            let contract_id = env.register(SkillSyncContract, ());
            let client = SkillSyncContractClient::new(&env, &contract_id);
            let admin = Address::generate(&env);
            let treasury = Address::generate(&env);
            client.initialize(&admin, &treasury).unwrap();
            Harness { env, contract_id, admin, treasury, client }
        }
    }

    #[test]
    fn pull_from_moves_the_amount_between_accounts() {
        let h = Harness::new();
        let token = testutil::new_token(&h.env);
        let buyer = Address::generate(&h.env);
        testutil::fund(&h.env, &token, &buyer, 1_000);

        pull_from(&h.env, &token, &buyer, &h.contract_id, 400).unwrap();

        assert_eq!(testutil::balance(&h.env, &token, &buyer), 600);
        assert_eq!(testutil::balance(&h.env, &token, &h.contract_id), 400);
    }

    #[test]
    fn send_to_moves_the_amount_out_of_the_contract() {
        let h = Harness::new();
        let token = testutil::new_token(&h.env);
        let seller = Address::generate(&h.env);
        testutil::fund(&h.env, &token, &h.contract_id, 1_000);

        send_to(&h.env, &token, &seller, 250).unwrap();

        assert_eq!(testutil::balance(&h.env, &token, &seller), 250);
        assert_eq!(testutil::balance(&h.env, &token, &h.contract_id), 750);
    }

    #[test]
    fn a_contract_that_is_not_a_token_reports_a_transfer_failure() {
        let h = Harness::new();
        let not_a_token = h.env.register(NotAToken, ());
        let party = Address::generate(&h.env);

        let err = pull_from(&h.env, &not_a_token, &party, &party, 1).unwrap_err();
        assert_eq!(err, ContractError::TokenTransferFailed);
        assert_eq!(err.code(), 406);

        let err = send_to(&h.env, &not_a_token, &party, 1).unwrap_err();
        assert_eq!(err, ContractError::TokenTransferFailed);
    }

    #[test]
    fn a_shortfall_reports_a_transfer_failure() {
        let h = Harness::new();
        let token = testutil::new_token(&h.env);
        let buyer = Address::generate(&h.env);
        testutil::fund(&h.env, &token, &buyer, 10);

        let err = pull_from(&h.env, &token, &buyer, &h.contract_id, 1_000).unwrap_err();
        assert_eq!(err, ContractError::TokenTransferFailed);
    }

    #[test]
    fn fee_token_defaults_to_settling_in_the_escrowed_token() {
        let h = Harness::new();
        assert_eq!(h.client.get_fee_token(), None);
        assert_eq!(get_fee_token(&h.env), None);
    }

    #[test]
    fn fee_token_can_be_pinned_and_cleared() {
        let h = Harness::new();
        let stablecoin = testutil::new_token(&h.env);

        assert_eq!(h.client.get_fee_token(), None);
        h.client.set_fee_token(&h.admin, &stablecoin).unwrap();
        assert_eq!(h.client.get_fee_token(), Some(stablecoin));

        h.client.clear_fee_token(&h.admin).unwrap();
        assert_eq!(h.client.get_fee_token(), None);
    }

    #[test]
    fn only_the_admin_can_pin_the_fee_token() {
        let h = Harness::new();
        let attacker = Address::generate(&h.env);
        let token_id = testutil::new_token(&h.env);

        let err = h
            .client
            .try_set_fee_token(&attacker, &token_id)
            .unwrap()
            .unwrap_err();
        assert_eq!(err, ContractError::NotAdmin);
    }

    #[test]
    fn a_zero_fee_is_not_routed_at_all() {
        let h = Harness::new();
        let token = testutil::new_token(&h.env);
        testutil::fund(&h.env, &token, &h.contract_id, 1_000);

        route_fee_to_treasury(&h.env, &token, &h.treasury, 0);

        assert_eq!(testutil::balance(&h.env, &token, &h.treasury), 0);
        assert_eq!(testutil::balance(&h.env, &token, &h.contract_id), 1_000);
    }

    #[test]
    fn a_routed_fee_lands_in_the_treasury() {
        let h = Harness::new();
        let token = testutil::new_token(&h.env);
        testutil::fund(&h.env, &token, &h.contract_id, 1_000);

        route_fee_to_treasury(&h.env, &token, &h.treasury, 30);

        assert_eq!(testutil::balance(&h.env, &token, &h.treasury), 30);
        assert_eq!(testutil::balance(&h.env, &token, &h.contract_id), 970);
    }
}
