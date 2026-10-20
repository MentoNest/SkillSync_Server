use soroban_sdk::{contractimpl, Address, BytesN, Env, String};

use crate::errors::ContractError;
use crate::lifecycle::{load, require_status};
use crate::types::{Session, SessionStatus};
use crate::{admin, events, fees, payments, storage};
use crate::{SkillSyncEscrow, SkillSyncEscrowArgs, SkillSyncEscrowClient};

/// `resolve_dispute` outcome: the whole amount goes back to the buyer.
pub const RESOLUTION_REFUND_BUYER: u32 = 0;
/// `resolve_dispute` outcome: the whole amount goes to the seller.
pub const RESOLUTION_PAY_SELLER: u32 = 1;
/// `resolve_dispute` outcome: the amount is split between both parties.
pub const RESOLUTION_SPLIT: u32 = 2;

/// Checks the admin's shares: non-negative, summing to the escrowed amount,
/// and consistent with the chosen resolution.
fn validate_resolution(
    session: &Session,
    resolution: u32,
    buyer_share: i128,
    seller_share: i128,
) -> Result<(), ContractError> {
    if buyer_share < 0 || seller_share < 0 {
        return Err(ContractError::InvalidShares);
    }
    let total = buyer_share
        .checked_add(seller_share)
        .ok_or(ContractError::ArithmeticOverflow)?;
    if total != session.amount {
        return Err(ContractError::InvalidShares);
    }
    let consistent = match resolution {
        RESOLUTION_REFUND_BUYER => seller_share == 0,
        RESOLUTION_PAY_SELLER => buyer_share == 0,
        RESOLUTION_SPLIT => buyer_share > 0 && seller_share > 0,
        _ => false,
    };
    if consistent {
        Ok(())
    } else {
        Err(ContractError::InvalidResolution)
    }
}

/// Pays one side of a resolution with the platform fee taken out, but
/// leaves the fee in the contract so both sides' fees go out in one transfer.
fn pay_share(env: &Env, to: &Address, share: i128) -> Result<(i128, i128), ContractError> {
    let (after_fee, fee) = fees::apply_fee(env, share)?;
    payments::pay_out(env, to, after_fee)?;
    Ok((after_fee, fee))
}

#[contractimpl]
impl SkillSyncEscrow {
    /// The buyer or seller (`caller`) disputes a Locked or Completed session,
    /// freezing its funds until the admin calls `resolve_dispute`.
    /// Locked | Completed -> Disputed.
    pub fn open_dispute(
        env: Env,
        session_id: BytesN<32>,
        caller: Address,
        reason: String,
    ) -> Result<(), ContractError> {
        let mut session = load(&env, &session_id)?;
        if caller != session.buyer && caller != session.seller {
            return Err(ContractError::NotAParticipant);
        }
        caller.require_auth();
        if session.status != SessionStatus::Locked && session.status != SessionStatus::Completed {
            return Err(ContractError::InvalidStatus);
        }

        session.status = SessionStatus::Disputed;
        session.dispute_opened_at = env.ledger().sequence() as u64;
        storage::save_session(&env, &session_id, &session);

        events::emit_dispute_opened(&env, &session_id, &caller, &reason);
        Ok(())
    }

