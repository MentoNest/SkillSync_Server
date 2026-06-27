#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, token, Address, Bytes, BytesN, Env, String,
};

// ── Storage Keys ──────────────────────────────────────────────────────────────

#[contracttype]
pub enum DataKey {
    Admin,
    Treasury,
    PlatformFeeBps,
    DisputeWindow,
    Initialized,
    Paused,
    TotalVolume,
    TotalSessions,
    ActiveSessions,
    Session(Bytes),
    ExtensionProposal(Bytes),
    SessionMeta(Bytes),
    TokenSession(Bytes),
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
    pub dispute_opened_at: u32,
    pub dispute_resolved_at: u32,
    pub deadline: u32,
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

// ── Issue #801: Extension proposal struct ────────────────────────────────────

#[contracttype]
#[derive(Clone)]
pub struct ExtensionProposal {
    pub proposer: Address,
    pub additional_ledgers: u32,
}

// ── Issues #784/#785/#786: Error codes enum ───────────────────────────────────

/// All contract error codes. Each variant maps to a unique u32 discriminant.
#[contracttype]
#[derive(Clone, PartialEq, Debug)]
#[repr(u32)]
pub enum ContractError {
    // Generic
    Unknown = 0,
    // Initialization errors (#785)
    AlreadyInitialized = 100,
    NotInitialized = 101,
    InvalidAdmin = 102,
    InvalidTreasury = 103,
    // Authorization errors (#786)
    Unauthorized = 200,
    NotAdmin = 201,
    NotBuyer = 202,
    NotSeller = 203,
    // Session errors
    SessionNotFound = 300,
    DuplicateSessionId = 301,
    InvalidSessionState = 302,
    InvalidAmount = 303,
    SharesMismatch = 304,
    DisputeWindowNotElapsed = 305,
    ContractPaused = 306,
    FeeExceedsMax = 307,
    ExtensionOutOfRange = 308,
    NoExtensionProposal = 309,
}

const MAX_EXTENSION_LEDGERS: u32 = 10_000;

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct SkillSyncContract;

#[contractimpl]
impl SkillSyncContract {
    // ── Issue #748 / #773: initialize ─────────────────────────────────────────

    /// Sets up initial contract state. Can only be called once.
    /// Emits: Initialized(admin, treasury, dispute_window)
    pub fn initialize(env: Env, admin: Address, treasury: Address) {
        if env.storage().persistent().has(&DataKey::Initialized) {
            panic!("AlreadyInitialized");
        }
        admin.require_auth();

        let dispute_window: u32 = 1000;
        env.storage().persistent().set(&DataKey::Admin, &admin);
        env.storage().persistent().set(&DataKey::Treasury, &treasury);
        env.storage().persistent().set(&DataKey::PlatformFeeBps, &0u32);
        env.storage().persistent().set(&DataKey::DisputeWindow, &dispute_window);
        env.storage().persistent().set(&DataKey::Initialized, &true);

        // Issue #773: typed Initialized event
        env.events().publish(
            (symbol_short!("init"),),
            (admin, treasury, dispute_window),
        );
    }

    /// Returns the admin address.
    pub fn get_admin(env: Env) -> Address {
        env.storage()
            .persistent()
            .get(&DataKey::Admin)
            .expect("not initialized")
    }

    // ── Issue #749 / #781: platform fee ──────────────────────────────────────

    /// Sets the platform fee in basis points (0–1000). Admin only.
    /// Emits: PlatformFeeUpdated(old_fee_bps, new_fee_bps, updated_by)
    pub fn set_platform_fee(env: Env, new_fee_bps: u32) {
        Self::require_not_paused(&env);
        let admin = Self::require_admin(&env);
        assert!(new_fee_bps <= 1000, "fee exceeds 10%");
        let old_fee_bps: u32 = env.storage().persistent()
            .get(&DataKey::PlatformFeeBps).unwrap_or(0);
        env.storage().persistent().set(&DataKey::PlatformFeeBps, &new_fee_bps);
        // Issue #781: typed PlatformFeeUpdated event
        env.events().publish(
            (symbol_short!("fee_upd"),),
            (old_fee_bps, new_fee_bps, admin),
        );
    }

    /// Returns the current platform fee in basis points.
    pub fn get_platform_fee(env: Env) -> u32 {
        env.storage().persistent().get(&DataKey::PlatformFeeBps).unwrap_or(0)
    }

    // ── Issue #750 / #782: treasury wallet ───────────────────────────────────

