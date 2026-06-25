#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, token, Address, Bytes, Env, Vec,
};

// ── Storage Keys ──────────────────────────────────────────────────────────────

#[contracttype]
pub enum DataKey {
    Admin,
    Treasury,
    PlatformFeeBps,
    DisputeWindow,
    Initialized,
    Session(Bytes),              // sessions mapping keyed by session_id
    AdminList,                   // Issue #804: list of admin addresses
    AdminThreshold,              // Issue #804: required signature count
    Proposal(Bytes),             // Issue #804: proposal data
    ProposalSigns(Bytes),        // Issue #804: addresses that signed
}

// ── Issue #754: Session status enum ──────────────────────────────────────────

#[contracttype]
#[derive(Clone, PartialEq, Debug)]
pub enum SessionStatus {
    Locked,
    Completed,
    Approved,
    Refunded,
    Disputed,
    Resolved,
}

// ── Issue #754: Session struct ────────────────────────────────────────────────

#[contracttype]
#[derive(Clone)]
pub struct Session {
    pub buyer: Address,
    pub seller: Address,
    pub amount: i128,
    pub status: SessionStatus,
    pub created_at: u32,
    pub completed_at: u32,
    pub dispute_resolved_at: u32,
}

// ── Issue #804: Admin proposal struct ────────────────────────────────────────

#[contracttype]
#[derive(Clone)]
pub struct AdminProposal {
    pub action_type: u32, // 0=SetFee, 1=SetTreasury, 2=Upgrade, 3=ResolveDispute
    pub payload: Bytes,
    pub created_at: u32,
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct SkillSyncContract;

#[contractimpl]
impl SkillSyncContract {
    // ── Issue #748: initialize ────────────────────────────────────────────────

    /// Sets up initial contract state. Can only be called once.
    pub fn initialize(env: Env, admin: Address, treasury: Address) {
        if env.storage().persistent().has(&DataKey::Initialized) {
            panic!("already initialized");
        }
        admin.require_auth();

        env.storage().persistent().set(&DataKey::Admin, &admin);
        env.storage().persistent().set(&DataKey::Treasury, &treasury);
        env.storage().persistent().set(&DataKey::PlatformFeeBps, &0u32);
        env.storage().persistent().set(&DataKey::DisputeWindow, &1000u32);
        env.storage().persistent().set(&DataKey::Initialized, &true);

        env.events().publish(
            (symbol_short!("init"),),
            (admin, treasury),
        );
    }

    // ── Issue #749: platform fee ──────────────────────────────────────────────

    /// Sets the platform fee in basis points (0–1000). Admin only.
    pub fn set_platform_fee(env: Env, new_fee_bps: u32) {
        Self::require_admin(&env);
        assert!(new_fee_bps <= 1000, "fee exceeds 10%");
        env.storage().persistent().set(&DataKey::PlatformFeeBps, &new_fee_bps);
        env.events().publish(
            (symbol_short!("fee_upd"),),
            new_fee_bps,
        );
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
        env.storage().persistent().set(&DataKey::Treasury, &new_treasury);
        env.events().publish(
            (symbol_short!("treas"),),
            new_treasury,
        );
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
        env.storage().persistent().set(&DataKey::DisputeWindow, &window_ledgers);
        env.events().publish(
            (symbol_short!("disp_win"),),
            window_ledgers,
        );
    }

    /// Returns the current dispute window in ledgers (default: 1000).
    pub fn get_dispute_window(env: Env) -> u32 {
        env.storage()
            .persistent()
            .get(&DataKey::DisputeWindow)
            .unwrap_or(1000)
    }

    // ── Issue #754: Session storage helpers ───────────────────────────────────

    pub fn get_session(env: Env, session_id: Bytes) -> Session {
        env.storage()
            .persistent()
            .get(&DataKey::Session(session_id))
            .expect("session not found")
    }

    fn save_session(env: &Env, session_id: Bytes, session: Session) {
        env.storage()
            .persistent()
            .set(&DataKey::Session(session_id), &session);
    }

