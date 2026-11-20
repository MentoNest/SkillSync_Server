//! Reentrancy guard for payouts, milestone releases, counterparty ratings and dispute insurance.
//!
//! Own storage keys (`ExtraKey`) and error range 700-799; hooks in `lib.rs` are one-liners.

use super::*;
use soroban_sdk::{contracterror, contractimpl, contracttype, panic_with_error, Vec};

pub const MAX_MILESTONES: u32 = 10;
pub const MAX_COMMENT_LEN: u32 = 280;
pub const MAX_INSURANCE_PREMIUM_BPS: u32 = 2_000;
/// Buyers are covered when they receive less than this share (bps) of the session amount.
pub const DEFAULT_COVERAGE_BPS: u32 = 8_000;

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ExtraKey {
    ReentrancyLock,
    Milestones(Bytes32),
    ReleasedTotal(Bytes32),
    Rating(Bytes32, Address),
    RatingStats(Address),
    InsurancePremiumBps,
    InsuranceCoverageBps,
    InsurancePool,
    Policy(Bytes32),
    BuyerPayout(Bytes32),
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Milestone {
    pub bps: u32,
    pub description: String,
    pub amount: i128,
    pub released: bool,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RatingRecord {
    pub from: Address,
    pub to: Address,
    pub rating: u32,
    pub comment: String,
    pub ledger: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct InsurancePolicy {
    pub premium: i128,
    pub coverage_bps: u32,
    pub claimed: bool,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum SettlementError {
    ReentrancyDetected = 700,
    InvalidMilestones = 710,
    MilestoneAlreadyReleased = 711,
    InvalidMilestoneIndex = 712,
    DisputeInProgress = 713,
    NotMilestoneSession = 714,
    MilestoneSessionLocked = 715,
    PartiallyReleased = 716,
    InvalidRating = 720,
    NotAParty = 721,
    AlreadyRated = 722,
    SessionNotApproved = 723,
    CommentTooLong = 724,
    InsuranceNotConfigured = 730,
    InvalidPremium = 731,
    NoPolicy = 732,
    NotResolved = 733,
    NoShortfall = 734,
    AlreadyClaimed = 735,
    PoolEmpty = 736,
    InvalidConfig = 737,
}

// ---- #1645 reentrancy guard ----------------------------------------------------

/// Sets a storage flag on creation and clears it when dropped, so every exit path of a
/// payout function (including early `?` returns) releases it. A second guard while the
/// flag is set aborts with `ReentrancyDetected` (700).
pub struct ReentrancyGuard {
    env: Env,
}

impl ReentrancyGuard {
    pub fn new(env: &Env) -> Self {
        let locked: bool = env
            .storage()
            .temporary()
            .get(&ExtraKey::ReentrancyLock)
            .unwrap_or(false);
        if locked {
            panic_with_error!(env, SettlementError::ReentrancyDetected);
        }
        env.storage().temporary().set(&ExtraKey::ReentrancyLock, &true);
        ReentrancyGuard { env: env.clone() }
    }
}

impl Drop for ReentrancyGuard {
    fn drop(&mut self) {
        self.env.storage().temporary().remove(&ExtraKey::ReentrancyLock);
    }
}

/// Which payout a function is about to make.
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Payout {
    Approve,
    Refund,
    Resolve,
}

fn milestones_of(env: &Env, session_id: &Bytes32) -> Option<Vec<Milestone>> {
    env.storage()
        .persistent()
        .get(&ExtraKey::Milestones(session_id.clone()))
}

fn released_total(env: &Env, session_id: &Bytes32) -> i128 {
    env.storage()
        .persistent()
        .get(&ExtraKey::ReleasedTotal(session_id.clone()))
        .unwrap_or(0)
}

/// Called right before a payout transfer: enforces the milestone rules (a milestone
/// session is settled only through `release_milestone`; refunds and dispute
/// resolutions cannot run after a partial release) and takes the reentrancy guard.
pub(crate) fn before_payout(env: &Env, session_id: &Bytes32, kind: Payout) -> ReentrancyGuard {
    if milestones_of(env, session_id).is_some() {
        if kind == Payout::Approve {
            panic_with_error!(env, SettlementError::MilestoneSessionLocked);
        }
        if released_total(env, session_id) > 0 {
            panic_with_error!(env, SettlementError::PartiallyReleased);
        }
    }
    ReentrancyGuard::new(env)
}

// ---- #1648 insurance bookkeeping hook -------------------------------------------

/// Remembers what the buyer was paid by a dispute resolution (insured sessions only).
pub(crate) fn record_buyer_payout(env: &Env, session_id: &Bytes32, buyer_payout: i128) {
    if env
        .storage()
        .persistent()
        .has(&ExtraKey::Policy(session_id.clone()))
    {
        env.storage()
            .persistent()
            .set(&ExtraKey::BuyerPayout(session_id.clone()), &buyer_payout);
    }
}

fn bps_of(amount: i128, bps: u32) -> i128 {
    amount / 10_000 * bps as i128 + amount % 10_000 * bps as i128 / 10_000
}

fn pool_balance(env: &Env) -> i128 {
    env.storage()
        .persistent()
        .get(&ExtraKey::InsurancePool)
        .unwrap_or(0)
}

#[contractimpl]
impl SkillssyncEscrow {
    // ---- #1646 milestones -------------------------------------------------------

    /// Locks `total_amount` to be released in milestones. `milestones` are
    /// `(percentage_bps, description)` pairs that must add up to 10,000 bps.
    pub fn lock_funds_with_milestones(
        env: Env,
        session_id: Bytes32,
        buyer: Address,
        seller: Address,
        total_amount: i128,
        milestones: Vec<(u32, String)>,
    ) -> Result<(), ContractError> {
        let count = milestones.len();
        if count == 0 || count > MAX_MILESTONES {
            panic_with_error!(&env, SettlementError::InvalidMilestones);
        }
        let mut sum_bps = 0u32;
        let mut list: Vec<Milestone> = Vec::new(&env);
        for (bps, description) in milestones.iter() {
            if bps == 0 {
                panic_with_error!(&env, SettlementError::InvalidMilestones);
            }
            sum_bps += bps;
            list.push_back(Milestone {
                bps,
                description,
                amount: bps_of(total_amount, bps),
                released: false,
            });
        }
        if sum_bps != 10_000 {
            panic_with_error!(&env, SettlementError::InvalidMilestones);
        }
        SkillssyncEscrow::lock_funds(env.clone(), session_id.clone(), buyer, seller, total_amount)?;
        env.storage()
            .persistent()
            .set(&ExtraKey::Milestones(session_id), &list);
        Ok(())
    }

    /// The buyer releases one milestone to the seller (platform fee applies per milestone).
    /// The last milestone also carries the rounding remainder so the total adds up exactly.
    pub fn release_milestone(
        env: Env,
        session_id: Bytes32,
        milestone_index: u32,
    ) -> Result<i128, ContractError> {
        let mut session =
            load_session(&env, session_id.clone()).ok_or(ContractError::SessionNotFound)?;
        session.buyer.require_auth();
        if session.status == SessionStatus::Disputed {
            panic_with_error!(&env, SettlementError::DisputeInProgress);
        }
        if session.status != SessionStatus::Locked && session.status != SessionStatus::Completed {
            return Err(ContractError::InvalidSessionStatus);
        }
        let mut milestones = milestones_of(&env, &session_id)
            .unwrap_or_else(|| panic_with_error!(&env, SettlementError::NotMilestoneSession));
        let mut milestone = milestones
            .get(milestone_index)
            .unwrap_or_else(|| panic_with_error!(&env, SettlementError::InvalidMilestoneIndex));
        if milestone.released {
            panic_with_error!(&env, SettlementError::MilestoneAlreadyReleased);
        }
        let _guard = ReentrancyGuard::new(&env);

        let released = released_total(&env, &session_id);
        let unreleased = milestones.iter().filter(|m| !m.released).count();
        let amount = if unreleased == 1 {
            session.amount - released
        } else {
            milestone.amount
        };

        let token_addr =
            read_payment_token(&env).ok_or(ContractError::PaymentTokenNotConfigured)?;
        let token = token::Client::new(&env, &token_addr);
        let (payout, fee) = apply_fee(&env, amount);

        // Update state before moving funds.
        milestone.released = true;
        milestones.set(milestone_index, milestone);
        env.storage()
            .persistent()
            .set(&ExtraKey::Milestones(session_id.clone()), &milestones);
        env.storage()
            .persistent()
            .set(&ExtraKey::ReleasedTotal(session_id.clone()), &(released + amount));
        if unreleased == 1 {
            session.status = SessionStatus::Approved;
            save_session(&env, session_id.clone(), &session);
        }

        token.transfer(&env.current_contract_address(), &session.seller, &payout);
        transfer_treasury_fee(&env, &token, fee)?;
        env.events().publish(
            (Symbol::new(&env, "MilestoneReleased"),),
            (session_id, milestone_index, amount),
        );
        Ok(amount)
    }

    pub fn get_milestones(env: Env, session_id: Bytes32) -> Option<Vec<Milestone>> {
        milestones_of(&env, &session_id)
    }

    pub fn get_released_total(env: Env, session_id: Bytes32) -> i128 {
        released_total(&env, &session_id)
    }

    // ---- #1647 ratings ----------------------------------------------------------

    /// After a session is approved, each party can rate the other once (1-5 stars).
    pub fn rate_counterparty(
        env: Env,
        session_id: Bytes32,
        rater: Address,
        rating: u32,
        comment: String,
    ) -> Result<(), ContractError> {
        rater.require_auth();
        let session =
            load_session(&env, session_id.clone()).ok_or(ContractError::SessionNotFound)?;
        if session.status != SessionStatus::Approved {
            panic_with_error!(&env, SettlementError::SessionNotApproved);
        }
        let target = if rater == session.buyer {
            session.seller.clone()
        } else if rater == session.seller {
            session.buyer.clone()
        } else {
            panic_with_error!(&env, SettlementError::NotAParty)
        };
        if !(1..=5).contains(&rating) {
            panic_with_error!(&env, SettlementError::InvalidRating);
        }
        if comment.len() > MAX_COMMENT_LEN {
            panic_with_error!(&env, SettlementError::CommentTooLong);
        }
        let key = ExtraKey::Rating(session_id.clone(), rater.clone());
        if env.storage().persistent().has(&key) {
            panic_with_error!(&env, SettlementError::AlreadyRated);
        }
        env.storage().persistent().set(
            &key,
            &RatingRecord {
                from: rater.clone(),
                to: target.clone(),
                rating,
                comment,
                ledger: env.ledger().sequence(),
            },
        );
        let stats_key = ExtraKey::RatingStats(target.clone());
        let (sum, total): (u64, u32) = env.storage().persistent().get(&stats_key).unwrap_or((0, 0));
        env.storage()
            .persistent()
            .set(&stats_key, &(sum + rating as u64, total + 1));
        env.events().publish(
            (Symbol::new(&env, "RatingSubmitted"),),
            (session_id, rater, target, rating),
        );
        Ok(())
    }

    /// `(average rating x 100, number of ratings)`; e.g. `(450, 2)` is 4.5 stars from 2 ratings.
    pub fn get_user_rating(env: Env, user: Address) -> (u32, u32) {
        let (sum, total): (u64, u32) = env
            .storage()
            .persistent()
            .get(&ExtraKey::RatingStats(user))
            .unwrap_or((0, 0));
        if total == 0 {
            (0, 0)
        } else {
            ((sum * 100 / total as u64) as u32, total)
        }
    }

    pub fn get_rating(env: Env, session_id: Bytes32, rater: Address) -> Option<RatingRecord> {
        env.storage()
            .persistent()
            .get(&ExtraKey::Rating(session_id, rater))
    }

    // ---- #1648 insurance --------------------------------------------------------

    /// Admin sets the premium rate (bps of the amount, max 2000) and the coverage
    /// threshold (bps of the amount; the buyer is covered when paid less than this).
    pub fn set_insurance_config(
        env: Env,
        premium_bps: u32,
        coverage_bps: u32,
    ) -> Result<(), ContractError> {
        require_admin(&env)?;
        if premium_bps > MAX_INSURANCE_PREMIUM_BPS || coverage_bps == 0 || coverage_bps > 10_000 {
            panic_with_error!(&env, SettlementError::InvalidConfig);
        }
        env.storage().persistent().set(&ExtraKey::InsurancePremiumBps, &premium_bps);
        env.storage().persistent().set(&ExtraKey::InsuranceCoverageBps, &coverage_bps);
        Ok(())
    }

    pub fn insurance_pool_balance(env: Env) -> i128 {
        pool_balance(&env)
    }

    /// Locks funds and also takes the insurance premium, which goes to the pool the
    /// contract holds. `premium_bps` must equal the admin-configured rate.
    pub fn lock_funds_with_insurance(
        env: Env,
        session_id: Bytes32,
        buyer: Address,
        seller: Address,
        amount: i128,
        premium_bps: u32,
    ) -> Result<(), ContractError> {
        let configured: u32 = env
            .storage()
            .persistent()
            .get(&ExtraKey::InsurancePremiumBps)
            .unwrap_or(0);
        if configured == 0 {
            panic_with_error!(&env, SettlementError::InsuranceNotConfigured);
        }
        if premium_bps != configured {
            panic_with_error!(&env, SettlementError::InvalidPremium);
        }
        let premium = bps_of(amount, premium_bps);
        if premium <= 0 {
            panic_with_error!(&env, SettlementError::InvalidPremium);
        }
        let coverage_bps: u32 = env
            .storage()
            .persistent()
            .get(&ExtraKey::InsuranceCoverageBps)
            .unwrap_or(DEFAULT_COVERAGE_BPS);
        SkillssyncEscrow::lock_funds(
            env.clone(),
            session_id.clone(),
            buyer.clone(),
            seller,
            amount,
        )?;
        let token_addr =
            read_payment_token(&env).ok_or(ContractError::PaymentTokenNotConfigured)?;
        token::Client::new(&env, &token_addr).transfer(
            &buyer,
            &env.current_contract_address(),
            &premium,
        );
        env.storage()
            .persistent()
            .set(&ExtraKey::InsurancePool, &(pool_balance(&env) + premium));
        env.storage().persistent().set(
            &ExtraKey::Policy(session_id.clone()),
            &InsurancePolicy {
                premium,
                coverage_bps,
                claimed: false,
            },
        );
        env.events().publish(
            (Symbol::new(&env, "InsurancePurchased"),),
            (session_id, buyer, premium),
        );
        Ok(())
    }

    pub fn get_insurance_policy(env: Env, session_id: Bytes32) -> Option<InsurancePolicy> {
        env.storage().persistent().get(&ExtraKey::Policy(session_id))
    }

    /// After a dispute resolution paid the buyer less than the covered share of the
    /// amount, the pool pays the shortfall (up to 100% of the amount, limited by the pool).
    pub fn claim_insurance(
        env: Env,
        session_id: Bytes32,
        buyer: Address,
    ) -> Result<i128, ContractError> {
        buyer.require_auth();
        let session =
            load_session(&env, session_id.clone()).ok_or(ContractError::SessionNotFound)?;
        if session.buyer != buyer {
            panic_with_error!(&env, SettlementError::NotAParty);
        }
        let policy_key = ExtraKey::Policy(session_id.clone());
        let mut policy: InsurancePolicy = env
            .storage()
            .persistent()
            .get(&policy_key)
            .unwrap_or_else(|| panic_with_error!(&env, SettlementError::NoPolicy));
        if policy.claimed {
            panic_with_error!(&env, SettlementError::AlreadyClaimed);
        }
        if session.status != SessionStatus::Resolved {
            panic_with_error!(&env, SettlementError::NotResolved);
        }
        let paid: i128 = env
            .storage()
            .persistent()
            .get(&ExtraKey::BuyerPayout(session_id.clone()))
            .unwrap_or(0);
        let threshold = bps_of(session.amount, policy.coverage_bps);
        if paid >= threshold {
            panic_with_error!(&env, SettlementError::NoShortfall);
        }
        let pool = pool_balance(&env);
        if pool <= 0 {
            panic_with_error!(&env, SettlementError::PoolEmpty);
        }
        let shortfall = session.amount - paid;
        let pay = if shortfall > pool { pool } else { shortfall };

        let _guard = ReentrancyGuard::new(&env);
        policy.claimed = true;
        env.storage().persistent().set(&policy_key, &policy);
        env.storage().persistent().set(&ExtraKey::InsurancePool, &(pool - pay));
        let token_addr =
            read_payment_token(&env).ok_or(ContractError::PaymentTokenNotConfigured)?;
        token::Client::new(&env, &token_addr).transfer(
            &env.current_contract_address(),
            &buyer,
            &pay,
        );
        env.events().publish(
            (Symbol::new(&env, "InsuranceClaimPaid"),),
            (session_id, buyer, pay),
        );
        Ok(pay)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::vec;

    struct Fixture {
        env: Env,
        contract_id: Address,
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
        let token_addr = env
            .register_stellar_asset_contract_v2(Address::generate(&env))
            .address();
        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        env.as_contract(&contract_id, || {
            env.storage().persistent().set(&DataKey::Admin, &admin);
            env.storage().persistent().set(&DataKey::Treasury, &treasury);
            env.storage().persistent().set(&DataKey::PaymentToken, &token_addr);
        });
        token::StellarAssetClient::new(&env, &token_addr).mint(&buyer, &1_000_000);
        Fixture {
            client: SkillssyncEscrowClient::new(&env, &contract_id),
            token: token::Client::new(&env, &token_addr),
            env,
            contract_id,
            buyer,
            seller,
            treasury,
        }
    }

    fn id(env: &Env, n: u8) -> Bytes32 {
        BytesN::from_array(env, &[n; 32])
    }

    fn text(env: &Env, s: &str) -> String {
        String::from_str(env, s)
    }

    // ---- reentrancy ---------------------------------------------------------------

    #[test]
    #[should_panic(expected = "Error(Contract, #700)")]
    fn second_guard_while_locked_aborts_with_700() {
        let f = setup();
        f.env.as_contract(&f.contract_id, || {
            let _outer = ReentrancyGuard::new(&f.env);
            let _inner = ReentrancyGuard::new(&f.env);
        });
    }

    #[test]
    fn guard_is_released_when_dropped() {
        let f = setup();
        f.env.as_contract(&f.contract_id, || {
            drop(ReentrancyGuard::new(&f.env));
            drop(ReentrancyGuard::new(&f.env));
        });
    }

    #[test]
    fn payout_functions_still_work_and_release_the_guard() {
        let f = setup();
        f.client.lock_funds(&id(&f.env, 1), &f.buyer, &f.seller, &10_000);
        f.client.complete_session(&id(&f.env, 1));
        f.client.approve_session(&id(&f.env, 1));
        f.client.lock_funds(&id(&f.env, 2), &f.buyer, &f.seller, &10_000);
        f.client.refund_session(&id(&f.env, 2));
        assert_eq!(f.token.balance(&f.seller), 9_900);
    }

    mod malicious {
        use super::*;

        #[contract]
        pub struct MaliciousToken;

        #[contractimpl]
        impl MaliciousToken {
            pub fn arm(env: Env, escrow: Address, session_id: Bytes32) {
                env.storage().instance().set(&Symbol::new(&env, "escrow"), &escrow);
                env.storage().instance().set(&Symbol::new(&env, "session"), &session_id);
            }

            /// Looks like a token transfer, but calls back into the escrow when armed.
            pub fn transfer(env: Env, _from: Address, _to: Address, _amount: i128) {
                let escrow: Option<Address> = env.storage().instance().get(&Symbol::new(&env, "escrow"));
                let session: Option<Bytes32> = env.storage().instance().get(&Symbol::new(&env, "session"));
                if let (Some(escrow), Some(session)) = (escrow, session) {
                    SkillssyncEscrowClient::new(&env, &escrow).approve_session(&session);
                }
            }
        }
    }

    #[test]
    fn reentering_through_a_malicious_token_reverts() {
        let f = setup();
        let evil = f.env.register(malicious::MaliciousToken, ());
        f.env.as_contract(&f.contract_id, || {
            f.env.storage().persistent().set(&DataKey::PaymentToken, &evil);
        });
        f.client.lock_funds(&id(&f.env, 1), &f.buyer, &f.seller, &10_000);
        f.client.complete_session(&id(&f.env, 1));
        malicious::MaliciousTokenClient::new(&f.env, &evil).arm(&f.contract_id, &id(&f.env, 1));

        // The nested approve_session is refused (by this guard and by the host's own
        // re-entry rule), so the whole outer call reverts and the session stays Completed.
        assert!(f.client.try_approve_session(&id(&f.env, 1)).is_err());
        assert_eq!(
            f.client.get_session(&id(&f.env, 1)).unwrap().status,
            SessionStatus::Completed
        );
    }

    // ---- milestones ---------------------------------------------------------------

    fn three_milestones(env: &Env) -> Vec<(u32, String)> {
        vec![
            env,
            (3_000u32, text(env, "upfront")),
            (4_000u32, text(env, "delivery")),
            (3_000u32, text(env, "acceptance")),
        ]
    }

    #[test]
    fn milestones_release_in_parts_and_complete_the_session() {
        let f = setup();
        f.client.lock_funds_with_milestones(
            &id(&f.env, 1),
            &f.buyer,
            &f.seller,
            &10_000,
            &three_milestones(&f.env),
        );
        let list = f.client.get_milestones(&id(&f.env, 1)).unwrap();
        assert_eq!(list.get(1).unwrap().amount, 4_000);

        assert_eq!(f.client.release_milestone(&id(&f.env, 1), &0), 3_000);
        assert_eq!(f.token.balance(&f.seller), 2_970); // 1% fee on 3_000
        assert_eq!(f.client.get_released_total(&id(&f.env, 1)), 3_000);
        assert!(f.client.try_release_milestone(&id(&f.env, 1), &0).is_err());

        assert_eq!(f.client.release_milestone(&id(&f.env, 1), &1), 4_000);
        assert_eq!(f.client.get_session(&id(&f.env, 1)).unwrap().status, SessionStatus::Locked);
        assert_eq!(f.client.release_milestone(&id(&f.env, 1), &2), 3_000);

        assert_eq!(f.client.get_session(&id(&f.env, 1)).unwrap().status, SessionStatus::Approved);
        assert_eq!(f.token.balance(&f.seller), 9_900);
        assert_eq!(f.token.balance(&f.treasury), 100);
        assert_eq!(f.token.balance(&f.contract_id), 0);
    }

    #[test]
    fn last_milestone_carries_the_rounding_remainder() {
        let f = setup();
        let parts = vec![&f.env, (3_333u32, text(&f.env, "a")), (3_333u32, text(&f.env, "b")), (3_334u32, text(&f.env, "c"))];
        f.client.lock_funds_with_milestones(&id(&f.env, 1), &f.buyer, &f.seller, &1_001, &parts);
        let first = f.client.release_milestone(&id(&f.env, 1), &0);
        let second = f.client.release_milestone(&id(&f.env, 1), &1);
        let last = f.client.release_milestone(&id(&f.env, 1), &2);
        assert_eq!(first + second + last, 1_001);
    }

    #[test]
    fn invalid_milestone_sets_are_rejected() {
        let f = setup();
        let short = vec![&f.env, (5_000u32, text(&f.env, "a")), (4_999u32, text(&f.env, "b"))];
        let zero = vec![&f.env, (0u32, text(&f.env, "a")), (10_000u32, text(&f.env, "b"))];
        let empty: Vec<(u32, String)> = Vec::new(&f.env);
        for list in [short, zero, empty] {
            assert!(f
                .client
                .try_lock_funds_with_milestones(&id(&f.env, 1), &f.buyer, &f.seller, &10_000, &list)
                .is_err());
        }
    }

    #[test]
    fn milestone_sessions_cannot_be_approved_normally_and_a_dispute_pauses_releases() {
        let f = setup();
        f.client.lock_funds_with_milestones(&id(&f.env, 1), &f.buyer, &f.seller, &10_000, &three_milestones(&f.env));
        f.client.complete_session(&id(&f.env, 1));
        assert!(f.client.try_approve_session(&id(&f.env, 1)).is_err());

        f.client.release_milestone(&id(&f.env, 1), &0);
        f.client.open_dispute(&id(&f.env, 1), &text(&f.env, "late"));
        assert!(f.client.try_release_milestone(&id(&f.env, 1), &1).is_err());
        // Settling a partially released session through the normal dispute path is refused.
        assert!(f.client.try_resolve_dispute(&id(&f.env, 1), &2, &3_500, &3_500).is_err());
    }

    #[test]
    fn ordinary_sessions_cannot_release_milestones() {
        let f = setup();
        f.client.lock_funds(&id(&f.env, 1), &f.buyer, &f.seller, &10_000);
        assert!(f.client.try_release_milestone(&id(&f.env, 1), &0).is_err());
    }

    // ---- ratings ------------------------------------------------------------------

    fn approved_session(f: &Fixture, n: u8) {
        f.client.lock_funds(&id(&f.env, n), &f.buyer, &f.seller, &10_000);
        f.client.complete_session(&id(&f.env, n));
        f.client.approve_session(&id(&f.env, n));
    }

    #[test]
    fn both_parties_can_rate_once_after_approval() {
        let f = setup();
        approved_session(&f, 1);
        f.client.rate_counterparty(&id(&f.env, 1), &f.buyer, &5, &text(&f.env, "great"));
        f.client.rate_counterparty(&id(&f.env, 1), &f.seller, &4, &text(&f.env, "paid on time"));

        assert_eq!(f.client.get_user_rating(&f.seller), (500, 1));
        assert_eq!(f.client.get_user_rating(&f.buyer), (400, 1));
        assert_eq!(f.client.get_rating(&id(&f.env, 1), &f.buyer).unwrap().to, f.seller);
        // The session itself is untouched.
        assert_eq!(f.client.get_session(&id(&f.env, 1)).unwrap().status, SessionStatus::Approved);

        assert!(f.client.try_rate_counterparty(&id(&f.env, 1), &f.buyer, &1, &text(&f.env, "again")).is_err());
    }

    #[test]
    fn ratings_average_across_sessions() {
        let f = setup();
        approved_session(&f, 1);
        approved_session(&f, 2);
        f.client.rate_counterparty(&id(&f.env, 1), &f.buyer, &5, &text(&f.env, ""));
        f.client.rate_counterparty(&id(&f.env, 2), &f.buyer, &4, &text(&f.env, ""));
        assert_eq!(f.client.get_user_rating(&f.seller), (450, 2));
        assert_eq!(f.client.get_user_rating(&Address::generate(&f.env)), (0, 0));
    }

    #[test]
    fn rating_validation() {
        let f = setup();
        f.client.lock_funds(&id(&f.env, 1), &f.buyer, &f.seller, &10_000);
        // Not approved yet.
        assert!(f.client.try_rate_counterparty(&id(&f.env, 1), &f.buyer, &5, &text(&f.env, "x")).is_err());
        f.client.complete_session(&id(&f.env, 1));
        f.client.approve_session(&id(&f.env, 1));

        for bad in [0u32, 6, 100] {
            assert!(f.client.try_rate_counterparty(&id(&f.env, 1), &f.buyer, &bad, &text(&f.env, "x")).is_err());
        }
        let stranger = Address::generate(&f.env);
        assert!(f.client.try_rate_counterparty(&id(&f.env, 1), &stranger, &5, &text(&f.env, "x")).is_err());
        let long = String::from_bytes(&f.env, &[b'x'; 281]);
        assert!(f.client.try_rate_counterparty(&id(&f.env, 1), &f.buyer, &5, &long).is_err());
    }

    // ---- insurance ----------------------------------------------------------------

    #[test]
    fn insured_buyer_is_covered_when_a_dispute_pays_less_than_80_percent() {
        let f = setup();
        f.client.set_insurance_config(&2_000, &8_000);
        // Two insured sessions fund the pool: 2 x 2_000 premium.
        f.client.lock_funds_with_insurance(&id(&f.env, 1), &f.buyer, &f.seller, &10_000, &2_000);
        f.client.lock_funds_with_insurance(&id(&f.env, 2), &f.buyer, &f.seller, &10_000, &2_000);
        assert_eq!(f.client.insurance_pool_balance(), 4_000);
        assert_eq!(f.token.balance(&f.buyer), 1_000_000 - 2 * 12_000);

        f.client.open_dispute(&id(&f.env, 1), &text(&f.env, "bad work"));
        f.client.resolve_dispute(&id(&f.env, 1), &2, &7_000, &3_000);
        // Buyer received 7_000 * 9_900 / 10_000 = 6_930 < 80% of 10_000, so 3_070 is covered.
        let before = f.token.balance(&f.buyer);
        assert_eq!(f.client.claim_insurance(&id(&f.env, 1), &f.buyer), 3_070);
        assert_eq!(f.token.balance(&f.buyer), before + 3_070);
        assert_eq!(f.client.insurance_pool_balance(), 930);
        assert!(f.client.get_insurance_policy(&id(&f.env, 1)).unwrap().claimed);
        assert!(f.client.try_claim_insurance(&id(&f.env, 1), &f.buyer).is_err());
    }

    #[test]
    fn claims_are_limited_by_the_pool_and_need_a_real_shortfall() {
        let f = setup();
        f.client.set_insurance_config(&500, &8_000);
        f.client.lock_funds_with_insurance(&id(&f.env, 1), &f.buyer, &f.seller, &10_000, &500);
        f.client.open_dispute(&id(&f.env, 1), &text(&f.env, "x"));
        f.client.resolve_dispute(&id(&f.env, 1), &1, &0, &10_000);
        assert_eq!(f.client.claim_insurance(&id(&f.env, 1), &f.buyer), 500); // pool only had 500

        f.client.lock_funds_with_insurance(&id(&f.env, 2), &f.buyer, &f.seller, &10_000, &500);
        f.client.open_dispute(&id(&f.env, 2), &text(&f.env, "x"));
        f.client.resolve_dispute(&id(&f.env, 2), &2, &9_000, &1_000);
        // 9_000 * 99% = 8_910 >= 80%: no shortfall to cover.
        assert!(f.client.try_claim_insurance(&id(&f.env, 2), &f.buyer).is_err());
    }

    #[test]
    fn insurance_requires_configuration_the_exact_rate_and_a_resolved_dispute() {
        let f = setup();
        assert!(f.client.try_lock_funds_with_insurance(&id(&f.env, 1), &f.buyer, &f.seller, &10_000, &500).is_err());
        f.client.set_insurance_config(&500, &8_000);
        assert!(f.client.try_lock_funds_with_insurance(&id(&f.env, 1), &f.buyer, &f.seller, &10_000, &400).is_err());
        assert!(f.client.try_set_insurance_config(&2_001, &8_000).is_err());
        f.client.lock_funds_with_insurance(&id(&f.env, 1), &f.buyer, &f.seller, &10_000, &500);
        // Not resolved yet, and uninsured sessions have no policy.
        assert!(f.client.try_claim_insurance(&id(&f.env, 1), &f.buyer).is_err());
        f.client.lock_funds(&id(&f.env, 2), &f.buyer, &f.seller, &10_000);
        assert!(f.client.try_claim_insurance(&id(&f.env, 2), &f.buyer).is_err());
    }
}
