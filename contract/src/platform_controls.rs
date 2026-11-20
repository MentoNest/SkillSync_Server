//! Emergency pause, referrer fee split, mutual deadline extension and analytics views.
//!
//! Everything here is stored under its own [`ControlKey`] enum and uses its own
//! error range (800-899), so it does not touch the core `DataKey` or `ContractError`.
//! Errors that must abort an existing function are raised with `panic_with_error!`.

use super::*;
use soroban_sdk::{contracterror, contractimpl, contracttype, panic_with_error, Vec};

/// Longest extension, in ledgers, a single proposal may add to a session deadline.
pub const MAX_EXTENSION_LEDGERS: u32 = 10_000;
/// Referrer share of the platform fee is capped at 10% (1000 bps) of the fee.
pub const MAX_REFERRER_FEE_BPS: u32 = 1_000;
/// Deadline given to a new session: about 7 days of ledgers.
pub const DEFAULT_SESSION_DEADLINE_LEDGERS: u32 = 120_960;

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ControlKey {
    Paused,
    ReferrerFeeBps,
    Referrer(Bytes32),
    ReferrerBalance(Address),
    ExtensionProposal(Bytes32),
    VolumeLocked,
    FeesCollected,
    SessionIndex,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ExtensionProposal {
    pub proposer: Address,
    pub additional_ledgers: u32,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum ControlError {
    ContractPaused = 800,
    InvalidReferrerFee = 801,
    InvalidReferrer = 802,
    NothingToClaim = 803,
    InvalidExtension = 804,
    NotAParty = 805,
    NoExtensionProposal = 806,
    SessionFinalized = 807,
    DeadlineOverflow = 808,
}

fn is_paused_flag(env: &Env) -> bool {
    env.storage()
        .persistent()
        .get(&ControlKey::Paused)
        .unwrap_or(false)
}

/// Guard for state-changing functions: aborts the call while the contract is paused.
pub(crate) fn when_not_paused(env: &Env) {
    if is_paused_flag(env) {
        panic_with_error!(env, ControlError::ContractPaused);
    }
}

fn referrer_fee_bps(env: &Env) -> u32 {
    env.storage()
        .persistent()
        .get(&ControlKey::ReferrerFeeBps)
        .unwrap_or(0)
}

fn add_to_i128(env: &Env, key: &ControlKey, amount: i128) {
    let current: i128 = env.storage().persistent().get(key).unwrap_or(0);
    env.storage().persistent().set(key, &(current + amount));
}

/// Splits `fee` between a session's referrer and the treasury. The referrer's part is
/// credited to its claimable balance; the amount left for the treasury is returned.
pub(crate) fn take_referrer_share(env: &Env, session_id: &Bytes32, fee: i128) -> i128 {
    if fee <= 0 {
        return fee;
    }
    let referrer: Option<Address> = env
        .storage()
        .persistent()
        .get(&ControlKey::Referrer(session_id.clone()));
    let Some(referrer) = referrer else {
        return fee;
    };
    let bps = referrer_fee_bps(env) as i128;
    let share = fee / 10_000 * bps + fee % 10_000 * bps / 10_000;
    if share <= 0 {
        return fee;
    }
    add_to_i128(env, &ControlKey::ReferrerBalance(referrer), share);
    fee - share
}

/// Records fees that were actually sent to the treasury.
pub(crate) fn record_fee(env: &Env, fee: i128) {
    add_to_i128(env, &ControlKey::FeesCollected, fee);
}

/// Records a newly locked session for the analytics views.
pub(crate) fn record_locked(env: &Env, session_id: &Bytes32, amount: i128) {
    add_to_i128(env, &ControlKey::VolumeLocked, amount);
    let mut index: Vec<Bytes32> = env
        .storage()
        .persistent()
        .get(&ControlKey::SessionIndex)
        .unwrap_or(Vec::new(env));
    index.push_back(session_id.clone());
    env.storage().persistent().set(&ControlKey::SessionIndex, &index);
}

fn session_index(env: &Env) -> Vec<Bytes32> {
    env.storage()
        .persistent()
        .get(&ControlKey::SessionIndex)
        .unwrap_or(Vec::new(env))
}

fn is_open(status: SessionStatus) -> bool {
    status == SessionStatus::Locked || status == SessionStatus::Completed
}

#[contractimpl]
impl SkillssyncEscrow {
    // ---- #1637 emergency pause -------------------------------------------------

    /// Pauses every state-changing session function. View functions keep working.
    pub fn pause(env: Env) -> Result<(), ContractError> {
        require_admin(&env)?;
        env.storage().persistent().set(&ControlKey::Paused, &true);
        env.events().publish((Symbol::new(&env, "Paused"),), true);
        Ok(())
    }

    pub fn unpause(env: Env) -> Result<(), ContractError> {
        require_admin(&env)?;
        env.storage().persistent().set(&ControlKey::Paused, &false);
        env.events().publish((Symbol::new(&env, "Unpaused"),), false);
        Ok(())
    }

    pub fn is_paused(env: Env) -> bool {
        is_paused_flag(&env)
    }

    // ---- #1638 referrer fee split ----------------------------------------------

    /// Percentage (in bps, 0-1000) of the platform fee that goes to a session's referrer.
    pub fn set_referrer_fee_bps(env: Env, fee_bps: u32) -> Result<(), ContractError> {
        require_admin(&env)?;
        if fee_bps > MAX_REFERRER_FEE_BPS {
            panic_with_error!(&env, ControlError::InvalidReferrerFee);
        }
        env.storage()
            .persistent()
            .set(&ControlKey::ReferrerFeeBps, &fee_bps);
        env.events()
            .publish((Symbol::new(&env, "referrer_fee_updated"),), fee_bps);
        Ok(())
    }

    pub fn get_referrer_fee_bps(env: Env) -> u32 {
        referrer_fee_bps(&env)
    }

    /// Like `lock_funds`, and remembers a referrer that shares the platform fee.
    pub fn lock_funds_with_referrer(
        env: Env,
        session_id: Bytes32,
        buyer: Address,
        seller: Address,
        amount: i128,
        referrer: Address,
    ) -> Result<(), ContractError> {
        if referrer == buyer || referrer == seller {
            panic_with_error!(&env, ControlError::InvalidReferrer);
        }
        SkillssyncEscrow::lock_funds(env.clone(), session_id.clone(), buyer, seller, amount)?;
        env.storage()
            .persistent()
            .set(&ControlKey::Referrer(session_id), &referrer);
        Ok(())
    }

    pub fn get_referrer(env: Env, session_id: Bytes32) -> Option<Address> {
        env.storage()
            .persistent()
            .get(&ControlKey::Referrer(session_id))
    }

    pub fn referrer_balance(env: Env, referrer: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&ControlKey::ReferrerBalance(referrer))
            .unwrap_or(0)
    }

    /// Pays out everything the referrer has accrued.
    pub fn claim_referrer_fee(env: Env, referrer: Address) -> Result<i128, ContractError> {
        referrer.require_auth();
        when_not_paused(&env);
        let key = ControlKey::ReferrerBalance(referrer.clone());
        let amount: i128 = env.storage().persistent().get(&key).unwrap_or(0);
        if amount <= 0 {
            panic_with_error!(&env, ControlError::NothingToClaim);
        }
        let token_addr =
            read_payment_token(&env).ok_or(ContractError::PaymentTokenNotConfigured)?;
        // State first, transfer second.
        env.storage().persistent().set(&key, &0i128);
        token::Client::new(&env, &token_addr).transfer(
            &env.current_contract_address(),
            &referrer,
            &amount,
        );
        env.events()
            .publish((Symbol::new(&env, "ReferrerFeePaid"),), (referrer, amount));
        Ok(amount)
    }

    // ---- #1639 mutual deadline extension ---------------------------------------

    /// Either party proposes to push the session deadline back by `additional_ledgers`.
    pub fn propose_extension(
        env: Env,
        session_id: Bytes32,
        proposer: Address,
        additional_ledgers: u32,
    ) -> Result<(), ContractError> {
        proposer.require_auth();
        when_not_paused(&env);
        let session =
            load_session(&env, session_id.clone()).ok_or(ContractError::SessionNotFound)?;
        if !is_open(session.status) {
            panic_with_error!(&env, ControlError::SessionFinalized);
        }
        if proposer != session.buyer && proposer != session.seller {
            panic_with_error!(&env, ControlError::NotAParty);
        }
        if additional_ledgers == 0 || additional_ledgers > MAX_EXTENSION_LEDGERS {
            panic_with_error!(&env, ControlError::InvalidExtension);
        }
        env.storage().persistent().set(
            &ControlKey::ExtensionProposal(session_id.clone()),
            &ExtensionProposal {
                proposer: proposer.clone(),
                additional_ledgers,
            },
        );
        env.events().publish(
            (Symbol::new(&env, "ExtensionProposed"),),
            (session_id, proposer, additional_ledgers),
        );
        Ok(())
    }

    /// The other party accepts the pending proposal; the deadline moves by that many ledgers.
    pub fn accept_extension(
        env: Env,
        session_id: Bytes32,
        accepter: Address,
    ) -> Result<(), ContractError> {
        accepter.require_auth();
        when_not_paused(&env);
        let mut session =
            load_session(&env, session_id.clone()).ok_or(ContractError::SessionNotFound)?;
        if !is_open(session.status) {
            panic_with_error!(&env, ControlError::SessionFinalized);
        }
        let key = ControlKey::ExtensionProposal(session_id.clone());
        let proposal: ExtensionProposal = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, ControlError::NoExtensionProposal));
        let is_other_party = (accepter == session.buyer || accepter == session.seller)
            && accepter != proposal.proposer;
        if !is_other_party {
            panic_with_error!(&env, ControlError::NotAParty);
        }
        session.deadline = session
            .deadline
            .checked_add(proposal.additional_ledgers)
            .unwrap_or_else(|| panic_with_error!(&env, ControlError::DeadlineOverflow));
        save_session(&env, session_id.clone(), &session);
        env.storage().persistent().remove(&key);
        env.events().publish(
            (Symbol::new(&env, "ExtensionAccepted"),),
            (session_id, accepter, session.deadline),
        );
        Ok(())
    }

    pub fn get_extension_proposal(env: Env, session_id: Bytes32) -> Option<ExtensionProposal> {
        env.storage()
            .persistent()
            .get(&ControlKey::ExtensionProposal(session_id))
    }

    // ---- #1640 analytics views -------------------------------------------------

    /// Sum of every amount ever locked into a session.
    pub fn total_volume_locked(env: Env) -> i128 {
        env.storage()
            .persistent()
            .get(&ControlKey::VolumeLocked)
            .unwrap_or(0)
    }

    /// Platform fees that were actually sent to the treasury (after referrer shares).
    pub fn total_fees_collected(env: Env) -> i128 {
        env.storage()
            .persistent()
            .get(&ControlKey::FeesCollected)
            .unwrap_or(0)
    }

    /// Sessions currently `Locked` or `Completed`.
    pub fn active_sessions_count(env: Env) -> u32 {
        let mut count = 0u32;
        for id in session_index(&env).iter() {
            if let Some(session) = load_session(&env, id) {
                if is_open(session.status) {
                    count += 1;
                }
            }
        }
        count
    }

    /// `(sessions that were ever disputed, all sessions)`.
    pub fn dispute_rate(env: Env) -> (u32, u32) {
        let index = session_index(&env);
        let mut disputed = 0u32;
        for id in index.iter() {
            if let Some(session) = load_session(&env, id) {
                if session.dispute_opened_at > 0 {
                    disputed += 1;
                }
            }
        }
        (disputed, index.len())
    }

    /// Average time between a dispute being opened and resolved, in ledger-timestamp
    /// seconds (sessions record timestamps, not ledger numbers). 0 when none resolved.
    pub fn average_resolution_time(env: Env) -> u64 {
        let mut total = 0u64;
        let mut resolved = 0u64;
        for id in session_index(&env).iter() {
            if let Some(session) = load_session(&env, id) {
                if session.status == SessionStatus::Resolved
                    && session.dispute_resolved_at >= session.dispute_opened_at
                    && session.dispute_opened_at > 0
                {
                    total += session.dispute_resolved_at - session.dispute_opened_at;
                    resolved += 1;
                }
            }
        }
        if resolved == 0 {
            0
        } else {
            total / resolved
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::{Address as _, Ledger};

    struct Fixture {
        env: Env,
        client: SkillssyncEscrowClient<'static>,
        token: token::Client<'static>,
        buyer: Address,
        seller: Address,
        treasury: Address,
    }

    fn setup() -> Fixture {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(SkillssyncEscrow, ());
        let token_admin = Address::generate(&env);
        let token_addr = env.register_stellar_asset_contract_v2(token_admin).address();
        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        env.as_contract(&contract_id, || {
            env.storage().persistent().set(&DataKey::Admin, &admin);
            env.storage().persistent().set(&DataKey::Treasury, &treasury);
            env.storage()
                .persistent()
                .set(&DataKey::PaymentToken, &token_addr);
        });
        token::StellarAssetClient::new(&env, &token_addr).mint(&buyer, &1_000_000);
        let client = SkillssyncEscrowClient::new(&env, &contract_id);
        Fixture {
            token: token::Client::new(&env, &token_addr),
            client,
            env,
            buyer,
            seller,
            treasury,
        }
    }

    fn id(env: &Env, n: u8) -> Bytes32 {
        BytesN::from_array(env, &[n; 32])
    }

    #[test]
    fn pause_blocks_state_changes_but_not_views() {
        let f = setup();
        f.client.pause();
        assert!(f.client.is_paused());
        let result = f
            .client
            .try_lock_funds(&id(&f.env, 1), &f.buyer, &f.seller, &1_000);
        assert!(result.is_err());
        assert_eq!(f.client.get_platform_fee(), 100);
        assert_eq!(f.client.total_volume_locked(), 0);

        f.client.unpause();
        assert!(!f.client.is_paused());
        f.client.lock_funds(&id(&f.env, 1), &f.buyer, &f.seller, &1_000);
        assert!(f.client.get_session(&id(&f.env, 1)).is_some());
    }

    #[test]
    fn pause_also_blocks_settlement_functions() {
        let f = setup();
        f.client.lock_funds(&id(&f.env, 1), &f.buyer, &f.seller, &1_000);
        f.client.pause();
        assert!(f.client.try_complete_session(&id(&f.env, 1)).is_err());
        assert!(f.client.try_refund_session(&id(&f.env, 1)).is_err());
        assert!(f.client.try_open_dispute(&id(&f.env, 1), &String::from_str(&f.env, "x")).is_err());
    }

    #[test]
    fn referrer_receives_a_share_of_the_platform_fee() {
        let f = setup();
        let referrer = Address::generate(&f.env);
        f.client.set_referrer_fee_bps(&1_000); // 10% of the fee
        f.client
            .lock_funds_with_referrer(&id(&f.env, 1), &f.buyer, &f.seller, &10_000, &referrer);
        assert_eq!(f.client.get_referrer(&id(&f.env, 1)), Some(referrer.clone()));
        f.client.complete_session(&id(&f.env, 1));
        f.client.approve_session(&id(&f.env, 1));

        // 1% platform fee on 10_000 = 100; referrer gets 10, treasury 90.
        assert_eq!(f.token.balance(&f.seller), 9_900);
        assert_eq!(f.token.balance(&f.treasury), 90);
        assert_eq!(f.client.referrer_balance(&referrer), 10);
        assert_eq!(f.client.total_fees_collected(), 90);

        assert_eq!(f.client.claim_referrer_fee(&referrer), 10);
        assert_eq!(f.token.balance(&referrer), 10);
        assert_eq!(f.client.referrer_balance(&referrer), 0);
        assert!(f.client.try_claim_referrer_fee(&referrer).is_err());
    }

    #[test]
    fn referrer_fee_is_limited_to_1000_bps_and_self_referral_is_rejected() {
        let f = setup();
        assert!(f.client.try_set_referrer_fee_bps(&1_001).is_err());
        f.client.set_referrer_fee_bps(&0);
        assert_eq!(f.client.get_referrer_fee_bps(), 0);
        assert!(f
            .client
            .try_lock_funds_with_referrer(&id(&f.env, 1), &f.buyer, &f.seller, &1_000, &f.buyer)
            .is_err());
    }

    #[test]
    fn extension_needs_both_parties_and_respects_the_maximum() {
        let f = setup();
        f.client.lock_funds(&id(&f.env, 1), &f.buyer, &f.seller, &1_000);
        let start = f.client.get_session(&id(&f.env, 1)).unwrap().deadline;
        assert_eq!(start, f.env.ledger().sequence() + DEFAULT_SESSION_DEADLINE_LEDGERS);

        assert!(f.client.try_propose_extension(&id(&f.env, 1), &f.buyer, &10_001).is_err());
        assert!(f.client.try_propose_extension(&id(&f.env, 1), &f.buyer, &0).is_err());
        let stranger = Address::generate(&f.env);
        assert!(f.client.try_propose_extension(&id(&f.env, 1), &stranger, &100).is_err());

        f.client.propose_extension(&id(&f.env, 1), &f.buyer, &500);
        // The proposer cannot accept their own proposal; a stranger cannot either.
        assert!(f.client.try_accept_extension(&id(&f.env, 1), &f.buyer).is_err());
        assert!(f.client.try_accept_extension(&id(&f.env, 1), &stranger).is_err());
        f.client.accept_extension(&id(&f.env, 1), &f.seller);

        assert_eq!(f.client.get_session(&id(&f.env, 1)).unwrap().deadline, start + 500);
        assert!(f.client.get_extension_proposal(&id(&f.env, 1)).is_none());
        assert!(f.client.try_accept_extension(&id(&f.env, 1), &f.seller).is_err());
    }

    #[test]
    fn no_extension_once_the_session_is_final() {
        let f = setup();
        f.client.lock_funds(&id(&f.env, 1), &f.buyer, &f.seller, &1_000);
        f.client.refund_session(&id(&f.env, 1));
        assert!(f.client.try_propose_extension(&id(&f.env, 1), &f.buyer, &100).is_err());
    }

    #[test]
    fn analytics_views_reflect_activity() {
        let f = setup();
        assert_eq!(f.client.total_volume_locked(), 0);
        assert_eq!(f.client.dispute_rate(), (0, 0));
        assert_eq!(f.client.average_resolution_time(), 0);

        f.client.lock_funds(&id(&f.env, 1), &f.buyer, &f.seller, &10_000);
        f.client.lock_funds(&id(&f.env, 2), &f.buyer, &f.seller, &20_000);
        f.client.lock_funds(&id(&f.env, 3), &f.buyer, &f.seller, &30_000);
        assert_eq!(f.client.total_volume_locked(), 60_000);
        assert_eq!(f.client.active_sessions_count(), 3);

        f.client.complete_session(&id(&f.env, 1));
        f.client.approve_session(&id(&f.env, 1)); // fee 100
        assert_eq!(f.client.active_sessions_count(), 2);
        assert_eq!(f.client.total_fees_collected(), 100);

        f.env.ledger().with_mut(|li| li.timestamp = 1_000);
        f.client.open_dispute(&id(&f.env, 2), &String::from_str(&f.env, "late"));
        assert_eq!(f.client.dispute_rate(), (1, 3));
        assert_eq!(f.client.active_sessions_count(), 1);

        f.env.ledger().with_mut(|li| li.timestamp = 1_600);
        f.client.resolve_dispute(&id(&f.env, 2), &2, &10_000, &10_000);
        assert_eq!(f.client.average_resolution_time(), 600);
        assert_eq!(f.client.total_fees_collected(), 100 + 200);
    }
}
