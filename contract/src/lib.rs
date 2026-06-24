#![no_std]

use soroban_sdk::{contract, contractevent, contractimpl, contracttype, Address, Env};

// ── Storage Keys ──────────────────────────────────────────────────────────────

#[contracttype]
pub enum DataKey {
    Admin,
    Treasury,
    PlatformFeeBps,
    DisputeWindow,
    Initialized,
}

// ── Events ────────────────────────────────────────────────────────────────────

#[contractevent]
pub struct Initialized {
    pub admin: Address,
    pub treasury: Address,
}

#[contractevent]
pub struct PlatformFeeUpdated {
    pub new_fee_bps: u32,
}

#[contractevent]
pub struct TreasuryUpdated {
    pub new_treasury: Address,
}

#[contractevent]
pub struct DisputeWindowUpdated {
    pub window_ledgers: u32,
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct SkillSyncContract;

#[contractimpl]
impl SkillSyncContract {
    // ── Issue #748: initialize ────────────────────────────────────────────────

    /// Sets up the initial contract state. Can only be called once.
    pub fn initialize(env: Env, admin: Address, treasury: Address) {
        if env.storage().persistent().has(&DataKey::Initialized) {
            panic!("already initialized");
        }

        admin.require_auth();

        env.storage().persistent().set(&DataKey::Admin, &admin);
        env.storage().persistent().set(&DataKey::Treasury, &treasury);
        env.storage().persistent().set(&DataKey::PlatformFeeBps, &0u32);
        env.storage()
            .persistent()
            .set(&DataKey::DisputeWindow, &1000u32);
        env.storage().persistent().set(&DataKey::Initialized, &true);

        env.events().publish(("SkillSync",), Initialized { admin, treasury });
    }

    // ── Issue #749: platform fee ──────────────────────────────────────────────

    /// Sets the platform fee in basis points (0–1000). Admin only.
    pub fn set_platform_fee(env: Env, new_fee_bps: u32) {
        Self::require_admin(&env);
        assert!(new_fee_bps <= 1000, "fee exceeds 10%");
        env.storage()
            .persistent()
            .set(&DataKey::PlatformFeeBps, &new_fee_bps);
        env.events()
            .publish(("SkillSync",), PlatformFeeUpdated { new_fee_bps });
    }

    /// Returns the current platform fee in basis points.
    pub fn get_platform_fee(env: Env) -> u32 {
        env.storage()
            .persistent()
            .get(&DataKey::PlatformFeeBps)
            .unwrap_or(0)
    }

    // ── Issue #750: treasury wallet ───────────────────────────────────────────

    /// Updates the treasury wallet address. Admin only.
    pub fn set_treasury(env: Env, new_treasury: Address) {
        Self::require_admin(&env);
        env.storage()
            .persistent()
            .set(&DataKey::Treasury, &new_treasury);
        env.events()
            .publish(("SkillSync",), TreasuryUpdated { new_treasury });
    }

    /// Returns the current treasury wallet address.
    pub fn get_treasury(env: Env) -> Address {
        env.storage()
            .persistent()
            .get(&DataKey::Treasury)
            .expect("treasury not set")
    }

    // ── Issue #751: dispute window ────────────────────────────────────────────

    /// Sets the dispute resolution window in ledgers. Admin only.
    pub fn set_dispute_window(env: Env, window_ledgers: u32) {
        Self::require_admin(&env);
        env.storage()
            .persistent()
            .set(&DataKey::DisputeWindow, &window_ledgers);
        env.events()
            .publish(("SkillSync",), DisputeWindowUpdated { window_ledgers });
    }

    /// Returns the current dispute window in ledgers (default: 1000).
    pub fn get_dispute_window(env: Env) -> u32 {
        env.storage()
            .persistent()
            .get(&DataKey::DisputeWindow)
            .unwrap_or(1000)
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    fn require_admin(env: &Env) {
        let admin: Address = env
            .storage()
            .persistent()
            .get(&DataKey::Admin)
            .expect("not initialized");
        admin.require_auth();
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::Env;

    fn setup() -> (Env, Address, Address, SkillSyncContractClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(SkillSyncContract, ());
        let client = SkillSyncContractClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        (env, admin, treasury, client)
    }

    #[test]
    fn test_initialize() {
        let (_, admin, treasury, client) = setup();
        client.initialize(&admin, &treasury);
        assert_eq!(client.get_treasury(), treasury);
        assert_eq!(client.get_platform_fee(), 0);
        assert_eq!(client.get_dispute_window(), 1000);
    }

    #[test]
    #[should_panic(expected = "already initialized")]
    fn test_initialize_once() {
        let (_, admin, treasury, client) = setup();
        client.initialize(&admin, &treasury);
        client.initialize(&admin, &treasury);
    }

    #[test]
    fn test_platform_fee() {
        let (_, admin, treasury, client) = setup();
        client.initialize(&admin, &treasury);
        client.set_platform_fee(&250);
        assert_eq!(client.get_platform_fee(), 250);
    }

    #[test]
    #[should_panic(expected = "fee exceeds 10%")]
    fn test_platform_fee_max() {
        let (_, admin, treasury, client) = setup();
        client.initialize(&admin, &treasury);
        client.set_platform_fee(&1001);
    }

    #[test]
    fn test_treasury() {
        let (env, admin, treasury, client) = setup();
        client.initialize(&admin, &treasury);
        let new_treasury = Address::generate(&env);
        client.set_treasury(&new_treasury);
        assert_eq!(client.get_treasury(), new_treasury);
    }

    #[test]
    fn test_dispute_window() {
        let (_, admin, treasury, client) = setup();
        client.initialize(&admin, &treasury);
        client.set_dispute_window(&2000);
        assert_eq!(client.get_dispute_window(), 2000);
    }
}
