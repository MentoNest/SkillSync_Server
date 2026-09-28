use soroban_sdk::{contracttype, symbol_short, Address, BytesN, Env};

use crate::admin::require_admin;
use crate::errors::ContractError;

/// Price oracle integration.
///
/// The contract never trusts a price it has not checked. A price is usable
/// only if it is both (a) successfully read from the configured oracle and
/// (b) recent enough to still describe the world. Anything else falls back to
/// an admin-published price for that asset, which is slower but explicit: a
/// human decided it, and the event trail says so. If neither source has a
/// usable price the call fails with `PriceUnavailable` rather than quoting a
/// stale or fabricated number.
///
/// The oracle is called over a plain, versionless ABI — `get_price(asset) ->
/// (price, timestamp)` — so any Soroban contract exposing that shape can be
/// plugged in without a trait object or an interface crate.

/// How stale, in ledgers, a price may be before the contract stops trusting
/// it.
///
/// Roughly 50 minutes on Stellar's ~5s ledger. Chosen to be long enough that
/// a briefly lagging feed does not fail every quote, and short enough that a
/// dead feed is noticed within the hour.
const MAX_PRICE_AGE_LEDGERS: u64 = 100;

/// Storage keys owned by this module.
#[contracttype]
#[derive(Clone)]
pub enum OracleKey {
    /// The oracle contract to read prices from.
    Oracle,
    /// An admin-published fallback price for one asset.
    AdminPrice(BytesN<32>),
}

/// An admin-published fallback price and when it was published.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct AdminPrice {
    /// Price of one whole unit of the asset, quoted in the settlement asset.
    pub price: i128,
    /// Ledger sequence at which this price was published.
    pub published_at: u64,
}

/// Point the contract at an oracle contract (admin only).
///
/// The address is not validated beyond being a well-formed contract address:
/// the contract cannot know whether a given contract actually implements a
/// useful `get_price`, and a bad address simply means every read falls back
/// to the admin price, which is visible in the events.
///
/// # Errors
/// - [`ContractError::NotInitialized`] if the contract is not initialized.
/// - [`ContractError::NotAdmin`] if `caller` is not the admin.
///
/// # Events
/// Emits `OracleSet` with the new oracle address.
pub fn set_oracle(env: &Env, caller: Address, oracle_id: Address) -> Result<(), ContractError> {
    require_admin(env, &caller)?;

    env.storage().instance().set(&OracleKey::Oracle, &oracle_id);
    env.events()
        .publish((symbol_short!("oracle"),), oracle_id);

    Ok(())
}

/// Stop reading prices from an oracle (admin only).
///
/// # Errors
/// - [`ContractError::NotInitialized`] if the contract is not initialized.
/// - [`ContractError::NotAdmin`] if `caller` is not the admin.
///
/// # Events
/// Emits `OracleCleared`.
pub fn clear_oracle(env: &Env, caller: Address) -> Result<(), ContractError> {
    require_admin(env, &caller)?;

    env.storage().instance().remove(&OracleKey::Oracle);
    env.events().publish((symbol_short!("ora_clr"),), ());

    Ok(())
}

/// The configured oracle, if any.
pub fn get_oracle(env: &Env) -> Option<Address> {
    env.storage().instance().get(&OracleKey::Oracle)
}

/// Publish an admin fallback price for `asset` (admin only).
///
/// This is the price used whenever the oracle cannot be read or returns
/// something too old to trust. Publishing is not a no-op: it replaces the
/// previous fallback and emits an event, so the freshness of the fallback is
/// as auditable as the oracle's.
///
/// # Errors
/// - [`ContractError::NotInitialized`] if the contract is not initialized.
/// - [`ContractError::NotAdmin`] if `caller` is not the admin.
/// - [`ContractError::InvalidAmount`] if `price` is not positive.
///
/// # Events
/// Emits `OraclePriceSet` with the asset and price.
pub fn set_admin_price(
    env: &Env,
    caller: Address,
    asset: BytesN<32>,
    price: i128,
) -> Result<(), ContractError> {
    require_admin(env, &caller)?;

    if price <= 0 {
        return Err(ContractError::InvalidAmount);
    }

    let entry = AdminPrice {
        price,
        published_at: env.ledger().sequence(),
    };
    env.storage().instance().set(&OracleKey::AdminPrice(asset.clone()), &entry);

    env.events()
        .publish((symbol_short!("ora_price"), asset), price);

    Ok(())
}

