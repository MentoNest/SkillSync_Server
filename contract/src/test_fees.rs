//! Fee calculation edge cases, exercised end-to-end through
//! `lock_funds` -> `complete_session` -> `approve_session`.

use crate::{ContractError, DataKey, SkillssyncEscrow, SkillssyncEscrowClient};
use soroban_sdk::{testutils::Address as _, token, Address, BytesN, Env};

struct Ctx {
    env: Env,
    contract_id: Address,
    token_id: Address,
    buyer: Address,
    seller: Address,
    treasury: Address,
}

fn setup(fee_bps: u32, buyer_funds: i128) -> Ctx {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let buyer = Address::generate(&env);
    let seller = Address::generate(&env);
    let treasury = Address::generate(&env);

    let contract_id = env.register(SkillssyncEscrow, ());
    env.as_contract(&contract_id, || {
        env.storage().persistent().set(&DataKey::Admin, &admin);
    });

    let token_id = env
        .register_stellar_asset_contract_v2(admin.clone())
        .address();
    token::StellarAssetClient::new(&env, &token_id).mint(&buyer, &buyer_funds);

    let client = SkillssyncEscrowClient::new(&env, &contract_id);
    client.set_payment_token(&token_id);
    client.set_treasury(&treasury);
    client.set_platform_fee(&fee_bps);

    Ctx {
        env,
        contract_id,
        token_id,
        buyer,
        seller,
        treasury,
    }
}

/// Runs a full session for `amount` and returns what the seller and the
/// treasury received: `(seller_gain, treasury_gain)`.
fn settle(ctx: &Ctx, seed: u8, amount: i128) -> (i128, i128) {
    let client = SkillssyncEscrowClient::new(&ctx.env, &ctx.contract_id);
    let token = token::Client::new(&ctx.env, &ctx.token_id);
    let id = BytesN::from_array(&ctx.env, &[seed; 32]);

    let seller_before = token.balance(&ctx.seller);
    let treasury_before = token.balance(&ctx.treasury);

    client.lock_funds(&id, &ctx.buyer, &ctx.seller, &amount);
    client.complete_session(&id);
    client.approve_session(&id);

    let seller_gain = token.balance(&ctx.seller) - seller_before;
    let treasury_gain = token.balance(&ctx.treasury) - treasury_before;

    // Value is conserved: payout + fee == escrowed amount.
    assert_eq!(seller_gain + treasury_gain, amount);
    assert_eq!(token.balance(&ctx.contract_id), 0);
    (seller_gain, treasury_gain)
}

#[test]
fn zero_fee_seller_receives_full_amount() {
    let ctx = setup(0, 1_000_000);
    assert_eq!(settle(&ctx, 1, 10_000), (10_000, 0));
    assert_eq!(settle(&ctx, 2, 1), (1, 0));
    assert_eq!(settle(&ctx, 3, 123_457), (123_457, 0));
}

#[test]
fn max_fee_seller_receives_ninety_percent() {
    let ctx = setup(1000, 10_000_000);
    assert_eq!(settle(&ctx, 1, 10_000), (9_000, 1_000));
    assert_eq!(settle(&ctx, 2, 1_000_000), (900_000, 100_000));
}

#[test]
fn max_fee_rounds_down_in_favour_of_seller() {
    let ctx = setup(1000, 1_000_000);
    // 10% of 1 and 9 rounds down to a zero fee.
    assert_eq!(settle(&ctx, 1, 1), (1, 0));
    assert_eq!(settle(&ctx, 2, 9), (9, 0));
    // 10% of 10 is exactly 1.
    assert_eq!(settle(&ctx, 3, 10), (9, 1));
    // 10% of 19 = 1.9, rounds down to 1.
    assert_eq!(settle(&ctx, 4, 19), (18, 1));
    // 10% of 10_001 = 1000.1, rounds down to 1000.
    assert_eq!(settle(&ctx, 5, 10_001), (9_001, 1_000));
}

#[test]
fn max_fee_with_very_large_amount_does_not_overflow() {
    let amount: i128 = 1_000_000_000_000_000_000_000_000_000_000; // 1e30
    let ctx = setup(1000, amount);
    assert_eq!(settle(&ctx, 1, amount), (amount / 10 * 9, amount / 10));
}

#[test]
fn fee_above_max_is_rejected() {
    let ctx = setup(0, 1);
    let client = SkillssyncEscrowClient::new(&ctx.env, &ctx.contract_id);
    assert_eq!(
        client.try_set_platform_fee(&1001),
        Err(Ok(ContractError::InvalidPlatformFee))
    );
    assert_eq!(client.get_platform_fee(), 0);
}
