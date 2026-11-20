//! Per-address session creation rate limit (#1643) and maximum session lifetime (#1644).
//!
//! Own storage keys (`LimitKey`) and error range 900-909.

use super::*;
use soroban_sdk::{contracterror, contractimpl, contracttype, panic_with_error};

/// About 7 days of ledgers.
pub const DEFAULT_MAX_SESSION_DURATION_LEDGERS: u32 = 30_000;

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum LimitKey {
    MaxDuration,
    RateMax,
    RateWindow,
    Exempt(Address),
    /// Sessions created by an address in one window (temporary storage).
    Count(Address, u32),
    ExpiresAt(Bytes32),
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum LimitError {
    RateLimitExceeded = 900,
    InvalidRateLimit = 901,
    SessionExpired = 902,
    NotExpired = 903,
    InvalidDuration = 904,
}

fn max_duration(env: &Env) -> u32 {
    env.storage()
        .persistent()
        .get(&LimitKey::MaxDuration)
        .unwrap_or(DEFAULT_MAX_SESSION_DURATION_LEDGERS)
}

fn is_exempt(env: &Env, who: &Address) -> bool {
    env.storage()
        .persistent()
        .get(&LimitKey::Exempt(who.clone()))
        .unwrap_or(false)
}

/// Hook for `lock_funds`: counts the buyer's sessions in the current window and aborts
/// with `RateLimitExceeded` (900) when the limit is reached. A `RateLimitHit` event is
/// published first, but note that Soroban discards events of a failed call, so the event
/// is only visible in simulation/diagnostic output, not on-chain.
pub(crate) fn enforce_rate_limit(env: &Env, buyer: &Address) {
    let max: u32 = env.storage().persistent().get(&LimitKey::RateMax).unwrap_or(0);
    let window: u32 = env
        .storage()
        .persistent()
        .get(&LimitKey::RateWindow)
        .unwrap_or(0);
    if max == 0 || window == 0 || is_exempt(env, buyer) {
        return;
    }
    let window_index = env.ledger().sequence() / window;
    let key = LimitKey::Count(buyer.clone(), window_index);
    let count: u32 = env.storage().temporary().get(&key).unwrap_or(0);
    if count >= max {
        env.events()
            .publish((Symbol::new(env, "RateLimitHit"),), (buyer.clone(), count, max));
        panic_with_error!(env, LimitError::RateLimitExceeded);
    }
    env.storage().temporary().set(&key, &(count + 1));
    env.storage().temporary().extend_ttl(&key, window, window);
}

/// Hook for `lock_funds`: stores when the session stops being usable.
pub(crate) fn record_expiry(env: &Env, session_id: &Bytes32) {
    let expires_at = env.ledger().sequence().saturating_add(max_duration(env));
    env.storage()
        .persistent()
        .set(&LimitKey::ExpiresAt(session_id.clone()), &expires_at);
}

fn is_expired(env: &Env, session_id: &Bytes32) -> bool {
    let expires_at: Option<u32> = env
        .storage()
        .persistent()
        .get(&LimitKey::ExpiresAt(session_id.clone()));
    matches!(expires_at, Some(at) if env.ledger().sequence() > at)
}

/// Hook for `complete_session` and `approve_session`.
pub(crate) fn ensure_not_expired(env: &Env, session_id: &Bytes32) {
    if is_expired(env, session_id) {
        panic_with_error!(env, LimitError::SessionExpired);
    }
}

#[contractimpl]
impl SkillssyncEscrow {
    // ---- #1643 rate limit -------------------------------------------------------

    /// At most `max_sessions` sessions per buyer in every window of `window_ledgers`.
    /// `max_sessions = 0` switches the limit off.
    pub fn set_rate_limit(
        env: Env,
        max_sessions: u32,
        window_ledgers: u32,
    ) -> Result<(), ContractError> {
        require_admin(&env)?;
        if max_sessions > 0 && window_ledgers == 0 {
            panic_with_error!(&env, LimitError::InvalidRateLimit);
        }
        env.storage().persistent().set(&LimitKey::RateMax, &max_sessions);
        env.storage().persistent().set(&LimitKey::RateWindow, &window_ledgers);
        env.events().publish(
            (Symbol::new(&env, "rate_limit_updated"),),
            (max_sessions, window_ledgers),
        );
        Ok(())
    }

    /// `(max_sessions, window_ledgers)`; `(0, 0)` when no limit is set.
    pub fn get_rate_limit(env: Env) -> (u32, u32) {
        (
            env.storage().persistent().get(&LimitKey::RateMax).unwrap_or(0),
            env.storage().persistent().get(&LimitKey::RateWindow).unwrap_or(0),
        )
    }

    /// Admin whitelist: exempt addresses bypass the rate limit.
    pub fn set_rate_limit_exempt(
        env: Env,
        address: Address,
        exempt: bool,
    ) -> Result<(), ContractError> {
        require_admin(&env)?;
        env.storage()
            .persistent()
            .set(&LimitKey::Exempt(address), &exempt);
        Ok(())
    }

    pub fn is_rate_limit_exempt(env: Env, address: Address) -> bool {
        is_exempt(&env, &address)
    }

    // ---- #1644 maximum session duration -----------------------------------------

    /// Ledgers a session may stay open after `lock_funds` (default 30,000, about 7 days).
    /// Only sessions locked afterwards use the new value.
    pub fn set_max_session_duration(env: Env, ledgers: u32) -> Result<(), ContractError> {
        require_admin(&env)?;
        if ledgers == 0 {
            panic_with_error!(&env, LimitError::InvalidDuration);
        }
        env.storage().persistent().set(&LimitKey::MaxDuration, &ledgers);
        env.events()
            .publish((Symbol::new(&env, "max_duration_updated"),), ledgers);
        Ok(())
    }

    pub fn get_max_session_duration(env: Env) -> u32 {
        max_duration(&env)
    }

    pub fn get_session_expiry(env: Env, session_id: Bytes32) -> Option<u32> {
        env.storage().persistent().get(&LimitKey::ExpiresAt(session_id))
    }

    /// Anyone can cancel a `Locked` session once it has expired; the buyer is refunded in
    /// full and no fee is charged.
    pub fn cancel_expired_session(env: Env, session_id: Bytes32) -> Result<(), ContractError> {
        let mut session =
            load_session(&env, session_id.clone()).ok_or(ContractError::SessionNotFound)?;
        if session.status != SessionStatus::Locked {
            return Err(ContractError::InvalidSessionStatus);
        }
        if !is_expired(&env, &session_id) {
            panic_with_error!(&env, LimitError::NotExpired);
        }
        let token_addr =
            read_payment_token(&env).ok_or(ContractError::PaymentTokenNotConfigured)?;
        session.status = SessionStatus::Refunded;
        save_session(&env, session_id.clone(), &session);
        token::Client::new(&env, &token_addr).transfer(
            &env.current_contract_address(),
            &session.buyer,
            &session.amount,
        );
        env.events().publish(
            (Symbol::new(&env, "SessionExpiredAndCancelled"),),
            (session_id, session.amount),
        );
        Ok(())
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
            buyer,
            seller,
        }
    }

    fn id(env: &Env, n: u8) -> Bytes32 {
        BytesN::from_array(env, &[n; 32])
    }

    fn advance(f: &Fixture, ledgers: u32) {
        f.env.ledger().with_mut(|li| li.sequence_number += ledgers);
    }

    // ---- rate limit ---------------------------------------------------------------

    #[test]
    fn no_limit_by_default() {
        let f = setup();
        for n in 1..=5 {
            f.client.lock_funds(&id(&f.env, n), &f.buyer, &f.seller, &100);
        }
        assert_eq!(f.client.get_rate_limit(), (0, 0));
    }

    #[test]
    fn a_buyer_cannot_exceed_the_limit_within_a_window() {
        let f = setup();
        f.client.set_rate_limit(&2, &100);
        f.client.lock_funds(&id(&f.env, 1), &f.buyer, &f.seller, &100);
        f.client.lock_funds(&id(&f.env, 2), &f.buyer, &f.seller, &100);
        assert!(f.client.try_lock_funds(&id(&f.env, 3), &f.buyer, &f.seller, &100).is_err());
        // The rejected attempt locked nothing.
        assert!(f.client.get_session(&id(&f.env, 3)).is_none());
    }

    #[test]
    fn the_limit_resets_in_the_next_window_and_is_per_buyer() {
        let f = setup();
        f.client.set_rate_limit(&1, &100);
        f.client.lock_funds(&id(&f.env, 1), &f.buyer, &f.seller, &100);
        assert!(f.client.try_lock_funds(&id(&f.env, 2), &f.buyer, &f.seller, &100).is_err());

        let other = Address::generate(&f.env);
        token::StellarAssetClient::new(&f.env, &f.token.address).mint(&other, &1_000);
        f.client.lock_funds(&id(&f.env, 3), &other, &f.seller, &100);

        advance(&f, 100);
        f.client.lock_funds(&id(&f.env, 4), &f.buyer, &f.seller, &100);
    }

    #[test]
    fn whitelisted_addresses_bypass_the_limit() {
        let f = setup();
        f.client.set_rate_limit(&1, &100);
        f.client.set_rate_limit_exempt(&f.buyer, &true);
        assert!(f.client.is_rate_limit_exempt(&f.buyer));
        for n in 1..=3 {
            f.client.lock_funds(&id(&f.env, n), &f.buyer, &f.seller, &100);
        }
        f.client.set_rate_limit_exempt(&f.buyer, &false);
        assert!(f.client.try_lock_funds(&id(&f.env, 9), &f.buyer, &f.seller, &100).is_err());
    }

    #[test]
    fn rate_limit_settings_are_validated_and_can_be_switched_off() {
        let f = setup();
        assert!(f.client.try_set_rate_limit(&5, &0).is_err());
        f.client.set_rate_limit(&1, &100);
        f.client.set_rate_limit(&0, &0);
        for n in 1..=3 {
            f.client.lock_funds(&id(&f.env, n), &f.buyer, &f.seller, &100);
        }
    }

    // ---- expiry -------------------------------------------------------------------

    #[test]
    fn locking_records_an_expiry_from_the_configured_duration() {
        let f = setup();
        assert_eq!(f.client.get_max_session_duration(), 30_000);
        f.client.lock_funds(&id(&f.env, 1), &f.buyer, &f.seller, &100);
        assert_eq!(
            f.client.get_session_expiry(&id(&f.env, 1)),
            Some(f.env.ledger().sequence() + 30_000)
        );
        f.client.set_max_session_duration(&500);
        f.client.lock_funds(&id(&f.env, 2), &f.buyer, &f.seller, &100);
        assert_eq!(
            f.client.get_session_expiry(&id(&f.env, 2)),
            Some(f.env.ledger().sequence() + 500)
        );
        assert!(f.client.try_set_max_session_duration(&0).is_err());
    }

    #[test]
    fn anyone_can_cancel_an_expired_session_and_the_buyer_gets_everything_back() {
        let f = setup();
        f.client.set_max_session_duration(&100);
        f.client.lock_funds(&id(&f.env, 1), &f.buyer, &f.seller, &10_000);
        let balance_after_lock = f.token.balance(&f.buyer);

        // Not expired yet.
        advance(&f, 100);
        assert!(f.client.try_cancel_expired_session(&id(&f.env, 1)).is_err());

        advance(&f, 1);
        f.client.cancel_expired_session(&id(&f.env, 1));
        assert_eq!(f.token.balance(&f.buyer), balance_after_lock + 10_000);
        assert_eq!(f.client.get_session(&id(&f.env, 1)).unwrap().status, SessionStatus::Refunded);
        // Cannot be cancelled twice.
        assert!(f.client.try_cancel_expired_session(&id(&f.env, 1)).is_err());
    }

    #[test]
    fn expired_sessions_cannot_be_completed_or_approved() {
        let f = setup();
        f.client.set_max_session_duration(&100);
        f.client.lock_funds(&id(&f.env, 1), &f.buyer, &f.seller, &10_000);
        f.client.lock_funds(&id(&f.env, 2), &f.buyer, &f.seller, &10_000);
        f.client.complete_session(&id(&f.env, 2));

        advance(&f, 101);
        assert!(f.client.try_complete_session(&id(&f.env, 1)).is_err());
        assert!(f.client.try_approve_session(&id(&f.env, 2)).is_err());
    }

    #[test]
    fn only_locked_sessions_can_be_cancelled_as_expired() {
        let f = setup();
        f.client.set_max_session_duration(&100);
        f.client.lock_funds(&id(&f.env, 1), &f.buyer, &f.seller, &10_000);
        f.client.complete_session(&id(&f.env, 1));
        advance(&f, 101);
        assert!(f.client.try_cancel_expired_session(&id(&f.env, 1)).is_err());
        assert!(f.client.try_cancel_expired_session(&id(&f.env, 99)).is_err());
    }
}