    /// The admin settles a dispute. `resolution` is one of
    /// [`RESOLUTION_REFUND_BUYER`], [`RESOLUTION_PAY_SELLER`] or
    /// [`RESOLUTION_SPLIT`]; the shares must add up to the escrowed amount.
    /// The platform fee is taken from each share and sent to the treasury.
    /// Disputed -> Resolved.
    pub fn resolve_dispute(
        env: Env,
        session_id: BytesN<32>,
        resolution: u32,
        buyer_share: i128,
        seller_share: i128,
    ) -> Result<(), ContractError> {
        let admin = admin::require_admin(&env)?;
        admin.require_auth();

        let mut session = load(&env, &session_id)?;
        require_status(&session, SessionStatus::Disputed)?;
        validate_resolution(&session, resolution, buyer_share, seller_share)?;

        // State first, transfers after: a failing transfer reverts everything.
        session.status = SessionStatus::Resolved;
        session.dispute_resolved_at = env.ledger().sequence() as u64;
        storage::save_session(&env, &session_id, &session);

        let (buyer_payout, buyer_fee) = pay_share(&env, &session.buyer, buyer_share)?;
        let (seller_payout, seller_fee) = pay_share(&env, &session.seller, seller_share)?;
        let fee = buyer_fee + seller_fee;
        fees::pay_fee(&env, fee)?;

        events::emit_dispute_resolved(
            &env,
            &session_id,
            resolution,
            buyer_payout,
            seller_payout,
            fee,
        );
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_utils::{balance, seed_session, session_id, setup, Fixture};
    use soroban_sdk::testutils::{Address as _, Events, Ledger};
    use soroban_sdk::{IntoVal, Symbol};

    fn reason(f: &Fixture) -> String {
        String::from_str(&f.env, "mentor did not show up")
    }

    fn disputed(f: &Fixture, seed: u8, amount: i128) -> BytesN<32> {
        let id = session_id(&f.env, seed);
        seed_session(f, &id, SessionStatus::Completed, amount, 10);
        f.client.open_dispute(&id, &f.buyer, &reason(f));
        id
    }

    fn set_fee(f: &Fixture, bps: u32) {
        f.env
            .as_contract(&f.contract_id, || storage::set_platform_fee(&f.env, bps));
    }

    #[test]
    fn buyer_or_seller_can_open_a_dispute_on_completed_or_locked_sessions() {
        let f = setup();
        f.env.ledger().with_mut(|l| l.sequence_number = 77);

        let completed = session_id(&f.env, 1);
        seed_session(&f, &completed, SessionStatus::Completed, 1_000, 10);
        f.client.open_dispute(&completed, &f.buyer, &reason(&f));
        let session = f.client.get_session(&completed);
        assert_eq!(session.status, SessionStatus::Disputed);
        assert_eq!(session.dispute_opened_at, 77);

        let locked = session_id(&f.env, 2);
        seed_session(&f, &locked, SessionStatus::Locked, 1_000, 0);
        f.client.open_dispute(&locked, &f.seller, &reason(&f));
        assert_eq!(
            f.client.get_session(&locked).status,
            SessionStatus::Disputed
        );
    }

    #[test]
    fn open_dispute_emits_who_opened_it_why_and_when() {
        let f = setup();
        f.env.ledger().with_mut(|l| l.timestamp = 1_700_000_000);
        let id = session_id(&f.env, 3);
        seed_session(&f, &id, SessionStatus::Completed, 1_000, 10);
        f.client.open_dispute(&id, &f.buyer, &reason(&f));

        let (_, topics, data) = f.env.events().all().last().unwrap();
        assert_eq!(
            topics,
            (Symbol::new(&f.env, "DisputeOpened"), id.clone()).into_val(&f.env)
        );
        let data: (Address, String, u64) = data.into_val(&f.env);
        assert_eq!(data, (f.buyer.clone(), reason(&f), 1_700_000_000));
    }

    #[test]
    fn outsiders_cannot_open_a_dispute() {
        let f = setup();
        let id = session_id(&f.env, 4);
        seed_session(&f, &id, SessionStatus::Completed, 1_000, 10);
        let stranger = Address::generate(&f.env);
        assert_eq!(
            f.client.try_open_dispute(&id, &stranger, &reason(&f)),
            Err(Ok(ContractError::NotAParticipant))
        );
    }

    #[test]
    fn opening_a_dispute_needs_the_callers_signature() {
        let f = setup();
        let id = session_id(&f.env, 5);
        seed_session(&f, &id, SessionStatus::Completed, 1_000, 10);
        f.env.mock_auths(&[]);
        assert!(f
            .client
            .try_open_dispute(&id, &f.buyer, &reason(&f))
            .is_err());
    }

    #[test]
    fn disputes_need_a_locked_or_completed_session() {
        let f = setup();
        for (seed, status) in [
            (6u8, SessionStatus::Approved),
            (7, SessionStatus::Refunded),
            (8, SessionStatus::Disputed),
            (9, SessionStatus::Resolved),
        ] {
            let id = session_id(&f.env, seed);
            seed_session(&f, &id, status, 1_000, 10);
            assert_eq!(
                f.client.try_open_dispute(&id, &f.buyer, &reason(&f)),
                Err(Ok(ContractError::InvalidStatus))
            );
        }
        let missing = session_id(&f.env, 10);
        assert_eq!(
            f.client.try_open_dispute(&missing, &f.buyer, &reason(&f)),
            Err(Ok(ContractError::SessionNotFound))
        );
    }

    #[test]
    fn a_disputed_session_blocks_the_normal_settlement_paths() {
        let f = setup();
        let id = disputed(&f, 11, 1_000);
        assert_eq!(
            f.client.try_approve_session(&id),
            Err(Ok(ContractError::InvalidStatus))
        );
        assert_eq!(
            f.client.try_refund_session(&id),
            Err(Ok(ContractError::InvalidStatus))
        );
        f.env.ledger().with_mut(|l| l.sequence_number = 1_000_000);
        assert_eq!(
            f.client.try_auto_refund(&id),
            Err(Ok(ContractError::InvalidStatus))
        );
    }

    #[test]
    fn admin_can_refund_the_buyer_in_full() {
        let f = setup();
        let id = disputed(&f, 12, 1_000);
        let before = balance(&f, &f.buyer);
        f.env.ledger().with_mut(|l| l.sequence_number = 500);

        f.client
            .resolve_dispute(&id, &RESOLUTION_REFUND_BUYER, &1_000, &0);

        assert_eq!(balance(&f, &f.buyer), before + 1_000);
        assert_eq!(balance(&f, &f.seller), 0);
        assert_eq!(balance(&f, &f.contract_id), 0);
        let session = f.client.get_session(&id);
        assert_eq!(session.status, SessionStatus::Resolved);
        assert_eq!(session.dispute_resolved_at, 500);
    }

    #[test]
    fn admin_can_pay_the_seller_with_the_fee_applied() {
        let f = setup();
        set_fee(&f, 250);
        let id = disputed(&f, 13, 10_000);

        f.client
            .resolve_dispute(&id, &RESOLUTION_PAY_SELLER, &0, &10_000);

        assert_eq!(balance(&f, &f.seller), 9_750);
        assert_eq!(balance(&f, &f.treasury), 250);
        assert_eq!(balance(&f, &f.contract_id), 0);
    }

    #[test]
    fn split_applies_the_fee_to_each_share() {
        let f = setup();
        set_fee(&f, 1_000); // 10%
        let id = disputed(&f, 14, 1_000);
        let buyer_before = balance(&f, &f.buyer);

        f.client.resolve_dispute(&id, &RESOLUTION_SPLIT, &300, &700);

        let (_, topics, data) = f.env.events().all().last().unwrap();
        assert_eq!(
            topics,
            (Symbol::new(&f.env, "DisputeResolved"), id.clone()).into_val(&f.env)
        );
        let data: (u32, i128, i128, i128) = data.into_val(&f.env);
        assert_eq!(data, (RESOLUTION_SPLIT, 270, 630, 100));

        assert_eq!(balance(&f, &f.buyer), buyer_before + 270);
        assert_eq!(balance(&f, &f.seller), 630);
        assert_eq!(balance(&f, &f.treasury), 100);
        assert_eq!(balance(&f, &f.contract_id), 0);
    }

    #[test]
    fn shares_must_add_up_to_the_escrowed_amount() {
        let f = setup();
        let id = disputed(&f, 15, 1_000);
        assert_eq!(
            f.client
                .try_resolve_dispute(&id, &RESOLUTION_SPLIT, &300, &600),
            Err(Ok(ContractError::InvalidShares))
        );
        assert_eq!(
            f.client
                .try_resolve_dispute(&id, &RESOLUTION_SPLIT, &1_100, &-100),
            Err(Ok(ContractError::InvalidShares))
        );
        assert_eq!(f.client.get_session(&id).status, SessionStatus::Disputed);
    }

    #[test]
    fn resolution_must_match_the_shares() {
        let f = setup();
        let id = disputed(&f, 16, 1_000);
        for (resolution, buyer, seller) in [
            (RESOLUTION_REFUND_BUYER, 900i128, 100i128),
            (RESOLUTION_PAY_SELLER, 1, 999),
            (RESOLUTION_SPLIT, 1_000, 0),
            (RESOLUTION_SPLIT, 0, 1_000),
            (3, 500, 500),
        ] {
            assert_eq!(
                f.client
                    .try_resolve_dispute(&id, &resolution, &buyer, &seller),
                Err(Ok(ContractError::InvalidResolution))
            );
        }
    }

    #[test]
    fn only_disputed_sessions_can_be_resolved_and_only_once() {
        let f = setup();
        let completed = session_id(&f.env, 17);
        seed_session(&f, &completed, SessionStatus::Completed, 1_000, 10);
        assert_eq!(
            f.client
                .try_resolve_dispute(&completed, &RESOLUTION_PAY_SELLER, &0, &1_000),
            Err(Ok(ContractError::InvalidStatus))
        );

        let id = disputed(&f, 18, 1_000);
        f.client
            .resolve_dispute(&id, &RESOLUTION_PAY_SELLER, &0, &1_000);
        assert_eq!(
            f.client
                .try_resolve_dispute(&id, &RESOLUTION_PAY_SELLER, &0, &1_000),
            Err(Ok(ContractError::InvalidStatus))
        );
    }

    #[test]
    fn only_the_admin_can_resolve() {
        let f = setup();
        let id = disputed(&f, 19, 1_000);
        // Buyer and seller signing is not enough: the stored admin must sign.
        f.env.mock_auths(&[]);
        assert!(f
            .client
            .try_resolve_dispute(&id, &RESOLUTION_REFUND_BUYER, &1_000, &0)
            .is_err());
        assert_eq!(f.client.get_session(&id).status, SessionStatus::Disputed);
    }
}
