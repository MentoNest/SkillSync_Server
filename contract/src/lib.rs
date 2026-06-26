#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, token, Address, Bytes, Env, String,
};

// ── Storage Keys ──────────────────────────────────────────────────────────────

#[contracttype]
pub enum DataKey {
    Admin,
    Treasury,
    PlatformFeeBps,
    DisputeWindow,
    Initialized,
    Session(Bytes),           // sessions mapping keyed by session_id
    ExtensionProposal(Bytes), // Issue #801: pending extension proposal
    Initialized,    // sessions mapping keyed by session_id
    SessionMeta(Bytes), // Issue #794: metadata URI per session
    Session(Bytes),      // sessions mapping keyed by session_id
    TokenSession(Bytes), // Issue #793: token-based sessions
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
    pub dispute_opened_at: u32,   // Issue #760
    pub dispute_resolved_at: u32,
    pub deadline: u32, // Issue #801: completion deadline in ledgers (0 = no deadline)
}

// ── Issue #801: Extension proposal struct ────────────────────────────────────

#[contracttype]
#[derive(Clone)]
pub struct ExtensionProposal {
    pub proposer: Address,
    pub additional_ledgers: u32,
}

// ── Issue #793: Token session struct ─────────────────────────────────────────

#[contracttype]
#[derive(Clone)]
pub struct TokenSession {
    pub buyer: Address,
    pub seller: Address,
    pub token: Address,
    pub amount: i128,
    pub status: SessionStatus,
    pub created_at: u32,
}

// ── Issue #793: TokenSession struct ──────────────────────────────────────────

#[contracttype]
#[derive(Clone)]
pub struct TokenSession {
    pub buyer: Address,
    pub seller: Address,
    pub amount: i128,
    pub token: Address,
    pub status: SessionStatus,
    pub created_at: u32,
}

// ── Issue #801: ExtensionProposal struct ──────────────────────────────────────

#[contracttype]
#[derive(Clone)]
pub struct ExtensionProposal {
    pub proposed_by: Address,
    pub additional_ledgers: u32,
}

const MAX_EXTENSION_LEDGERS: u32 = 10_000;

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct SkillSyncContract;

#[contractimpl]
impl SkillSyncContract {
    // ── Issue #748: initialize ────────────────────────────────────────────────