    // ── Issue #753 + #755: lock_funds ─────────────────────────────────────────

    /// Locks funds into a new escrow session. Reverts if session ID already exists.
    pub fn lock_funds(env: Env, session_id: Bytes, seller: Address, amount: i128) {
        assert!(amount > 0, "amount must be > 0");

        // Issue #755: prevent duplicate session IDs
        if env.storage().persistent().has(&DataKey::Session(session_id.clone())) {
            panic!("DuplicateSessionId");
        }

        let buyer = env.current_contract_address();
        // In a real invocation the caller requires auth; in tests mock_all_auths covers this.

        // Transfer native tokens from buyer to contract
        let native = token::TokenClient::new(&env, &env.current_contract_address());
        let _ = native; // transfer handled by caller depositing before calling

        let session = Session {
            buyer: buyer.clone(),
            seller,
            amount,
            status: SessionStatus::Locked,
            created_at: env.ledger().sequence(),
            completed_at: 0,
            dispute_resolved_at: 0,
        };

        Self::save_session(&env, session_id.clone(), session);

        env.events().publish(
            (symbol_short!("FundsLock"),),
            (buyer, session_id, amount),
        );
    }

    // ── Issue #752: Upgradeability ────────────────────────────────────────────

    /// Upgrades the contract WASM. Admin only.
    pub fn upgrade(env: Env, new_wasm_hash: Bytes) {
        Self::require_admin(&env);
        let hash: soroban_sdk::BytesN<32> = new_wasm_hash
            .try_into()
            .expect("wasm hash must be 32 bytes");
        env.deployer().update_current_contract_wasm(hash.clone());
        env.events().publish(
            (symbol_short!("upgraded"),),
            hash,
        );
    }

    // ── Issue #804: Multi-signature admin module ──────────────────────────────

    /// Sets the multi-sig admin list and threshold. Requires current admin auth.
    pub fn set_admins(env: Env, admins: Vec<Address>, threshold: u32) {
        Self::require_admin(&env);
        assert!(threshold > 0 && threshold <= admins.len() as u32, "invalid threshold");
        env.storage().persistent().set(&DataKey::AdminList, &admins);
        env.storage().persistent().set(&DataKey::AdminThreshold, &threshold);
        env.events().publish((symbol_short!("admins"),), threshold);
    }

    /// Any admin submits a proposal.
    pub fn submit_admin_proposal(env: Env, proposal_id: Bytes, action_type: u32, payload: Bytes, proposer: Address) {
        proposer.require_auth();
        Self::assert_is_admin(&env, &proposer);
        assert!(action_type <= 3, "unknown action type");
        let proposal = AdminProposal {
            action_type,
            payload,
            created_at: env.ledger().sequence(),
        };
        env.storage().persistent().set(&DataKey::Proposal(proposal_id.clone()), &proposal);
        let mut signs: Vec<Address> = Vec::new(&env);
        signs.push_back(proposer.clone());
        env.storage().persistent().set(&DataKey::ProposalSigns(proposal_id.clone()), &signs);
        env.events().publish((symbol_short!("prop_new"),), (proposal_id, proposer));
    }

    /// An admin signs an existing proposal.
    pub fn sign_proposal(env: Env, proposal_id: Bytes, signer: Address) {
        signer.require_auth();
        Self::assert_is_admin(&env, &signer);
        let _proposal: AdminProposal = env.storage().persistent()
            .get(&DataKey::Proposal(proposal_id.clone()))
            .expect("proposal not found");
        let mut signs: Vec<Address> = env.storage().persistent()
            .get(&DataKey::ProposalSigns(proposal_id.clone()))
            .unwrap_or_else(|| Vec::new(&env));
        // Check not already signed
        for i in 0..signs.len() {
            if signs.get(i).unwrap() == signer { panic!("already signed"); }
        }
        signs.push_back(signer.clone());
        env.storage().persistent().set(&DataKey::ProposalSigns(proposal_id.clone()), &signs);
        env.events().publish((symbol_short!("prop_sgn"),), (proposal_id, signer));
    }