/// Remove the admin fallback price for `asset` (admin only).
///
/// # Errors
/// - [`ContractError::NotInitialized`] if the contract is not initialized.
/// - [`ContractError::NotAdmin`] if `caller` is not the admin.
///
/// # Events
/// Emits `OraclePriceCleared` for `asset`.
pub fn clear_admin_price(
    env: &Env,
    caller: Address,
    asset: BytesN<32>,
) -> Result<(), ContractError> {
    require_admin(env, &caller)?;

    env.storage()
        .instance()
        .remove(&OracleKey::AdminPrice(asset.clone()));
    env.events()
        .publish((symbol_short!("ora_pclr"), asset), ());

    Ok(())
}

/// The admin fallback price for `asset`, if one is published.
pub fn get_admin_price(env: &Env, asset: BytesN<32>) -> Option<AdminPrice> {
    env.storage()
        .instance()
        .get(&OracleKey::AdminPrice(asset))
}

/// Whether a price stamped at `stamped_at` is still within the freshness
/// window as of `now`.
///
/// `saturating_sub` rather than `-`: a price stamped in the future (a feed
/// running ahead of this contract's view of the ledger) must read as
/// "brand new", not as a subtraction that wrapped to an enormous number and
/// got rejected.
fn is_fresh(now: u64, stamped_at: u64) -> bool {
    now.saturating_sub(stamped_at) <= MAX_PRICE_AGE_LEDGERS
}

/// The price of one whole unit of `asset`.
///
/// Tries, in order:
/// 1. the configured oracle, if one is set and returns a fresh price;
/// 2. the admin-published fallback for `asset`.
///
/// # Errors
/// [`ContractError::PriceUnavailable`] when neither source yields a usable
/// price. This is deliberately the *only* failure mode: a misconfigured or
/// lagging oracle degrades to the admin price rather than breaking every
/// escrow that touches a fiat-denominated asset.
pub fn get_price(env: &Env, asset: BytesN<32>) -> Result<i128, ContractError> {
    if let Some(oracle) = get_oracle(env) {
        if let Some(price) = read_oracle_price(env, &oracle, &asset) {
            if is_fresh(env.ledger().sequence(), price.1) {
                return Ok(price.0);
            }
        }
    }

    get_admin_price(env, asset)
        .map(|entry| entry.price)
        .ok_or(ContractError::PriceUnavailable)
}

/// Read `(price, timestamp)` from the oracle, or `None` if the call failed or
/// returned something this contract cannot interpret.
///
/// Every failure mode collapses to `None` on purpose: an oracle that reverts,
/// one that returns a differently-shaped tuple, and one that is simply not
/// deployed yet are all the same problem from the escrow's point of view -
/// "no usable oracle price right now" - and the caller falls back the same
/// way in each case.
fn read_oracle_price(env: &Env, oracle: &Address, asset: &BytesN<32>) -> Option<(i128, u64)> {
    env.try_invoke_contract::<(i128, u64), _>(oracle, &symbol_short!("get_price"), asset)
        .ok()
}

/// Convert `base_amount` of the settlement asset into `asset` units at the
/// current price.
///
/// # Errors
/// Propagates whatever [`get_price`] returns, plus
/// [`ContractError::InvalidAmount`] for a non-positive amount and
/// [`ContractError::Overflow`] if the multiplication overflows.
pub fn quote(
    env: &Env,
    asset: BytesN<32>,
    base_amount: i128,
) -> Result<i128, ContractError> {
    if base_amount <= 0 {
        return Err(ContractError::InvalidAmount);
    }

    let price = get_price(env, asset)?;
    if price <= 0 {
        return Err(ContractError::InvalidAmount);
    }

    base_amount
        .checked_mul(SCALE)
        .and_then(|scaled| scaled.checked_div(price))
        .ok_or(ContractError::Overflow)
}