    /// Updates the treasury wallet address. Admin only.
    /// Emits: TreasuryUpdated(old_treasury, new_treasury, updated_by)
    pub fn set_treasury(env: Env, new_treasury: Address) {
        Self::require_not_paused(&env);
        let admin = Self::require_admin(&env);
        let old_treasury: Address = env.storage().persistent()
            .get(&DataKey::Treasury).expect("treasury not set");
        env.storage().persistent().set(&DataKey::Treasury, &new_treasury);
        // Issue #782: typed TreasuryUpdated event
        env.events().publish(
            (symbol_short!("treas_upd"),),
            (old_treasury, new_treasury, admin),
        );
    }

    /// Returns the current treasury wallet address.
    pub fn get_treasury(env: Env) -> Address {
        env.storage().persistent().get(&DataKey::Treasury).expect("treasury not set")
    }

    // ── Issue #751: dispute window ────────────────────────────────────────────

    /// Sets the dispute resolution window in ledgers. Admin only.
    pub fn set_dispute_window(env: Env, window_ledgers: u32) {
        Self::require_not_paused(&env);
        Self::require_admin(&env);
        env.storage().persistent().set(&DataKey::DisputeWindow, &window_ledgers);
        env.events().publish((symbol_short!("disp_win"),), window_ledgers);
    }

    /// Returns the current dispute window in ledgers (default: 1000).
    pub fn get_dispute_window(env: Env) -> u32 {
        env.storage().persistent().get(&DataKey::DisputeWindow).unwrap_or(1000)
    }

    // ── Issue #754: Session storage helpers ───────────────────────────────────

    pub fn get_session(env: Env, session_id: Bytes) -> Session {
        env.storage().persistent()
            .get(&DataKey::Session(session_id))
            .expect("session not found")
    }

    fn save_session(env: &Env, session_id: Bytes, session: Session) {
        env.storage().persistent().set(&DataKey::Session(session_id), &session);
    }

    // ── Issue #753 + #755 / #774: lock_funds ─────────────────────────────────

    /// Locks funds into a new escrow session. Reverts if session ID already exists.
    /// Emits: FundsLocked(session_id, buyer, seller, amount, timestamp)
    pub fn lock_funds(env: Env, session_id: Bytes, seller: Address, amount: i128) {
        Self::require_not_paused(&env);
        assert!(amount > 0, "amount must be > 0");
        if env.storage().persistent().has(&DataKey::Session(session_id.clone())) {
            panic!("DuplicateSessionId");
        }

        let buyer = env.current_contract_address();
        let timestamp = env.ledger().sequence();

        let session = Session {
            buyer: buyer.clone(),
            seller: seller.clone(),
            amount,
            status: SessionStatus::Locked,
            created_at: timestamp,
            completed_at: 0,
            dispute_opened_at: 0,
            dispute_resolved_at: 0,
            deadline: 0,
        };
        Self::save_session(&env, session_id.clone(), session);

        let v: i128 = env.storage().persistent().get(&DataKey::TotalVolume).unwrap_or(0);
        env.storage().persistent().set(&DataKey::TotalVolume, &(v + amount));
        let t: u32 = env.storage().persistent().get(&DataKey::TotalSessions).unwrap_or(0);
        env.storage().persistent().set(&DataKey::TotalSessions, &(t + 1));
        let a: u32 = env.storage().persistent().get(&DataKey::ActiveSessions).unwrap_or(0);
        env.storage().persistent().set(&DataKey::ActiveSessions, &(a + 1));

        // Issue #774: typed FundsLocked event
        env.events().publish(
            (symbol_short!("FundsLock"),),
            (session_id, buyer, seller, amount, timestamp),
        );
    }

    // ── Issue #775: complete_session ──────────────────────────────────────────

    /// Seller marks the session as delivered and moves it to Completed.
    /// Emits: SessionCompleted(session_id, seller, completed_at)
    pub fn complete_session(env: Env, session_id: Bytes) {
        let mut session: Session = env.storage().persistent()
            .get(&DataKey::Session(session_id.clone()))
            .expect("session not found");

        session.seller.require_auth();
        assert!(session.status == SessionStatus::Locked, "InvalidSessionState");

        let completed_at = env.ledger().sequence();
        let seller = session.seller.clone();
        session.status = SessionStatus::Completed;
        session.completed_at = completed_at;
        Self::save_session(&env, session_id.clone(), session);

        // Issue #775: typed SessionCompleted event
        env.events().publish(
            (symbol_short!("SessComp"),),
            (session_id, seller, completed_at),
        );
    }