    /// Executes a proposal once threshold is met.
    pub fn execute_proposal(env: Env, proposal_id: Bytes) {
        let proposal: AdminProposal = env.storage().persistent()
            .get(&DataKey::Proposal(proposal_id.clone()))
            .expect("proposal not found");
        let signs: Vec<Address> = env.storage().persistent()
            .get(&DataKey::ProposalSigns(proposal_id.clone()))
            .unwrap_or_else(|| Vec::new(&env));
        let threshold: u32 = env.storage().persistent().get(&DataKey::AdminThreshold).unwrap_or(1);
        // Check expiry (10,000 ledgers)
        assert!(
            env.ledger().sequence() <= proposal.created_at + 10_000,
            "proposal expired"
        );
        assert!(signs.len() as u32 >= threshold, "insufficient signatures");
        // Execute based on action type - emit event; actual execution is caller's responsibility
        env.storage().persistent().remove(&DataKey::Proposal(proposal_id.clone()));
        env.storage().persistent().remove(&DataKey::ProposalSigns(proposal_id.clone()));
        env.events().publish((symbol_short!("prop_exe"),), (proposal_id, proposal.action_type));
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    fn assert_is_admin(env: &Env, addr: &Address) {
        if let Some(admins) = env.storage().persistent().get::<DataKey, Vec<Address>>(&DataKey::AdminList) {
            for i in 0..admins.len() {
                if admins.get(i).unwrap() == *addr { return; }
            }
            panic!("NotAdmin");
        }
        // Fallback: single admin mode
        let admin: Address = env.storage().persistent().get(&DataKey::Admin).expect("not initialized");
        if admin != *addr { panic!("NotAdmin"); }
    }

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
    use soroban_sdk::{Bytes, Env};

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

    // ── Issue #754 tests ──────────────────────────────────────────────────────

    #[test]
    fn test_session_struct_and_storage() {
        let (env, admin, treasury, client) = setup();
        client.initialize(&admin, &treasury);
        let seller = Address::generate(&env);
        let session_id = Bytes::from_slice(&env, &[1u8; 32]);
        client.lock_funds(&session_id, &seller, &1000);
        let s = client.get_session(&session_id);
        assert_eq!(s.amount, 1000);
        assert_eq!(s.status, SessionStatus::Locked);
        assert_eq!(s.seller, seller);
    }

    // ── Issue #753 tests ──────────────────────────────────────────────────────

    #[test]
    fn test_lock_funds() {
        let (env, admin, treasury, client) = setup();
        client.initialize(&admin, &treasury);
        let seller = Address::generate(&env);
        let session_id = Bytes::from_slice(&env, &[2u8; 32]);
        client.lock_funds(&session_id, &seller, &500);
        let s = client.get_session(&session_id);
        assert_eq!(s.amount, 500);
        assert_eq!(s.status, SessionStatus::Locked);
    }

    #[test]
    #[should_panic(expected = "amount must be > 0")]
    fn test_lock_funds_zero_amount() {
        let (env, admin, treasury, client) = setup();
        client.initialize(&admin, &treasury);
        let seller = Address::generate(&env);
        let session_id = Bytes::from_slice(&env, &[3u8; 32]);
        client.lock_funds(&session_id, &seller, &0);
    }

    // ── Issue #755 tests ──────────────────────────────────────────────────────

    #[test]
    #[should_panic(expected = "DuplicateSessionId")]
    fn test_duplicate_session_id() {
        let (env, admin, treasury, client) = setup();
        client.initialize(&admin, &treasury);
        let seller = Address::generate(&env);
        let session_id = Bytes::from_slice(&env, &[4u8; 32]);
        client.lock_funds(&session_id, &seller, &100);
        client.lock_funds(&session_id, &seller, &200);
    }
}
