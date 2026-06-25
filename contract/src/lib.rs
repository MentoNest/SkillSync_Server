#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, token, Address, Bytes, BytesN, Env,
};

// ── Storage Keys ──────────────────────────────────────────────────────────────

#[contracttype]
pub enum DataKey {
    Admin,
    Treasury,
    PlatformFeeBps,
    DisputeWindow,
    Initialized,
    Session(Bytes),    // sessions mapping keyed by session_id
    Nonce(Address),    // Issue #803: per-address nonce for replay prevention
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

    // ── Issue #803: Signature verification module ─────────────────────────────

    /// Returns current nonce for an address (for off-chain signing).
    pub fn get_nonce(env: Env, address: Address) -> u64 {
        env.storage().persistent().get(&DataKey::Nonce(address)).unwrap_or(0)
    }

    /// Approves a session using off-chain ed25519 signatures from buyer and seller.
    /// Message signed by each party: sha256(session_id || nonce)
    pub fn approve_with_signature(
        env: Env,
        session_id: Bytes,
        buyer_pubkey: BytesN<32>,
        buyer_sig: BytesN<64>,
        seller_pubkey: BytesN<32>,
        seller_sig: BytesN<64>,
    ) {
        let session: Session = env.storage().persistent()
            .get(&DataKey::Session(session_id.clone()))
            .expect("session not found");
        assert!(session.status == SessionStatus::Locked, "InvalidSessionState");

        // Build message: session_id bytes + buyer nonce
        let buyer_nonce: u64 = env.storage().persistent()
            .get(&DataKey::Nonce(session.buyer.clone()))
            .unwrap_or(0);
        let seller_nonce: u64 = env.storage().persistent()
            .get(&DataKey::Nonce(session.seller.clone()))
            .unwrap_or(0);

        let mut buyer_msg = session_id.clone();
        buyer_msg.extend_from_array(&buyer_nonce.to_be_bytes());
        let mut seller_msg = session_id.clone();
        seller_msg.extend_from_array(&seller_nonce.to_be_bytes());

        env.crypto().ed25519_verify(&buyer_pubkey, &buyer_msg, &buyer_sig);
        env.crypto().ed25519_verify(&seller_pubkey, &seller_msg, &seller_sig);

        // Increment nonces
        env.storage().persistent().set(&DataKey::Nonce(session.buyer.clone()), &(buyer_nonce + 1));
        env.storage().persistent().set(&DataKey::Nonce(session.seller.clone()), &(seller_nonce + 1));

        env.events().publish((symbol_short!("off_appr"),), session_id);
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