/// Fixed-point scale for quotes. Prices are integers, so this is the number
/// of decimal places a price is quoted to.
const SCALE: i128 = 1_000_000;

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{SkillSyncContract, SkillSyncContractClient};
    use soroban_sdk::testutils::{Address as _, Ledger};
    use soroban_sdk::{contract, contractimpl, contracterror, contracttype};

    /// Why a mock oracle would not answer, so the fallback path can be
    /// exercised without a network.
    #[contracterror]
    #[derive(Copy, Clone, Debug, Eq, PartialEq)]
    #[repr(u32)]
    pub enum MockOracleError {
        /// The feed is down.
        Unavailable = 1,
    }

    /// Storage for [`MockOracle`].
    #[contracttype]
    #[derive(Clone)]
    pub enum MockKey {
        /// 0 = healthy, 1 = stale price, 2 = reverts.
        Mode,
        /// The price the mock reports.
        Price,
        /// The ledger stamp the mock attaches to that price.
        Stamp,
    }

    /// A stand-in for a real price feed, registered only in tests.
    #[contract]
    pub struct MockOracle;

    #[contractimpl]
    impl MockOracle {
        /// Configure the mock from outside the contract.
        pub fn setup(env: Env, mode: u32, price: i128, stamp: u64) {
            env.storage().instance().set(&MockKey::Mode, &mode);
            env.storage().instance().set(&MockKey::Price, &price);
            env.storage().instance().set(&MockKey::Stamp, &stamp);
        }

        /// The versionless oracle ABI this contract reads.
        pub fn get_price(env: Env, _asset: BytesN<32>) -> Result<(i128, u64), MockOracleError> {
            let mode: u32 = env.storage().instance().get(&MockKey::Mode).unwrap_or(0);
            if mode == 2 {
                return Err(MockOracleError::Unavailable);
            }
            let price: i128 = env.storage().instance().get(&MockKey::Price).unwrap_or(0);
            let stamp: u64 = env.storage().instance().get(&MockKey::Stamp).unwrap_or(0);
            Ok((price, stamp))
        }
    }

    const HEALTHY: u32 = 0;
    const STALE: u32 = 1;
    const REVERTS: u32 = 2;

    struct Harness {
        env: Env,
        admin: Address,
        asset: BytesN<32>,
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
            let asset = BytesN::from_array(&env, &[0xAAu8; 32]);
            Harness {
                env,
                admin,
                asset,
                client,
            }
        }

        /// Deploy a mock oracle in the given mode and point the contract at it.
        fn with_oracle(&self, mode: u32, price: i128, stamp: u64) {
            let oracle_id = self.env.register(MockOracle, ());
            let env = self.env.clone();
            self.env
                .as_contract(&oracle_id, || MockOracle::setup(env, mode, price, stamp));
            self.client.set_oracle(&self.admin, &oracle_id).unwrap();
        }

        /// Publish an admin fallback price.
        fn with_admin_price(&self, price: i128) {
            self.client
                .set_admin_price(&self.admin, &self.asset, &price)
                .unwrap();
        }
    }

    #[test]
    fn set_and_get_oracle_round_trip() {
        let h = Harness::new();
        assert_eq!(h.client.get_oracle(), None);

        h.with_oracle(HEALTHY, 100, 0);
        assert!(h.client.get_oracle().is_some());

        h.client.clear_oracle(&h.admin).unwrap();
        assert_eq!(h.client.get_oracle(), None);
    }

    #[test]
    fn only_the_admin_can_set_the_oracle() {
        let h = Harness::new();
        let oracle_id = h.env.register(MockOracle, ());
        let attacker = Address::generate(&h.env);

        let err = h
            .client
            .try_set_oracle(&attacker, &oracle_id)
            .unwrap()
            .unwrap_err();
        assert_eq!(err, ContractError::NotAdmin);
    }

    #[test]
    fn a_fresh_oracle_price_is_used() {
        let h = Harness::new();
        let now = h.env.ledger().sequence();
        h.with_oracle(HEALTHY, 250, now);

        assert_eq!(h.client.get_price(&h.asset), 250);
    }

    #[test]
    fn a_stale_oracle_price_falls_back_to_the_admin_price() {
        let h = Harness::new();
        let now = h.env.ledger().sequence();
        h.with_oracle(STALE, 250, now.saturating_sub(MAX_PRICE_AGE_LEDGERS + 1));
        h.with_admin_price(99);

        assert_eq!(h.client.get_price(&h.asset), 99);
    }

    #[test]
    fn a_reverting_oracle_falls_back_to_the_admin_price() {
        let h = Harness::new();
        h.with_oracle(REVERTS, 250, h.env.ledger().sequence());
        h.with_admin_price(77);

        assert_eq!(h.client.get_price(&h.asset), 77);
    }

    #[test]
    fn the_freshness_boundary_is_inclusive() {
        let h = Harness::new();
        let now = h.env.ledger().sequence();
        h.with_oracle(HEALTHY, 250, now.saturating_sub(MAX_PRICE_AGE_LEDGERS));
        h.with_admin_price(99);

        // Exactly at the threshold the oracle is still trusted.
        assert_eq!(h.client.get_price(&h.asset), 250);
    }

    #[test]
    fn a_future_stamp_is_treated_as_fresh_rather_than_wrapping() {
        let h = Harness::new();
        let now = h.env.ledger().sequence();
        h.with_oracle(HEALTHY, 250, now + 5_000);
        h.with_admin_price(99);

        assert_eq!(h.client.get_price(&h.asset), 250);
    }

    #[test]
    fn with_no_oracle_the_admin_price_is_used() {
        let h = Harness::new();
        h.with_admin_price(42);

        assert_eq!(h.client.get_price(&h.asset), 42);
    }

    #[test]
    fn with_no_usable_price_anywhere_it_reports_unavailable() {
        let h = Harness::new();
        h.with_oracle(REVERTS, 250, h.env.ledger().sequence());

        let err = h.client.try_get_price(&h.asset).unwrap().unwrap_err();
        assert_eq!(err, ContractError::PriceUnavailable);
        assert_eq!(err.code(), 405);
    }

    #[test]
    fn a_stale_oracle_with_no_fallback_reports_unavailable() {
        let h = Harness::new();
        let now = h.env.ledger().sequence();
        h.with_oracle(STALE, 250, now.saturating_sub(MAX_PRICE_AGE_LEDGERS + 1));

        let err = h.client.try_get_price(&h.asset).unwrap().unwrap_err();
        assert_eq!(err, ContractError::PriceUnavailable);
    }

    #[test]
    fn clearing_the_fallback_restores_the_unavailable_error() {
        let h = Harness::new();
        h.with_admin_price(42);
        assert_eq!(h.client.get_price(&h.asset), 42);

        h.client.clear_admin_price(&h.admin, &h.asset).unwrap();
        let err = h.client.try_get_price(&h.asset).unwrap().unwrap_err();
        assert_eq!(err, ContractError::PriceUnavailable);
    }

    #[test]
    fn a_non_positive_fallback_price_is_rejected() {
        let h = Harness::new();
        for price in [0_i128, -1] {
            let err = h
                .client
                .try_set_admin_price(&h.admin, &h.asset, &price)
                .unwrap()
                .unwrap_err();
            assert_eq!(err, ContractError::InvalidAmount);
        }
    }

    #[test]
    fn admin_price_records_when_it_was_published() {
        let h = Harness::new();
        h.env.ledger().set_sequence_number(4_242);
        h.with_admin_price(42);

        let entry = h.client.get_admin_price(&h.asset).unwrap();
        assert_eq!(entry.price, 42);
        assert_eq!(entry.published_at, 4_242);
    }

    #[test]
    fn quote_converts_base_amount_at_the_current_price() {
        let h = Harness::new();
        h.with_admin_price(250);

        // 25_000 base units at 250 per asset unit, to SCALE decimal places.
        assert_eq!(h.client.quote(&h.asset, &25_000).unwrap(), 100_000_000);
    }

    #[test]
    fn quote_rejects_a_non_positive_amount() {
        let h = Harness::new();
        h.with_admin_price(250);

        let err = h.client.try_quote(&h.asset, &0).unwrap().unwrap_err();
        assert_eq!(err, ContractError::InvalidAmount);
    }

    #[test]
    fn quote_reports_unavailable_when_there_is_no_price() {
        let h = Harness::new();
        let err = h.client.try_quote(&h.asset, &1_000).unwrap().unwrap_err();
        assert_eq!(err, ContractError::PriceUnavailable);
    }

    #[test]
    fn quote_reports_overflow_instead_of_aborting() {
        let h = Harness::new();
        // A price of 1 means the whole computation is `base_amount * SCALE`.
        h.with_admin_price(1);

        let err = h.client.try_quote(&h.asset, &i128::MAX).unwrap().unwrap_err();
        assert_eq!(err, ContractError::Overflow);
    }
}