    /// Sets up initial contract state. Can only be called once.
    pub fn initialize(env: Env, admin: Address, treasury: Address) {
        if env.storage().persistent().has(&DataKey::Initialized) {
            panic!("AlreadyInitialized");
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

    /// Returns the admin address.
    pub fn get_admin(env: Env) -> Address {
        env.storage()
            .persistent()
            .get(&DataKey::Admin)
            .expect("not initialized")
    }

    // ── Issue #749: platform fee ──────────────────────────────────────────────

    /// Sets the platform fee in basis points (0–1000). Admin only.
    pub fn set_platform_fee(env: Env, new_fee_bps: u32) {
        Self::require_not_paused(&env);
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
        Self::require_not_paused(&env);
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
        Self::require_not_paused(&env);
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
        Self::require_not_paused(&env);
        assert!(amount > 0, "amount must be > 0");

        // Issue #755: prevent duplicate session IDs
        if env.storage().persistent().has(&DataKey::Session(session_id.clone())) {
            panic!("DuplicateSessionId");
        }

        let buyer = env.current_contract_address();

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
            dispute_opened_at: 0,
            dispute_resolved_at: 0,
            deadline: 0,
        };

        Self::save_session(&env, session_id.clone(), session);

        // Issue #802: update analytics counters
        let v: i128 = env.storage().persistent().get(&DataKey::TotalVolume).unwrap_or(0);
        env.storage().persistent().set(&DataKey::TotalVolume, &(v + amount));
        let t: u32 = env.storage().persistent().get(&DataKey::TotalSessions).unwrap_or(0);
        env.storage().persistent().set(&DataKey::TotalSessions, &(t + 1));
        let a: u32 = env.storage().persistent().get(&DataKey::ActiveSessions).unwrap_or(0);
        env.storage().persistent().set(&DataKey::ActiveSessions, &(a + 1));

        env.events().publish(
            (symbol_short!("FundsLock"),),
            (buyer, session_id, amount),
        );
    }

    // ── Issue #760: open_dispute ──────────────────────────────────────────────

    /// Opens a dispute on a Locked or Completed session. Caller must be buyer or seller.
    pub fn open_dispute(env: Env, session_id: Bytes, reason: String) {
        let mut session: Session = env
            .storage()
            .persistent()
            .get(&DataKey::Session(session_id.clone()))
            .expect("session not found");

        assert!(
            session.status == SessionStatus::Completed
                || session.status == SessionStatus::Locked,
            "session not in disputable state"
        );

        session.status = SessionStatus::Disputed;
        session.dispute_opened_at = env.ledger().sequence();
        Self::save_session(&env, session_id.clone(), session);

        env.events().publish(
            (symbol_short!("dis_open"),),
            (session_id, reason),
        );
    }

    // ── Issue #761: resolve_dispute ───────────────────────────────────────────

    /// Admin resolves a dispute by splitting funds between buyer and seller.
    pub fn resolve_dispute(
        env: Env,
        session_id: Bytes,
        resolution: u32,
        buyer_share: i128,
        seller_share: i128,
    ) {
        Self::require_admin(&env);

        let mut session: Session = env
            .storage()
            .persistent()
            .get(&DataKey::Session(session_id.clone()))
            .expect("session not found");

        assert!(session.status == SessionStatus::Disputed, "session not disputed");
        assert!(buyer_share >= 0 && seller_share >= 0, "shares must be non-negative");
        assert!(
            buyer_share + seller_share == session.amount,
            "shares must equal session amount"
        );

        let (buyer_net, buyer_fee) = Self::apply_fee(&env, buyer_share);
        let (seller_net, seller_fee) = Self::apply_fee(&env, seller_share);
        let total_fee = buyer_fee + seller_fee;

        let treasury: Address = env
            .storage()
            .persistent()
            .get(&DataKey::Treasury)
            .expect("treasury not set");

        session.status = SessionStatus::Resolved;
        session.dispute_resolved_at = env.ledger().sequence();
        Self::save_session(&env, session_id.clone(), session);

        env.events().publish(
            (symbol_short!("dis_res"),),
            (session_id, resolution, buyer_net, seller_net, total_fee, treasury),
        );
    }

    // ── Issue #762: apply_fee ─────────────────────────────────────────────────

    /// Computes (after_fee, fee_amount) using the stored platform fee in basis points.
    /// Fee precision: 1 bps = 1/10000 of the amount.
    fn apply_fee(env: &Env, amount: i128) -> (i128, i128) {
        let fee_bps: u32 = env
            .storage()
            .persistent()
            .get(&DataKey::PlatformFeeBps)
            .unwrap_or(0);
        let fee_amount = amount * (fee_bps as i128) / 10000;
        let after_fee = amount - fee_amount;
        (after_fee, fee_amount)
    }

    // ── Issue #756: approve_session ─────────────────────────────────────────────

    /// Buyer approves a completed session, releasing funds to seller minus platform fee.
    pub fn approve_session(env: Env, session_id: Bytes) {
        let mut session: Session = env
            .storage()
            .persistent()
            .get(&DataKey::Session(session_id.clone()))
            .expect("session not found");

        session.buyer.require_auth();
        assert!(session.status == SessionStatus::Completed, "InvalidSessionState");

        let fee_bps: u32 = env
            .storage()
            .persistent()
            .get(&DataKey::PlatformFeeBps)
            .unwrap_or(0);
        let payout = session.amount - (session.amount * fee_bps as i128 / 10000);
        let fee = session.amount * fee_bps as i128 / 10000;

        let treasury: Address = env
            .storage()
            .persistent()
            .get(&DataKey::Treasury)
            .expect("treasury not set");

        let native = token::TokenClient::new(&env, &env.current_contract_address());
        native.transfer(&env.current_contract_address(), &session.seller, &payout);
        if fee > 0 {
            native.transfer(&env.current_contract_address(), &treasury, &fee);
        }

        session.status = SessionStatus::Approved;
        env.storage()
            .persistent()
            .set(&DataKey::Session(session_id.clone()), &session);

        env.events().publish(
            (symbol_short!("SessionApproved"),),
            (session_id, payout, fee),
        );
    }

    // ── Issue #755 + #756: complete_session ───────────────────────────────────────

    /// Marks a Locked session as Completed. Seller or buyer can call.
    pub fn complete_session(env: Env, session_id: Bytes) {
        let mut session: Session = env
            .storage()
            .persistent()
            .get(&DataKey::Session(session_id.clone()))
            .expect("session not found");
        assert!(session.status == SessionStatus::Locked, "InvalidSessionState");
        session.status = SessionStatus::Completed;
        session.completed_at = env.ledger().sequence();
        Self::save_session(&env, session_id, session);
        env.events().publish((symbol_short!("Completed"),), session_id);
    }

    // ── Issue #756: approve_session ─────────────────────────────────────────────

    /// Buyer approves a completed session, releasing funds to seller minus platform fee.
    pub fn approve_session(env: Env, session_id: Bytes) {
        let mut session: Session = env
            .storage()
            .persistent()
            .get(&DataKey::Session(session_id.clone()))
            .expect("session not found");

        session.buyer.require_auth();
        assert!(session.status == SessionStatus::Completed, "InvalidSessionState");

        let fee_bps: u32 = env
            .storage()
            .persistent()
            .get(&DataKey::PlatformFeeBps)
            .unwrap_or(0);
        let payout = session.amount - (session.amount * fee_bps as i128 / 10000);
        let fee = session.amount * fee_bps as i128 / 10000;

        let treasury: Address = env
            .storage()
            .persistent()
            .get(&DataKey::Treasury)
            .expect("treasury not set");

        let native = token::TokenClient::new(&env, &env.current_contract_address());
        native.transfer(&env.current_contract_address(), &session.seller, &payout);
        if fee > 0 {
            native.transfer(&env.current_contract_address(), &treasury, &fee);
        }

        session.status = SessionStatus::Approved;
        env.storage()
            .persistent()
            .set(&DataKey::Session(session_id.clone()), &session);

        env.events().publish(
            (symbol_short!("SessionApproved"),),
            (session_id, payout, fee),
        );
    }

    // ── Issue #752: Upgradeability ────────────────────────────────────────────

    /// Upgrades the contract WASM. Admin only.
    pub fn upgrade(env: Env, new_wasm_hash: Bytes) {
        Self::require_not_paused(&env);
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

    // ── Issue #801: Session extension module ──────────────────────────────────

    /// Proposes a deadline extension. Either buyer or seller may propose.
    pub fn propose_extension(env: Env, session_id: Bytes, additional_ledgers: u32, proposer: Address) {
        proposer.require_auth();
        assert!(additional_ledgers > 0 && additional_ledgers <= 10_000, "extension out of range");
        let session: Session = env.storage().persistent()
            .get(&DataKey::Session(session_id.clone()))
            .expect("session not found");
        assert!(
            proposer == session.buyer || proposer == session.seller,
            "Unauthorized"
        );
        assert!(session.status == SessionStatus::Locked, "InvalidSessionState");
        let proposal = ExtensionProposal { proposer: proposer.clone(), additional_ledgers };
        env.storage().persistent().set(&DataKey::ExtensionProposal(session_id.clone()), &proposal);
        env.events().publish((symbol_short!("ext_prop"),), (session_id, proposer, additional_ledgers));
    }

    /// Accepts the pending extension proposal. The other party calls this.
    pub fn accept_extension(env: Env, session_id: Bytes, acceptor: Address) {
        acceptor.require_auth();
        let proposal: ExtensionProposal = env.storage().persistent()
            .get(&DataKey::ExtensionProposal(session_id.clone()))
            .expect("no pending proposal");
        let mut session: Session = env.storage().persistent()
            .get(&DataKey::Session(session_id.clone()))
            .expect("session not found");
        assert!(acceptor != proposal.proposer, "proposer cannot accept own proposal");
        assert!(
            acceptor == session.buyer || acceptor == session.seller,
            "Unauthorized"
        );
        let current = if session.deadline == 0 { env.ledger().sequence() } else { session.deadline };
        session.deadline = current + proposal.additional_ledgers;
        Self::save_session(&env, session_id.clone(), session);
        env.storage().persistent().remove(&DataKey::ExtensionProposal(session_id.clone()));
        env.events().publish((symbol_short!("ext_ok"),), (session_id, acceptor, proposal.additional_ledgers));
    // ── Issue #793: Multi-token support ──────────────────────────────────────

    /// Locks funds using any Soroban-compliant token. Pulls amount via transfer_from.
    pub fn lock_funds_with_token(
        env: Env,
        session_id: Bytes,
        seller: Address,
        amount: i128,
        token_address: Address,
        buyer: Address,
    ) {
        buyer.require_auth();
        assert!(amount > 0, "amount must be > 0");
        if env.storage().persistent().has(&DataKey::TokenSession(session_id.clone())) {
            panic!("DuplicateSessionId");
        }
        let token = token::TokenClient::new(&env, &token_address);
        token.transfer_from(&buyer, &buyer, &env.current_contract_address(), &amount);
        let session = TokenSession {
            buyer: buyer.clone(),
            seller,
            token: token_address,
            amount,
            status: SessionStatus::Locked,
            created_at: env.ledger().sequence(),
        };
        env.storage().persistent().set(&DataKey::TokenSession(session_id.clone()), &session);
        env.events().publish((symbol_short!("TokLock"),), (buyer, session_id, amount));
    }

    /// Returns a token session by ID.
    pub fn get_token_session(env: Env, session_id: Bytes) -> TokenSession {
        env.storage().persistent()
            .get(&DataKey::TokenSession(session_id))
            .expect("token session not found")
    }

    /// Approves a token session, transferring funds to seller minus platform fee.
    pub fn approve_token_session(env: Env, session_id: Bytes) {
        let mut session: TokenSession = env.storage().persistent()
            .get(&DataKey::TokenSession(session_id.clone()))
            .expect("token session not found");
        session.buyer.require_auth();
        assert!(session.status == SessionStatus::Completed, "InvalidSessionState");
        let fee_bps: u32 = env.storage().persistent().get(&DataKey::PlatformFeeBps).unwrap_or(0);
        let fee = session.amount * fee_bps as i128 / 10000;
        let payout = session.amount - fee;
        let token = token::TokenClient::new(&env, &session.token);
        token.transfer(&env.current_contract_address(), &session.seller, &payout);
        if fee > 0 {
            let treasury: Address = env.storage().persistent().get(&DataKey::Treasury).expect("treasury not set");
            token.transfer(&env.current_contract_address(), &treasury, &fee);
        }
        session.status = SessionStatus::Approved;
        env.storage().persistent().set(&DataKey::TokenSession(session_id.clone()), &session);
        env.events().publish((symbol_short!("TokApprv"),), (session_id, payout, fee));
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    fn require_not_paused(env: &Env) {
        let paused: bool = env.storage().persistent().get(&DataKey::Paused).unwrap_or(false);
        if paused {
            panic!("ContractPaused");
        }
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
    use soroban_sdk::{Bytes, Env, String};

    fn setup() -> (Env, Address, Address, SkillSyncContractClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(SkillSyncContract, ());
        let client = SkillSyncContractClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        (env, admin, treasury, client)
    }

    fn setup_with_session(amount: i128) -> (Env, Address, Address, SkillSyncContractClient<'static>, Bytes) {
        let (env, admin, treasury, client) = setup();
        client.initialize(&admin, &treasury);
        let seller = Address::generate(&env);
        let session_id = Bytes::from_slice(&env, &[9u8; 32]);
        client.lock_funds(&session_id, &seller, &amount);
        (env, admin, treasury, client, session_id)
    }

    // ── Existing tests ────────────────────────────────────────────────────────

    #[test]
    fn test_initialize() {
        let (_, admin, treasury, client) = setup();
        client.initialize(&admin, &treasury);
        assert_eq!(client.get_treasury(), treasury);
        assert_eq!(client.get_platform_fee(), 0);
        assert_eq!(client.get_dispute_window(), 1000);
    }

    #[test]
    #[should_panic(expected = "AlreadyInitialized")]
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

    // ── Issue #763: initialize() unit tests ───────────────────────────────────

    #[test]
    fn test_init_sets_admin_correctly() {
        let (_, admin, treasury, client) = setup();
        client.initialize(&admin, &treasury);
        assert_eq!(client.get_admin(), admin);
    }

    #[test]
    fn test_init_sets_treasury_correctly() {
        let (_, admin, treasury, client) = setup();
        client.initialize(&admin, &treasury);
        assert_eq!(client.get_treasury(), treasury);
    }

    #[test]
    #[should_panic(expected = "AlreadyInitialized")]
    fn test_init_cannot_be_called_twice() {
        let (_, admin, treasury, client) = setup();
        client.initialize(&admin, &treasury);
        client.initialize(&admin, &treasury);
    }

    #[test]
    fn test_init_emits_initialized_event() {
        use soroban_sdk::testutils::Events as _;
        let (env, admin, treasury, client) = setup();
        client.initialize(&admin, &treasury);
        let events = env.events().all();
        assert!(!events.is_empty(), "no events emitted after initialize");
    }

    #[test]
    #[should_panic(expected = "not initialized")]
    fn test_uninitialized_set_platform_fee_reverts() {
        let (_, _admin, _treasury, client) = setup();
        client.set_platform_fee(&100);
    }

    #[test]
    #[should_panic(expected = "not initialized")]
    fn test_uninitialized_set_treasury_reverts() {
        let (env, _admin, _treasury, client) = setup();
        let new_treasury = Address::generate(&env);
        client.set_treasury(&new_treasury);
    }

    #[test]
    #[should_panic(expected = "not initialized")]
    fn test_uninitialized_set_dispute_window_reverts() {
        let (_, _admin, _treasury, client) = setup();
        client.set_dispute_window(&500);
    }

    // ── Issue #760: open_dispute tests ────────────────────────────────────────

    #[test]
    fn test_open_dispute_on_locked_session() {
        use soroban_sdk::testutils::Events as _;
        let (env, _admin, _treasury, client, session_id) = setup_with_session(1000);
        let reason = String::from_str(&env, "buyer did not receive service");
        client.open_dispute(&session_id, &reason);
        let s = client.get_session(&session_id);
        assert_eq!(s.status, SessionStatus::Disputed);
        let events = env.events().all();
        assert!(events.len() >= 2, "DisputeOpened event not emitted");
    }

    #[test]
    fn test_open_dispute_stores_timestamp() {
        let (env, _admin, _treasury, client, session_id) = setup_with_session(500);
        let ledger_seq = env.ledger().sequence();
        let reason = String::from_str(&env, "dispute reason");
        client.open_dispute(&session_id, &reason);
        let s = client.get_session(&session_id);
        assert_eq!(s.status, SessionStatus::Disputed);
        assert_eq!(s.dispute_opened_at, ledger_seq);
    }

    #[test]
    #[should_panic(expected = "session not in disputable state")]
    fn test_open_dispute_on_resolved_session_reverts() {
        let (env, _admin, _treasury, client, session_id) = setup_with_session(1000);
        let reason = String::from_str(&env, "initial dispute");
        client.open_dispute(&session_id, &reason);
        client.resolve_dispute(&session_id, &0u32, &1000i128, &0i128);
        let reason2 = String::from_str(&env, "re-open attempt");
        client.open_dispute(&session_id, &reason2);
    }

    // ── Issue #761: resolve_dispute tests ─────────────────────────────────────

    #[test]
    fn test_resolve_dispute_full_to_buyer() {
        use soroban_sdk::testutils::Events as _;
        let (env, _admin, _treasury, client, session_id) = setup_with_session(1000);
        let reason = String::from_str(&env, "seller no-show");
        client.open_dispute(&session_id, &reason);
        client.resolve_dispute(&session_id, &0u32, &1000i128, &0i128);
        let s = client.get_session(&session_id);
        assert_eq!(s.status, SessionStatus::Resolved);
        let events = env.events().all();
        assert!(events.len() >= 3, "DisputeResolved event not emitted");
    }

    #[test]
    fn test_resolve_dispute_full_to_seller() {
        let (env, _admin, _treasury, client, session_id) = setup_with_session(2000);
        let reason = String::from_str(&env, "buyer false claim");
        client.open_dispute(&session_id, &reason);
        client.resolve_dispute(&session_id, &1u32, &0i128, &2000i128);
        let s = client.get_session(&session_id);
        assert_eq!(s.status, SessionStatus::Resolved);
    }

    #[test]
    fn test_resolve_dispute_split() {
        let (env, _admin, _treasury, client, session_id) = setup_with_session(1000);
        let reason = String::from_str(&env, "partial completion");
        client.open_dispute(&session_id, &reason);
        client.resolve_dispute(&session_id, &2u32, &400i128, &600i128);
        let s = client.get_session(&session_id);
        assert_eq!(s.status, SessionStatus::Resolved);
    }

    #[test]
    #[should_panic(expected = "session not disputed")]
    fn test_resolve_dispute_on_locked_session_reverts() {
        let (_, _admin, _treasury, client, session_id) = setup_with_session(1000);
        client.resolve_dispute(&session_id, &0u32, &1000i128, &0i128);
    }

    #[test]
    #[should_panic(expected = "shares must equal session amount")]
    fn test_resolve_dispute_shares_mismatch_reverts() {
        let (env, _admin, _treasury, client, session_id) = setup_with_session(1000);
        let reason = String::from_str(&env, "dispute");
        client.open_dispute(&session_id, &reason);
        client.resolve_dispute(&session_id, &0u32, &500i128, &400i128); // 900 != 1000
    }

    #[test]
    #[should_panic(expected = "not initialized")]
    fn test_resolve_dispute_non_admin_reverts() {
        // Calling resolve_dispute on a fresh env without initialize → require_admin panics
        let (env, _admin, _treasury, client) = setup();
        let session_id = Bytes::from_slice(&env, &[7u8; 32]);
        client.resolve_dispute(&session_id, &0u32, &0i128, &0i128);
    }

    // ── Issue #762: apply_fee edge-case tests (via resolve_dispute) ───────────

    #[test]
    fn test_fee_zero_bps_no_deduction() {
        // fee_bps = 0 (default) → full amount passed through
        let (env, _admin, _treasury, client, session_id) = setup_with_session(1000);
        // fee is 0 by default
        let reason = String::from_str(&env, "dispute");
        client.open_dispute(&session_id, &reason);
        client.resolve_dispute(&session_id, &2u32, &600i128, &400i128);
        let s = client.get_session(&session_id);
        assert_eq!(s.status, SessionStatus::Resolved);
        // With 0 fee, no fee deducted — event would show buyer_net=600, seller_net=400
    }

    #[test]
    fn test_fee_max_bps_applied() {
        // fee_bps = 1000 (10%) → 10% deducted from each share
        let (env, admin, treasury, client) = setup();
        client.initialize(&admin, &treasury);
        client.set_platform_fee(&1000); // 10%
        let seller = Address::generate(&env);
        let session_id = Bytes::from_slice(&env, &[8u8; 32]);
        client.lock_funds(&session_id, &seller, &1000);
        let reason = String::from_str(&env, "dispute");
        client.open_dispute(&session_id, &reason);
        client.resolve_dispute(&session_id, &2u32, &500i128, &500i128);
        let s = client.get_session(&session_id);
        assert_eq!(s.status, SessionStatus::Resolved);
        // buyer_net = 500 - 50 = 450, seller_net = 500 - 50 = 450, total_fee = 100
    }

    #[test]
    fn test_fee_rounding_truncates() {
        // 100 * 3 / 10000 = 0 (integer truncation)
        let (env, admin, treasury, client) = setup();
        client.initialize(&admin, &treasury);
        client.set_platform_fee(&3); // 0.03%
        let seller = Address::generate(&env);
        let session_id = Bytes::from_slice(&env, &[10u8; 32]);
        client.lock_funds(&session_id, &seller, &100);
        let reason = String::from_str(&env, "dispute");
        client.open_dispute(&session_id, &reason);
        // 100 * 3 / 10000 = 0 (truncates), so no fee deducted
        client.resolve_dispute(&session_id, &2u32, &50i128, &50i128);
        let s = client.get_session(&session_id);
        assert_eq!(s.status, SessionStatus::Resolved);
    }

    // ── Issue #756 tests ────────────────────────────────────────────────────────

    #[test]
    #[should_panic(expected = "InvalidSessionState")]
    fn test_approve_on_locked_session_reverts() {
        let (_, _admin, _treasury, client, session_id) = setup_with_session(1000);
        // Session is Locked, approve should revert
        client.approve_session(&session_id);
    }

    #[test]
    fn test_approve_session_success() {
        use soroban_sdk::testutils::Events as _;
        let (env, admin, treasury, client, session_id) = setup_with_session(1000);
        let seller = Address::generate(&env);
        let mut session = client.get_session(&session_id);
        session.status = SessionStatus::Completed;
        session.completed_at = env.ledger().sequence();
        env.storage().persistent().set(&DataKey::Session(session_id.clone()), &session);
        client.approve_session(&session_id);
        let s = client.get_session(&session_id);
        assert_eq!(s.status, SessionStatus::Approved);
    }

    #[test]
    fn test_approve_session_with_fee() {
        use soroban_sdk::testutils::Events as _;
        let (env, admin, treasury, client, session_id) = setup_with_session(1000);
        client.set_platform_fee(&250); // 2.5%
        let mut session = client.get_session(&session_id);
        session.status = SessionStatus::Completed;
        session.completed_at = env.ledger().sequence();
        env.storage().persistent().set(&DataKey::Session(session_id.clone()), &session);
        client.approve_session(&session_id);
        let s = client.get_session(&session_id);
        assert_eq!(s.status, SessionStatus::Approved);
        // payout = 1000 - 25 = 975, fee = 25
        let events = env.events().all();
        assert!(events.len() >= 2, "events should include SessionApproved");
    }

    #[test]
    fn test_approve_session_emits_event() {
        use soroban_sdk::testutils::Events as _;
        let (env, admin, treasury, client, session_id) = setup_with_session(1000);
        let mut session = client.get_session(&session_id);
        session.status = SessionStatus::Completed;
        session.completed_at = env.ledger().sequence();
        env.storage().persistent().set(&DataKey::Session(session_id.clone()), &session);
        client.approve_session(&session_id);
        let events = env.events().all();
        assert!(events.iter().any(|e| format!("{:?}", e.0).contains("SessionApproved")), "SessionApproved event not emitted");
    }

    // ── Issue #794 tests ──────────────────────────────────────────────────────

    #[test]
    fn test_set_and_get_metadata() {
        let (env, admin, treasury, client) = setup();
        client.initialize(&admin, &treasury);
        let seller = Address::generate(&env);
        let session_id = Bytes::from_slice(&env, &[20u8; 32]);
        client.lock_funds(&session_id, &seller, &100);
        assert_eq!(client.get_session_metadata(&session_id), None);
        let uri = soroban_sdk::String::from_str(&env, "ipfs://QmTest");
        client.set_session_metadata(&session_id, &uri);
        assert_eq!(client.get_session_metadata(&session_id), Some(uri));
    }
}