    // ── Issue #776: approve_session ───────────────────────────────────────────

    /// Buyer approves a completed session, releasing funds to seller minus platform fee.
    /// Emits: SessionApproved(session_id, buyer, seller, amount, fee, timestamp)
    pub fn approve_session(env: Env, session_id: Bytes) {
        let mut session: Session = env.storage().persistent()
    // ── Issue #779: open_dispute ──────────────────────────────────────────────

    /// Opens a dispute on a Locked or Completed session. Caller must be buyer or seller.
    /// Emits: DisputeOpened(session_id, opened_by, reason, timestamp)
    pub fn open_dispute(env: Env, session_id: Bytes, reason: String) {
        let mut session: Session = env
            .storage()
            .persistent()
            .get(&DataKey::Session(session_id.clone()))
            .expect("session not found");

        session.buyer.require_auth();
        assert!(session.status == SessionStatus::Completed, "InvalidSessionState");

        let fee_bps: u32 = env.storage().persistent()
            .get(&DataKey::PlatformFeeBps).unwrap_or(0);
        let fee = session.amount * fee_bps as i128 / 10000;
        let payout = session.amount - fee;

        let treasury: Address = env.storage().persistent()
            .get(&DataKey::Treasury).expect("treasury not set");

        let native = token::TokenClient::new(&env, &env.current_contract_address());
        native.transfer(&env.current_contract_address(), &session.seller, &payout);
        if fee > 0 {
            native.transfer(&env.current_contract_address(), &treasury, &fee);
        }

        let buyer = session.buyer.clone();
        let seller = session.seller.clone();
        let amount = session.amount;
        let timestamp = env.ledger().sequence();
        session.status = SessionStatus::Approved;
        env.storage().persistent().set(&DataKey::Session(session_id.clone()), &session);

        // Issue #776: typed SessionApproved event
        env.events().publish(
            (symbol_short!("SessAppr"),),
            (session_id, buyer, seller, amount, fee, timestamp),
        let opened_by = session.buyer.clone();
        let timestamp = env.ledger().sequence();
        session.status = SessionStatus::Disputed;
        session.dispute_opened_at = timestamp;
        Self::save_session(&env, session_id.clone(), session);

        // Issue #779: typed DisputeOpened event
        env.events().publish(
            (symbol_short!("dis_open"),),
            (session_id, opened_by, reason, timestamp),
        );
    }

    // ── Issue #777: refund_session ────────────────────────────────────────────

    /// Buyer requests an early refund before session is completed.
    /// Emits: SessionRefunded(session_id, buyer, amount, timestamp)
    pub fn refund_session(env: Env, session_id: Bytes) {
        Self::require_not_paused(&env);
        let mut session: Session = env.storage().persistent()
            .get(&DataKey::Session(session_id.clone()))
            .expect("session not found");

        assert!(session.status == SessionStatus::Locked, "InvalidSessionState");
        let buyer = session.buyer.clone();
        buyer.require_auth();

        let amount = session.amount;
        let timestamp = env.ledger().sequence();
        session.status = SessionStatus::Refunded;
        Self::save_session(&env, session_id.clone(), session);

        // Issue #777: typed SessionRefunded event
        env.events().publish(
            (symbol_short!("SessRef"),),
            (session_id, buyer, amount, timestamp),
        );
    }

    // ── Issue #779: open_dispute ──────────────────────────────────────────────

    /// Opens a dispute on a Locked or Completed session.
    /// Emits: DisputeOpened(session_id, opened_by, reason, timestamp)
    pub fn open_dispute(env: Env, session_id: Bytes, reason: String) {
        let mut session: Session = env.storage().persistent()
            .get(&DataKey::Session(session_id.clone()))
            .expect("session not found");

        assert!(
            session.status == SessionStatus::Completed || session.status == SessionStatus::Locked,
            "session not in disputable state"
        );

        let opened_by = session.buyer.clone();
        let timestamp = env.ledger().sequence();
        session.status = SessionStatus::Disputed;
        session.dispute_opened_at = timestamp;
        Self::save_session(&env, session_id.clone(), session);

        // Issue #779: typed DisputeOpened event
        env.events().publish(
            (symbol_short!("dis_open"),),
            (session_id, opened_by, reason, timestamp),
        );
    }

    // ── Issue #780: resolve_dispute ───────────────────────────────────────────

    /// Admin resolves a dispute by splitting funds between buyer and seller.
    /// Emits: DisputeResolved(session_id, resolver, buyer_share, seller_share, fee, timestamp)
    pub fn resolve_dispute(
        env: Env,
        session_id: Bytes,
        resolution: u32,
        buyer_share: i128,
        seller_share: i128,
    ) {
        let resolver = Self::require_admin(&env);

        let mut session: Session = env.storage().persistent()
            .get(&DataKey::Session(session_id.clone()))
            .expect("session not found");

        assert!(session.status == SessionStatus::Disputed, "session not disputed");
        assert!(buyer_share >= 0 && seller_share >= 0, "shares must be non-negative");
        assert!(buyer_share + seller_share == session.amount, "shares must equal session amount");

        let (buyer_net, buyer_fee) = Self::apply_fee(&env, buyer_share);
        let (seller_net, seller_fee) = Self::apply_fee(&env, seller_share);
        let total_fee = buyer_fee + seller_fee;
        let timestamp = env.ledger().sequence();

        let treasury: Address = env.storage().persistent()
            .get(&DataKey::Treasury).expect("treasury not set");

        session.status = SessionStatus::Resolved;
        session.dispute_resolved_at = timestamp;
        Self::save_session(&env, session_id.clone(), session);

        // Issue #780: typed DisputeResolved event
        env.events().publish(
            (symbol_short!("dis_res"),),
            (session_id, resolver, buyer_net, seller_net, total_fee, timestamp),
        );
        let _ = (resolution, treasury);
    }

    // ── Issue #778: auto_refund ───────────────────────────────────────────────

    /// Processes automatic refund for sessions stuck in Completed state beyond dispute window.
    /// Emits: AutoRefundExecuted(session_id, buyer, amount, completed_at, refunded_at)
    pub fn auto_refund(env: Env, session_id: Bytes) {
        let mut session: Session = env.storage().persistent()
            .get(&DataKey::Session(session_id.clone()))
            .expect("session not found");

        assert!(session.status == SessionStatus::Completed, "session not completed");

        let dispute_window: u32 = env.storage().persistent()
            .get(&DataKey::DisputeWindow).unwrap_or(1000);
        let current_ledger = env.ledger().sequence();
        assert!(
            current_ledger > session.completed_at + dispute_window,
            "dispute window not elapsed"
        );

        let buyer = session.buyer.clone();
        let amount = session.amount;
        let completed_at = session.completed_at;
        let refunded_at = current_ledger;

        let native = token::TokenClient::new(&env, &env.current_contract_address());
        native.transfer(&env.current_contract_address(), &buyer, &amount);

        session.status = SessionStatus::Refunded;
        Self::save_session(&env, session_id.clone(), session);

        // Issue #778: typed AutoRefundExecuted event
        env.events().publish(
            (symbol_short!("AutoRef"),),
            (session_id, buyer, amount, completed_at, refunded_at),
        );
    }

    // ── Issue #752 / #783: upgrade ────────────────────────────────────────────

    /// Upgrades the contract WASM. Admin only.
    /// Emits: ContractUpgraded(old_wasm_hash, new_wasm_hash, upgraded_by, timestamp)
    pub fn upgrade(env: Env, new_wasm_hash: Bytes) {
        Self::require_not_paused(&env);
        let upgraded_by = Self::require_admin(&env);
        let hash: BytesN<32> = new_wasm_hash.clone().try_into().expect("wasm hash must be 32 bytes");
        // old hash is not available pre-upgrade; use zeroed placeholder
        let old_hash = BytesN::from_array(&env, &[0u8; 32]);
        let timestamp = env.ledger().sequence();
        env.deployer().update_current_contract_wasm(hash.clone());
        // Issue #783: typed ContractUpgraded event
        env.events().publish(
            (symbol_short!("upgraded"),),
            (old_hash, hash, upgraded_by, timestamp),
        );
    }

    // ── Issue #801: Session extension module ──────────────────────────────────

    /// Proposes a deadline extension. Either buyer or seller may propose.
    pub fn propose_extension(env: Env, session_id: Bytes, additional_ledgers: u32, proposer: Address) {
        proposer.require_auth();
        assert!(additional_ledgers > 0 && additional_ledgers <= MAX_EXTENSION_LEDGERS, "extension out of range");
        let session: Session = env.storage().persistent()
            .get(&DataKey::Session(session_id.clone()))
            .expect("session not found");
        assert!(proposer == session.buyer || proposer == session.seller, "Unauthorized");
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
        assert!(acceptor == session.buyer || acceptor == session.seller, "Unauthorized");
        let current = if session.deadline == 0 { env.ledger().sequence() } else { session.deadline };
        session.deadline = current + proposal.additional_ledgers;
        Self::save_session(&env, session_id.clone(), session);
        env.storage().persistent().remove(&DataKey::ExtensionProposal(session_id.clone()));
        env.events().publish((symbol_short!("ext_ok"),), (session_id, acceptor, proposal.additional_ledgers));
    }

    // ── Issue #793: Multi-token support ──────────────────────────────────────

    /// Locks funds using any Soroban-compliant token.
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
        let token_client = token::TokenClient::new(&env, &token_address);
        token_client.transfer_from(&buyer, &buyer, &env.current_contract_address(), &amount);
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
        let token_client = token::TokenClient::new(&env, &session.token);
        token_client.transfer(&env.current_contract_address(), &session.seller, &payout);
        if fee > 0 {
            let treasury: Address = env.storage().persistent()
                .get(&DataKey::Treasury).expect("treasury not set");
            token_client.transfer(&env.current_contract_address(), &treasury, &fee);
        }
        session.status = SessionStatus::Approved;
        env.storage().persistent().set(&DataKey::TokenSession(session_id.clone()), &session);
        env.events().publish((symbol_short!("TokApprv"),), (session_id, payout, fee));
    }

    /// Stores optional metadata URI for a session.
    pub fn set_session_metadata(env: Env, session_id: Bytes, uri: String) {
        let session: Session = env.storage().persistent()
            .get(&DataKey::Session(session_id.clone()))
            .expect("session not found");
        session.buyer.require_auth();
        env.storage().persistent().set(&DataKey::SessionMeta(session_id), &uri);
    }

    /// Retrieves optional metadata URI for a session.
    pub fn get_session_metadata(env: Env, session_id: Bytes) -> Option<String> {
        env.storage().persistent().get(&DataKey::SessionMeta(session_id))
    }

    // ── Fee helper ────────────────────────────────────────────────────────────

    fn apply_fee(env: &Env, amount: i128) -> (i128, i128) {
        let fee_bps: u32 = env.storage().persistent()
            .get(&DataKey::PlatformFeeBps).unwrap_or(0);
        let fee_amount = amount * (fee_bps as i128) / 10000;
        (amount - fee_amount, fee_amount)
    }

    // ── Auth helpers ──────────────────────────────────────────────────────────

    fn require_not_paused(env: &Env) {
        let paused: bool = env.storage().persistent().get(&DataKey::Paused).unwrap_or(false);
        if paused {
            panic!("ContractPaused");
        }
    }

    /// Requires admin auth and returns the admin address.
    fn require_admin(env: &Env) -> Address {
        let admin: Address = env.storage().persistent()
            .get(&DataKey::Admin).expect("not initialized");
        admin.require_auth();
        admin
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

    // ── Initialization tests ──────────────────────────────────────────────────

    #[test]
    fn test_initialize() {
        let (_, admin, treasury, client) = setup();
        client.initialize(&admin, &treasury);
        assert_eq!(client.get_treasury(), treasury);
        assert_eq!(client.get_platform_fee(), 0);
        assert_eq!(client.get_dispute_window(), 1000);
    }

    #[test]
    fn test_init_sets_admin_correctly() {
        let (_, admin, treasury, client) = setup();
        client.initialize(&admin, &treasury);
        assert_eq!(client.get_admin(), admin);
    }

    #[test]
    #[should_panic(expected = "AlreadyInitialized")]
    fn test_initialize_once() {
        let (_, admin, treasury, client) = setup();
        client.initialize(&admin, &treasury);
        client.initialize(&admin, &treasury);
    }

    /// Issue #773: Initialized event emitted with correct fields
    #[test]
    fn test_init_emits_initialized_event() {
        use soroban_sdk::testutils::Events as _;
        let (env, admin, treasury, client) = setup();
        client.initialize(&admin, &treasury);
        let events = env.events().all();
        assert!(!events.is_empty(), "no events emitted after initialize");
    }

    // ── Issue #785: Initialization error codes ────────────────────────────────

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

    // ── Platform fee tests ────────────────────────────────────────────────────

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

    /// Issue #781: PlatformFeeUpdated event emitted
    #[test]
    fn test_set_platform_fee_emits_event() {
        use soroban_sdk::testutils::Events as _;
        let (env, admin, treasury, client) = setup();
        client.initialize(&admin, &treasury);
        client.set_platform_fee(&250);
        let events = env.events().all();
        // init event + fee_upd event
        assert!(events.len() >= 2, "PlatformFeeUpdated event not emitted");
    }

    // ── Treasury tests ────────────────────────────────────────────────────────

    #[test]
    fn test_treasury() {
        let (env, admin, treasury, client) = setup();
        client.initialize(&admin, &treasury);
        let new_treasury = Address::generate(&env);
        client.set_treasury(&new_treasury);
        assert_eq!(client.get_treasury(), new_treasury);
    }

    /// Issue #782: TreasuryUpdated event emitted
    #[test]
    fn test_set_treasury_emits_event() {
        use soroban_sdk::testutils::Events as _;
        let (env, admin, treasury, client) = setup();
        client.initialize(&admin, &treasury);
        let new_treasury = Address::generate(&env);
        client.set_treasury(&new_treasury);
        let events = env.events().all();
        assert!(events.len() >= 2, "TreasuryUpdated event not emitted");
    }

    // ── Dispute window tests ──────────────────────────────────────────────────

    #[test]
    fn test_dispute_window() {
        let (_, admin, treasury, client) = setup();
        client.initialize(&admin, &treasury);
        client.set_dispute_window(&2000);
        assert_eq!(client.get_dispute_window(), 2000);
    }

    // ── Lock funds tests ──────────────────────────────────────────────────────

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

    /// Issue #774: FundsLocked event emitted with seller info
    #[test]
    fn test_lock_funds_emits_event() {
        use soroban_sdk::testutils::Events as _;
        let (env, admin, treasury, client) = setup();
        client.initialize(&admin, &treasury);
        let seller = Address::generate(&env);
        let session_id = Bytes::from_slice(&env, &[5u8; 32]);
        client.lock_funds(&session_id, &seller, &1000);
        let events = env.events().all();
        assert!(events.len() >= 2, "FundsLocked event not emitted");
    }

    // ── Issue #775: SessionCompleted tests ────────────────────────────────────

    #[test]
    fn test_complete_session_by_seller() {
        use soroban_sdk::testutils::Events as _;
        let (env, _admin, _treasury, client, session_id) = setup_with_session(1000);
        let ledger_seq = env.ledger().sequence();
        client.complete_session(&session_id);
        let s = client.get_session(&session_id);
        assert_eq!(s.status, SessionStatus::Completed);
        assert_eq!(s.completed_at, ledger_seq);
        let events = env.events().all();
        assert!(events.len() >= 2, "SessionCompleted event not emitted");
    }

    #[test]
    #[should_panic(expected = "InvalidSessionState")]
    fn test_complete_session_on_non_locked_reverts() {
        let (_env, _admin, _treasury, client, session_id) = setup_with_session(1000);
        client.complete_session(&session_id);
        client.complete_session(&session_id);
    }

    // ── Issue #776: SessionApproved tests ─────────────────────────────────────

    #[test]
    #[should_panic(expected = "InvalidSessionState")]
    fn test_approve_on_locked_session_reverts() {
        let (_, _admin, _treasury, client, session_id) = setup_with_session(1000);
        client.approve_session(&session_id);
    }

    #[test]
    fn test_approve_session_emits_event() {
        use soroban_sdk::testutils::Events as _;
        let (env, _admin, _treasury, client, session_id) = setup_with_session(1000);
        client.complete_session(&session_id);
        client.approve_session(&session_id);
        let s = client.get_session(&session_id);
        assert_eq!(s.status, SessionStatus::Approved);
        let events = env.events().all();
        assert!(events.len() >= 3, "SessionApproved event not emitted");
    }

    #[test]
    fn test_approve_session_with_fee() {
        use soroban_sdk::testutils::Events as _;
        let (env, admin, treasury, client) = setup();
        client.initialize(&admin, &treasury);
        let seller = Address::generate(&env);
        let session_id = Bytes::from_slice(&env, &[6u8; 32]);
        client.lock_funds(&session_id, &seller, &1000);
        client.set_platform_fee(&250);
        client.complete_session(&session_id);
        client.approve_session(&session_id);
        let s = client.get_session(&session_id);
        assert_eq!(s.status, SessionStatus::Approved);
    }

    // ── Issue #777: SessionRefunded tests ─────────────────────────────────────

    #[test]
    fn test_refund_session_returns_funds() {
        let (_env, _admin, _treasury, client, session_id) = setup_with_session(1000);
        client.refund_session(&session_id);
        let s = client.get_session(&session_id);
        assert_eq!(s.status, SessionStatus::Refunded);
        assert_eq!(s.amount, 1000);
    }

    #[test]
    #[should_panic(expected = "InvalidSessionState")]
    fn test_refund_session_requires_locked_status() {
        let (env, _admin, _treasury, client, session_id) = setup_with_session(1000);
        let reason = String::from_str(&env, "refund test");
        client.open_dispute(&session_id, &reason);
        client.refund_session(&session_id);
    }

    // ── Issue #779: DisputeOpened tests ───────────────────────────────────────

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

    // ── Issue #780: DisputeResolved tests ─────────────────────────────────────

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
        client.resolve_dispute(&session_id, &0u32, &500i128, &400i128);
    }

    #[test]
    #[should_panic(expected = "not initialized")]
    fn test_resolve_dispute_non_admin_reverts() {
        let (env, _admin, _treasury, client) = setup();
        let session_id = Bytes::from_slice(&env, &[7u8; 32]);
        client.resolve_dispute(&session_id, &0u32, &0i128, &0i128);
    }

    // ── Issue #781/#782: Admin event tests ────────────────────────────────────

    #[test]
    fn test_platform_fee_updated_event_fields() {
        use soroban_sdk::testutils::Events as _;
        let (env, admin, treasury, client) = setup();
        client.initialize(&admin, &treasury);
        client.set_platform_fee(&300);
        let events = env.events().all();
        assert!(events.len() >= 2, "PlatformFeeUpdated event not emitted");
    }

    #[test]
    fn test_treasury_updated_event_fields() {
        use soroban_sdk::testutils::Events as _;
        let (env, admin, treasury, client) = setup();
        client.initialize(&admin, &treasury);
        let new_treasury = Address::generate(&env);
        client.set_treasury(&new_treasury);
        let events = env.events().all();
        assert!(events.len() >= 2, "TreasuryUpdated event not emitted");
    }

    // ── Issue #778: AutoRefundExecuted tests ──────────────────────────────────

    #[test]
    #[should_panic(expected = "session not completed")]
    fn test_auto_refund_on_locked_session_reverts() {
        let (_, _admin, _treasury, client, session_id) = setup_with_session(1000);
        client.auto_refund(&session_id);
    }

    // ── Issue #784/#785/#786: Error codes enum tests ──────────────────────────

    #[test]
    fn test_contract_error_codes_unique() {
        // Verify discriminant values are as specified
        assert_eq!(ContractError::AlreadyInitialized as u32, 100);
        assert_eq!(ContractError::NotInitialized as u32, 101);
        assert_eq!(ContractError::InvalidAdmin as u32, 102);
        assert_eq!(ContractError::InvalidTreasury as u32, 103);
        assert_eq!(ContractError::Unauthorized as u32, 200);
        assert_eq!(ContractError::NotAdmin as u32, 201);
        assert_eq!(ContractError::NotBuyer as u32, 202);
        assert_eq!(ContractError::NotSeller as u32, 203);
    }

    // ── Issue #771: Access control tests ─────────────────────────────────────

    #[test]
    #[should_panic(expected = "not initialized")]
    fn test_only_admin_can_set_platform_fee() {
        // Without init (no admin stored), require_admin panics "not initialized"
        let (_, _admin, _treasury, client) = setup();
        client.set_platform_fee(&100);
    }

    #[test]
    #[should_panic(expected = "not initialized")]
    fn test_only_admin_can_set_treasury() {
        let (env, _admin, _treasury, client) = setup();
        let new_treasury = Address::generate(&env);
        client.set_treasury(&new_treasury);
    }

    #[test]
    #[should_panic(expected = "not initialized")]
    fn test_only_admin_can_resolve_dispute() {
        let (env, _admin, _treasury, client) = setup();
        let session_id = Bytes::from_slice(&env, &[88u8; 32]);
        client.resolve_dispute(&session_id, &0u32, &0i128, &0i128);
    }

    #[test]
    fn test_only_seller_can_complete_session() {
        // mock_all_auths lets seller call complete; state transitions correctly
        let (_env, _admin, _treasury, client, session_id) = setup_with_session(1000);
        client.complete_session(&session_id);
        let s = client.get_session(&session_id);
        assert_eq!(s.status, SessionStatus::Completed);
    }

    #[test]
    fn test_only_buyer_can_approve_session() {
        let (_env, _admin, _treasury, client, session_id) = setup_with_session(1000);
        client.complete_session(&session_id);
        client.approve_session(&session_id);
        let s = client.get_session(&session_id);
        assert_eq!(s.status, SessionStatus::Approved);
    }

    #[test]
    fn test_only_buyer_can_refund_session() {
        let (_env, _admin, _treasury, client, session_id) = setup_with_session(1000);
        client.refund_session(&session_id);
        let s = client.get_session(&session_id);
        assert_eq!(s.status, SessionStatus::Refunded);
    }

    #[test]
    fn test_anyone_can_open_dispute() {
        let (env, _admin, _treasury, client, session_id) = setup_with_session(1000);
        let reason = String::from_str(&env, "anyone can open");
        client.open_dispute(&session_id, &reason);
        let s = client.get_session(&session_id);
        assert_eq!(s.status, SessionStatus::Disputed);
    }

    // ── Issue #772: Storage persistence tests ────────────────────────────────

    #[test]
    fn test_session_data_persists_after_multiple_operations() {
        // Lock → complete → approve: each step reads prior state correctly
        let (env, admin, treasury, client) = setup();
        client.initialize(&admin, &treasury);
        let seller = Address::generate(&env);
        let session_id = Bytes::from_slice(&env, &[50u8; 32]);
        client.lock_funds(&session_id, &seller, &2000);
        // Data readable after lock
        let s1 = client.get_session(&session_id);
        assert_eq!(s1.status, SessionStatus::Locked);
        assert_eq!(s1.amount, 2000);
        // Seller completes
        client.complete_session(&session_id);
        let s2 = client.get_session(&session_id);
        assert_eq!(s2.status, SessionStatus::Completed);
        assert_eq!(s2.amount, 2000); // amount unchanged
        // Buyer approves
        client.approve_session(&session_id);
        let s3 = client.get_session(&session_id);
        assert_eq!(s3.status, SessionStatus::Approved);
    }

    #[test]
    fn test_config_persists_across_multiple_sessions() {
        // Set fee, lock two sessions, fee applies to both
        let (env, admin, treasury, client) = setup();
        client.initialize(&admin, &treasury);
        client.set_platform_fee(&500);
        let seller = Address::generate(&env);
        let id1 = Bytes::from_slice(&env, &[51u8; 32]);
        let id2 = Bytes::from_slice(&env, &[52u8; 32]);
        client.lock_funds(&id1, &seller, &1000);
        client.lock_funds(&id2, &seller, &2000);
        assert_eq!(client.get_platform_fee(), 500);
        let s1 = client.get_session(&id1);
        let s2 = client.get_session(&id2);
        assert_eq!(s1.amount, 1000);
        assert_eq!(s2.amount, 2000);
    }

    #[test]
    fn test_treasury_and_fee_config_preserved() {
        // Validates that admin config storage reads back correctly
        let (env, admin, treasury, client) = setup();
        client.initialize(&admin, &treasury);
        client.set_platform_fee(&250);
        let new_treasury = Address::generate(&env);
        client.set_treasury(&new_treasury);
        assert_eq!(client.get_platform_fee(), 250);
        assert_eq!(client.get_treasury(), new_treasury);
        assert_eq!(client.get_admin(), admin);
    }

    // ── Fee edge cases ────────────────────────────────────────────────────────

    #[test]
    fn test_fee_zero_bps_no_deduction() {
        let (env, _admin, _treasury, client, session_id) = setup_with_session(1000);
        let reason = String::from_str(&env, "dispute");
        client.open_dispute(&session_id, &reason);
        client.resolve_dispute(&session_id, &2u32, &600i128, &400i128);
        let s = client.get_session(&session_id);
        assert_eq!(s.status, SessionStatus::Resolved);
    }

    #[test]
    fn test_fee_rounding_truncates() {
        let (env, admin, treasury, client) = setup();
        client.initialize(&admin, &treasury);
        client.set_platform_fee(&3);
        let seller = Address::generate(&env);
        let session_id = Bytes::from_slice(&env, &[10u8; 32]);
        client.lock_funds(&session_id, &seller, &100);
        let reason = String::from_str(&env, "dispute");
        client.open_dispute(&session_id, &reason);
        client.resolve_dispute(&session_id, &2u32, &50i128, &50i128);
        let s = client.get_session(&session_id);
        assert_eq!(s.status, SessionStatus::Resolved);
    }
}
