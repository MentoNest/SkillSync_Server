//! Upgrade safety tests: storage schema and session data must survive a
//! contract code upgrade.
//!
//! All escrow state lives in persistent storage, which is independent of the
//! contract's executable. An upgrade is simulated by re-registering the
//! contract code at the same address, which replaces the executable while
//! leaving persistent ledger entries untouched.

use crate::{DataKey, Session, SessionStatus, SkillssyncEscrow, SkillssyncEscrowClient};
use soroban_sdk::{testutils::Address as _, token, Address, BytesN, Env};

const AMOUNT: i128 = 10_000;

struct Ctx {
    env: Env,
    contract_id: Address,
    token_id: Address,
    admin: Address,
    buyer: Address,
    seller: Address,
}

fn setup() -> Ctx {
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
    token::StellarAssetClient::new(&env, &token_id).mint(&buyer, &(AMOUNT * 10));

    let client = SkillssyncEscrowClient::new(&env, &contract_id);
    client.set_payment_token(&token_id);
    client.set_treasury(&treasury);
    client.set_platform_fee(&250);

    Ctx {
        env,
        contract_id,
        token_id,
        admin,
        buyer,
        seller,
    }
}

/// Replaces the contract executable at the same address, keeping storage.
fn simulate_upgrade(ctx: &Ctx) {
    ctx.env.register_at(&ctx.contract_id, SkillssyncEscrow, ());
}

fn session_id(env: &Env, seed: u8) -> BytesN<32> {
    BytesN::from_array(env, &[seed; 32])
}

#[test]
fn lock_funds_then_upgrade_session_data_still_readable() {
    let ctx = setup();
    let client = SkillssyncEscrowClient::new(&ctx.env, &ctx.contract_id);
    let token = token::Client::new(&ctx.env, &ctx.token_id);
    let id = session_id(&ctx.env, 1);

    client.lock_funds(&id, &ctx.buyer, &ctx.seller, &AMOUNT);
    let before: Session = client
        .get_session(&id)
        .expect("session missing before upgrade");
    let treasury_before = client.get_treasury();
    let fee_before = client.get_platform_fee();
    let token_before = client.get_payment_token();

    simulate_upgrade(&ctx);

    let client = SkillssyncEscrowClient::new(&ctx.env, &ctx.contract_id);
    let after = client
        .get_session(&id)
        .expect("session missing after upgrade");

    assert_eq!(after, before);
    assert_eq!(after.buyer, ctx.buyer);
    assert_eq!(after.seller, ctx.seller);
    assert_eq!(after.amount, AMOUNT);
    assert_eq!(after.status, SessionStatus::Locked);

    // Configuration survives the upgrade as well.
    assert_eq!(client.get_treasury(), treasury_before);
    assert_eq!(client.get_platform_fee(), fee_before);
    assert_eq!(client.get_payment_token(), token_before);
    ctx.env.as_contract(&ctx.contract_id, || {
        let admin: Option<Address> = ctx.env.storage().persistent().get(&DataKey::Admin);
        assert_eq!(admin, Some(ctx.admin.clone()));
    });

    // Escrowed funds remain held by the contract.
    assert_eq!(token.balance(&ctx.contract_id), AMOUNT);
}

#[test]
fn upgrade_then_complete_session_still_works() {
    let ctx = setup();
    let client = SkillssyncEscrowClient::new(&ctx.env, &ctx.contract_id);
    let token = token::Client::new(&ctx.env, &ctx.token_id);
    let id = session_id(&ctx.env, 2);

    client.lock_funds(&id, &ctx.buyer, &ctx.seller, &AMOUNT);

    simulate_upgrade(&ctx);

    let client = SkillssyncEscrowClient::new(&ctx.env, &ctx.contract_id);
    client.complete_session(&id);
    assert_eq!(
        client.get_session(&id).unwrap().status,
        SessionStatus::Completed
    );

    // The rest of the lifecycle continues to work post-upgrade.
    client.approve_session(&id);
    assert_eq!(
        client.get_session(&id).unwrap().status,
        SessionStatus::Approved
    );
    // The 2.5% fee configured before the upgrade is still applied.
    assert_eq!(token.balance(&ctx.seller), 9_750);
    assert_eq!(token.balance(&ctx.contract_id), 0);
}

#[test]
fn upgrade_then_new_sessions_can_be_locked_and_completed() {
    let ctx = setup();
    let id_old = session_id(&ctx.env, 3);
    let id_new = session_id(&ctx.env, 4);

    SkillssyncEscrowClient::new(&ctx.env, &ctx.contract_id).lock_funds(
        &id_old,
        &ctx.buyer,
        &ctx.seller,
        &AMOUNT,
    );

    simulate_upgrade(&ctx);

    let client = SkillssyncEscrowClient::new(&ctx.env, &ctx.contract_id);
    client.lock_funds(&id_new, &ctx.buyer, &ctx.seller, &AMOUNT);
    client.complete_session(&id_new);

    assert_eq!(
        client.get_session(&id_old).unwrap().status,
        SessionStatus::Locked
    );
    assert_eq!(
        client.get_session(&id_new).unwrap().status,
        SessionStatus::Completed
    );
}
