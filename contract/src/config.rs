use soroban_sdk::{contractimpl, Address, Env};

use crate::errors::ContractError;
use crate::{admin, events, storage};
use crate::{SkillSyncEscrow, SkillSyncEscrowArgs, SkillSyncEscrowClient};

/// Platform fee ceiling: 1000 bps = 10%.
pub const MAX_PLATFORM_FEE_BPS: u32 = 1000;

#[contractimpl]
impl SkillSyncEscrow {
    /// Sets the platform fee in basis points (0-1000). Admin only.
    pub fn set_platform_fee(env: Env, new_fee_bps: u32) -> Result<(), ContractError> {
        let admin = admin::require_admin(&env)?;
        admin.require_auth();
        if new_fee_bps > MAX_PLATFORM_FEE_BPS {
            return Err(ContractError::InvalidFee);
        }
        let old = storage::get_platform_fee(&env);
        storage::set_platform_fee(&env, new_fee_bps);
        events::emit_platform_fee_updated(&env, old, new_fee_bps);
        Ok(())
    }

    /// Current platform fee in basis points.
    pub fn get_platform_fee(env: Env) -> u32 {
        storage::get_platform_fee(&env)
    }

    /// Changes the wallet that receives platform fees. Admin only.
    pub fn set_treasury(env: Env, new_treasury: Address) -> Result<(), ContractError> {
        let admin = admin::require_admin(&env)?;
        admin.require_auth();
        let old = admin::require_treasury(&env)?;
        storage::set_treasury(&env, &new_treasury);
        events::emit_treasury_updated(&env, &old, &new_treasury);
        Ok(())
    }

    /// The wallet that receives platform fees.
    pub fn get_treasury(env: Env) -> Result<Address, ContractError> {
        admin::require_treasury(&env)
    }

    /// Sets how many ledgers a buyer has to react after a session is marked
    /// complete. Admin only; must be at least one ledger.
    pub fn set_dispute_window(env: Env, window_ledgers: u32) -> Result<(), ContractError> {
        let admin = admin::require_admin(&env)?;
        admin.require_auth();
        if window_ledgers == 0 {
            return Err(ContractError::InvalidWindow);
        }
        let old = storage::get_dispute_window(&env);
        storage::set_dispute_window(&env, window_ledgers);
        events::emit_dispute_window_updated(&env, old, window_ledgers);
        Ok(())
    }

    /// The dispute window in ledgers (default 1000).
    pub fn get_dispute_window(env: Env) -> u32 {
        storage::get_dispute_window(&env)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_utils::setup;
    use soroban_sdk::testutils::Address as _;

    #[test]
    fn platform_fee_defaults_to_zero_and_can_be_updated() {
        let f = setup();
        assert_eq!(f.client.get_platform_fee(), 0);
        f.client.set_platform_fee(&250);
        assert_eq!(f.client.get_platform_fee(), 250);
    }

    #[test]
    fn platform_fee_is_capped_at_ten_percent() {
        let f = setup();
        f.client.set_platform_fee(&1000);
        assert_eq!(f.client.try_set_platform_fee(&1001), Err(Ok(ContractError::InvalidFee)));
        assert_eq!(f.client.get_platform_fee(), 1000);
    }

    #[test]
    fn config_changes_are_admin_only() {
        let f = setup();
        f.env.mock_auths(&[]);
        assert!(f.client.try_set_platform_fee(&100).is_err());
        assert!(f.client.try_set_treasury(&Address::generate(&f.env)).is_err());
        assert!(f.client.try_set_dispute_window(&500).is_err());
    }

    #[test]
    fn treasury_is_set_at_initialize_and_can_change() {
        let f = setup();
        assert_eq!(f.client.get_treasury(), f.treasury);
        let next = Address::generate(&f.env);
        f.client.set_treasury(&next);
        assert_eq!(f.client.get_treasury(), next);
    }

    #[test]
    fn dispute_window_defaults_to_1000_ledgers() {
        let f = setup();
        assert_eq!(f.client.get_dispute_window(), 1000);
        f.client.set_dispute_window(&2000);
        assert_eq!(f.client.get_dispute_window(), 2000);
    }

    #[test]
    fn dispute_window_must_be_positive() {
        let f = setup();
        assert_eq!(f.client.try_set_dispute_window(&0), Err(Ok(ContractError::InvalidWindow)));
    }

    #[test]
    fn setters_fail_before_initialize() {
        let env = Env::default();
        env.mock_all_auths();
        let id = env.register(SkillSyncEscrow, ());
        let client = SkillSyncEscrowClient::new(&env, &id);
        assert_eq!(client.try_set_platform_fee(&10), Err(Ok(ContractError::NotInitialized)));
        assert_eq!(client.try_get_treasury(), Err(Ok(ContractError::NotInitialized)));
    }
}
