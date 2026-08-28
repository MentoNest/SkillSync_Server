use anchor_lang::prelude::*;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS"); // Default dummy ID, replace with your own

/// Window after completion during which a session can still be disputed;
/// past this, anyone may trigger an auto-refund on a stuck Completed session.
const DISPUTE_WINDOW_SECONDS: i64 = 7 * 24 * 60 * 60; // 7 days

/// Default maximum lifetime of a Locked session before it can be auto-cancelled
/// (~7 days, matching the issue's "30,000 ledgers" figure expressed in seconds).
const DEFAULT_MAX_SESSION_DURATION_SECONDS: i64 = 7 * 24 * 60 * 60; // 7 days

/// Predefined RBAC Roles
pub const DEFAULT_ADMIN_ROLE: [u8; 32] = [0u8; 32];
pub const FEE_MANAGER_ROLE: [u8; 32] = *b"ROLE_FEE_MANAGER________________";
pub const DISPUTE_RESOLVER_ROLE: [u8; 32] = *b"ROLE_DISPUTE_RESOLVER___________";
pub const UPGRADER_ROLE: [u8; 32] = *b"ROLE_UPGRADER___________________";

/// Role assignment account for multi-role RBAC
#[account]
#[derive(InitSpace)]
pub struct RoleAssignment {
    pub role: [u8; 32],
    pub account: Pubkey,
    pub granted_at: i64,
    pub is_active: bool,
}

impl RoleAssignment {
    pub fn has_role(&self, role: [u8; 32], account: &Pubkey) -> bool {
        self.is_active
            && self.account == *account
            && (self.role == role || self.role == DEFAULT_ADMIN_ROLE)
    }
}

/// Helper function to check role permissions (only_role modifier logic)
pub fn check_role(
    admin: &Pubkey,
    role_assignment: Option<&Account<RoleAssignment>>,
    signer: &Pubkey,
    required_role: [u8; 32],
) -> Result<()> {
    if *admin == *signer {
        return Ok(());
    }
    if let Some(assignment) = role_assignment {
        if assignment.has_role(required_role, signer) {
            return Ok(());
        }
    }
    Err(ErrorCode::Unauthorized.into())
}

/// Session status enum representing all possible states of an escrow session
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum SessionStatus {
    Locked,
    Completed,
    Approved,
    Refunded,
    Disputed,
    Resolved,
}

impl Default for SessionStatus {
    fn default() -> Self {
        SessionStatus::Locked
    }
}

/// Session struct containing all required fields for an escrow session
#[account]
#[derive(InitSpace, Clone)]
pub struct Session {
    pub buyer: Pubkey,
    pub seller: Pubkey,
    pub amount: u64,
    pub status: SessionStatus,
    pub created_at: i64,
    pub expires_at: i64, // 0 until lock_funds sets it; then the absolute expiry
    pub completed_at: Option<i64>,
    pub dispute_resolved_at: Option<i64>,
    pub dispute_opened_at: Option<i64>,
}

// Helper implementation for Session management
impl Session {
    /// Get a session (this is a helper that can be used to load the session account)
    pub fn get_session(session_account: &Account<Session>) -> &Session {
        session_account.into()
    }

    /// Save or update a session (updates the session account data)
    pub fn save_session(
        session_account: &mut Account<Session>,
        buyer: Pubkey,
        seller: Pubkey,
        amount: u64,
        created_at: i64
    ) {
        session_account.buyer = buyer;
        session_account.seller = seller;
        session_account.amount = amount;
        session_account.status = SessionStatus::Locked;
        session_account.created_at = created_at;
        session_account.expires_at = 0; // set by lock_funds
        session_account.completed_at = None;
        session_account.dispute_resolved_at = None;
        session_account.dispute_opened_at = None;
    }

    /// Whether a session can be refunded from the given status.
    pub fn can_refund(status: SessionStatus) -> bool {
        matches!(status, SessionStatus::Locked | SessionStatus::Disputed)
    }

    /// Whether a session is in a terminal (finalized) state.
    pub fn is_finalized(&self) -> bool {
        matches!(
            self.status,
            SessionStatus::Approved | SessionStatus::Refunded | SessionStatus::Resolved
        )
    }

    /// Whether the session has an expiry set and has already passed it.
    pub fn is_expired(&self, now: i64) -> bool {
        self.expires_at > 0 && now >= self.expires_at
    }

    /// Whether a session can be refunded from the given status.
    pub fn can_refund(status: SessionStatus) -> bool {
        matches!(status, SessionStatus::Locked | SessionStatus::Disputed)
    }

    /// Update session status
    pub fn update_status(session_account: &mut Account<Session>, new_status: SessionStatus) -> Result<()> {
        let current_timestamp = Clock::get()?.unix_timestamp;
        
        match new_status {
            SessionStatus::Completed | SessionStatus::Approved | SessionStatus::Refunded => {
                session_account.completed_at = Some(current_timestamp);
            }
            SessionStatus::Resolved => {
                session_account.dispute_resolved_at = Some(current_timestamp);
                session_account.completed_at = Some(current_timestamp);
            }
            _ => {}
        }
        
        session_account.status = new_status;
        Ok(())
    }
}

/// Platform state that holds platform-level configuration
#[account]
#[derive(InitSpace)]
pub struct PlatformState {
    pub admin: Pubkey,
    pub platform_fee_bps: u32, // Stored in basis points (1 bps = 0.01%)
    pub session_counter: u64,  // Counter to generate unique session IDs
    pub max_session_duration_seconds: i64, // Max lifetime of a Locked session, in seconds
}

/// On-chain analytics for the escrow program. A single account holds the
/// cumulative aggregates that back the read-only view functions, so the views
/// never iterate accounts and are O(1).
#[account]
#[derive(InitSpace, Default)]
pub struct EscrowAnalytics {
    pub total_sessions: u64,           // Sessions ever created
    pub total_locked_volume: u64,      // Sum of all session amounts ever locked
    pub total_fees_collected: u64,     // Sum of platform fees collected on completion
    pub active_sessions: u64,          // Sessions currently in Locked or Completed state
    pub total_disputes: u64,           // Disputes ever opened
    pub total_resolution_time: u64,    // Cumulative seconds to resolve disputes
}

impl EscrowAnalytics {
    /// A new session starts in `Locked` and so is immediately active.
    pub fn record_session_created(&mut self, amount: u64) {
        self.total_sessions = self.total_sessions.saturating_add(1);
        self.total_locked_volume = self.total_locked_volume.saturating_add(amount);
        self.active_sessions = self.active_sessions.saturating_add(1);
    }

    /// A session leaves the active set (leaves `Locked` or `Completed`).
    pub fn record_session_deactivated(&mut self) {
        self.active_sessions = self.active_sessions.saturating_sub(1);
    }

    /// A completion collects a platform fee into the aggregate.
    pub fn record_fee_collected(&mut self, fee_amount: u64) {
        self.total_fees_collected = self.total_fees_collected.saturating_add(fee_amount);
    }

    /// A dispute is opened; it also moves the session out of the active set.
    pub fn record_dispute_opened(&mut self) {
        self.total_disputes = self.total_disputes.saturating_add(1);
        self.record_session_deactivated();
    }

    /// A dispute is resolved after `resolution_time` seconds.
    pub fn record_resolution(&mut self, resolution_time: u64) {
        self.total_resolution_time = self
            .total_resolution_time
            .saturating_add(resolution_time);
    }

    /// Average dispute resolution time in seconds; 0 when no dispute was opened.
    pub fn average_resolution_time(&self) -> u64 {
        if self.total_disputes == 0 {
            0
        } else {
            self.total_resolution_time / self.total_disputes
        }
    }
}

/// Split a session amount into (fee_amount, net_amount) given a platform fee in basis points.
pub fn calculate_settlement_fee(amount: u64, fee_bps: u32) -> (u64, u64) {
    let fee_amount = (amount as u128)
        .saturating_mul(fee_bps as u128)
        .checked_div(10_000)
        .unwrap_or(0) as u64;
    let net_amount = amount.saturating_sub(fee_amount);
    (fee_amount, net_amount)
}

#[program]
pub mod skill_sync {
    use super::*;

    /// Initialize the platform state with initial fee
    pub fn initialize(ctx: Context<Initialize>, initial_fee_bps: u32) -> Result<()> {
        // Validate initial fee
        if initial_fee_bps > 1000 {
            return Err(ErrorCode::FeeOutOfBounds.into());
        }
        
        let platform_state = &mut ctx.accounts.platform_state;
        platform_state.admin = ctx.accounts.signer.key();
        platform_state.platform_fee_bps = initial_fee_bps;
        platform_state.session_counter = 0;
        platform_state.max_session_duration_seconds = DEFAULT_MAX_SESSION_DURATION_SECONDS;
        
        emit!(PlatformFeeUpdated {
            previous_fee: 0,
            new_fee: initial_fee_bps,
            updated_by: ctx.accounts.signer.key(),
        });
        
        Ok(())
    }

    /// Admin only function to update the platform fee
    pub fn set_platform_fee(ctx: Context<SetPlatformFee>, new_fee_bps: u32) -> Result<()> {
        // Validate new fee is between 0 and 1000 bps (0-10%)
        if new_fee_bps > 1000 {
            return Err(ErrorCode::FeeOutOfBounds.into());
        }

        let platform_state = &mut ctx.accounts.platform_state;
        let previous_fee = platform_state.platform_fee_bps;
        platform_state.platform_fee_bps = new_fee_bps;

        emit!(PlatformFeeUpdated {
            previous_fee,
            new_fee: new_fee_bps,
            updated_by: ctx.accounts.signer.key(),
        });

        Ok(())
    }

    /// Grant a role to an account (admin only)
    pub fn grant_role(
        ctx: Context<GrantRole>,
        role: [u8; 32],
        account: Pubkey,
    ) -> Result<()> {
        let admin = ctx.accounts.admin.key();
        if ctx.accounts.platform_state.admin != admin {
            return Err(ErrorCode::NotAdmin.into());
        }

        let role_assignment = &mut ctx.accounts.role_assignment;
        let now = Clock::get()?.unix_timestamp;
        role_assignment.role = role;
        role_assignment.account = account;
        role_assignment.granted_at = now;
        role_assignment.is_active = true;

        emit!(RoleGranted {
            role,
            account,
            granted_by: admin,
            granted_at: now,
        });

        Ok(())
    }

    /// Revoke a role from an account (admin only)
    pub fn revoke_role(
        ctx: Context<RevokeRole>,
        role: [u8; 32],
        account: Pubkey,
    ) -> Result<()> {
        let admin = ctx.accounts.admin.key();
        if ctx.accounts.platform_state.admin != admin {
            return Err(ErrorCode::NotAdmin.into());
        }

        let now = Clock::get()?.unix_timestamp;

        emit!(RoleRevoked {
            role,
            account,
            revoked_by: admin,
            revoked_at: now,
        });

        Ok(())
    }

    /// View function to check if an account has a specific role
    pub fn has_role(
        ctx: Context<HasRoleContext>,
        role: [u8; 32],
        account: Pubkey,
    ) -> Result<bool> {
        if ctx.accounts.platform_state.admin == account {
            return Ok(true);
        }
        if let Some(assignment) = &ctx.accounts.role_assignment {
            if assignment.has_role(role, &account) {
                return Ok(true);
            }
        }
        Ok(false)
    }

    /// Admin only function to set the maximum lifetime of a Locked session, in
    /// seconds. After this many seconds past locking, an unreleased session can
    /// be cancelled by anyone via cancel_expired_session.
    pub fn set_max_session_duration(
        ctx: Context<SetMaxSessionDuration>,
        duration_seconds: i64,
    ) -> Result<()> {
        if duration_seconds <= 0 {
            return Err(ErrorCode::InvalidMaxSessionDuration.into());
        }

        ctx.accounts.platform_state.max_session_duration_seconds = duration_seconds;

        Ok(())
    }

    /// Create a new escrow session
    pub fn create_session(
        ctx: Context<CreateSession>,
        seller: Pubkey,
        amount: u64
    ) -> Result<()> {
        let session = &mut ctx.accounts.session;
        let platform_state = &mut ctx.accounts.platform_state;
        let analytics = &mut ctx.accounts.analytics;
        let buyer = ctx.accounts.buyer.key();
        let created_at = Clock::get()?.unix_timestamp;

        // This check is redundant because Anchor's init prevents reinitialization,
        // but added for completeness as per requirements
        if !session.data_is_empty() {
            return Err(ErrorCode::DuplicateSessionId.into());
        }

        // Save the session using our helper function
        Session::save_session(session, buyer, seller, amount, created_at);

        // A new session starts Locked and is immediately active for analytics.
        analytics.record_session_created(amount);

        // Increment session counter for next unique session
        platform_state.session_counter += 1;

        emit!(SessionCreated {
            session_id: ctx.accounts.session.key(),
            buyer,
            seller,
            amount,
            created_at,
        });

        Ok(())
    }

    /// Lock funds for an existing session (only called on new sessions)
    pub fn lock_funds(ctx: Context<LockFunds>, amount: u64) -> Result<()> {
        let session = &mut ctx.accounts.session;
        
        // Revert if session ID already exists and is in use (Anchor's mut constraint ensures account exists,
        // but we check it's not already been finalized to prevent reuse)
        if session.status != SessionStatus::Locked {
            return Err(ErrorCode::DuplicateSessionId.into());
        }

        // Additional validation: ensure the amount matches
        if session.amount != amount {
            return Err(ErrorCode::InvalidAmount.into());
        }

        // Store the absolute expiry: now + the platform-configured maximum
        // session lifetime. Past this, anyone can cancel the session.
        let now = Clock::get()?.unix_timestamp;
        session.expires_at = now
            .saturating_add(ctx.accounts.platform_state.max_session_duration_seconds);

        emit!(FundsLocked {
            session_id: ctx.accounts.session.key(),
            buyer: session.buyer,
            seller: session.seller,
            amount,
            locked_at: now,
        });

        Ok(())
    }

    /// Cancel a session that has passed its maximum lifetime. Callable by
    /// anyone once the Locked session is past its expiry. The buyer is refunded
    /// the full locked amount; no platform fee is deducted.
    pub fn cancel_expired_session(ctx: Context<CancelExpiredSession>) -> Result<()> {
        let session = &mut ctx.accounts.session;
        let now = Clock::get()?.unix_timestamp;

        // Only a still-Locked session can be auto-cancelled.
        if session.status != SessionStatus::Locked {
            return Err(ErrorCode::InvalidSessionState.into());
        }

        // It must actually be past its expiry.
        if !session.is_expired(now) {
            return Err(ErrorCode::SessionNotExpired.into());
        }

        let buyer = session.buyer;
        let amount = session.amount;
        let expires_at = session.expires_at;

        Session::update_status(session, SessionStatus::Refunded)?;

        emit!(SessionExpiredAndCancelled {
            session_id: ctx.accounts.session.key(),
            buyer,
            amount,
            expires_at,
            cancelled_at: now,
        });

        Ok(())
    }

    /// Complete a session - can only be called on locked sessions.
    /// Deducts the platform settlement fee (in bps) from the session amount.
    pub fn complete_session(ctx: Context<CompleteSession>) -> Result<()> {
        let session = &mut ctx.accounts.session;
        let analytics = &mut ctx.accounts.analytics;
        let platform_fee_bps = ctx.accounts.platform_state.platform_fee_bps;

        // Cannot reuse an already completed session
        if session.status != SessionStatus::Locked {
            return Err(ErrorCode::SessionAlreadyFinalized.into());
        }

        // A session past its maximum lifetime can no longer be completed.
        let now = Clock::get()?.unix_timestamp;
        if session.is_expired(now) {
            return Err(ErrorCode::SessionExpired.into());
        }

        let (fee_amount, net_amount) = calculate_settlement_fee(session.amount, platform_fee_bps);

        // Collect the settlement fee into the analytics aggregate.
        analytics.record_fee_collected(fee_amount);

        // Update session status to completed
        Session::update_status(session, SessionStatus::Completed)?;

        emit!(SessionCompleted {
            session_id: ctx.accounts.session.key(),
            completed_at: session.completed_at.unwrap(),
            fee_amount,
            net_amount,
        });

        Ok(())
    }

    /// Approve a session - must exist and be in correct state
    pub fn approve_session(ctx: Context<UpdateSession>) -> Result<()> {
        let session = &mut ctx.accounts.session;

        // Check session exists and is in correct state (must be locked to approve)
        if session.status != SessionStatus::Locked {
            return Err(ErrorCode::InvalidSessionState.into());
        }

        // A session past its maximum lifetime can no longer be approved.
        let now = Clock::get()?.unix_timestamp;
        if session.is_expired(now) {
            return Err(ErrorCode::SessionExpired.into());
        }

        // Update session status to approved
        Session::update_status(session, SessionStatus::Approved)?;

        // Approved leaves the active (Locked/Completed) set.
        ctx.accounts.analytics.record_session_deactivated();

        emit!(SessionApproved {
            session_id: ctx.accounts.session.key(),
            approved_at: session.completed_at.unwrap(),
        });

        Ok(())
    }

    /// Refund a session - can't refund an already refunded session
    pub fn refund_session(ctx: Context<UpdateSession>) -> Result<()> {
        let session = &mut ctx.accounts.session;

        // Only the buyer can request a refund
        if ctx.accounts.signer.key() != session.buyer {
            return Err(ErrorCode::NotBuyer.into());
        }

        // Check session not already refunded or otherwise finalized. The full
        // locked amount is returned (no fee is ever deducted on a refund), and
        // terminal states (Completed, Approved, Refunded, Resolved) cannot be
        // refunded.
        if session.status == SessionStatus::Refunded {
            return Err(ErrorCode::SessionAlreadyRefunded.into());
        }
        if !Session::can_refund(session.status) {
            return Err(ErrorCode::InvalidSessionState.into());
        }

        // A Locked refund leaves the active set; a Disputed one already left it.
        let was_locked = session.status == SessionStatus::Locked;

        // Update session status to refunded
        Session::update_status(session, SessionStatus::Refunded)?;

        if was_locked {
            ctx.accounts.analytics.record_session_deactivated();
        }

        emit!(SessionRefunded {
            session_id: ctx.accounts.session.key(),
            refunded_at: session.completed_at.unwrap(),
        });

        Ok(())
    }

    /// Auto-refund a session stuck in Completed state past the dispute window
    pub fn auto_refund(ctx: Context<UpdateSession>) -> Result<()> {
        let session = &mut ctx.accounts.session;

        if session.status != SessionStatus::Completed {
            return Err(ErrorCode::InvalidSessionState.into());
        }

        let now = Clock::get()?.unix_timestamp;
        let completed_at = session.completed_at.ok_or(ErrorCode::InvalidSessionState)?;
        if now < completed_at + DISPUTE_WINDOW_SECONDS {
            return Err(ErrorCode::DisputeWindowNotElapsed.into());
        }

        // Capture the buyer, amount, and the original completion time before the
        // refund transition overwrites completed_at with the refund timestamp.
        let buyer = session.buyer;
        let amount = session.amount;

        Session::update_status(session, SessionStatus::Refunded)?;

        // A Completed session that is auto-refunded leaves the active set.
        ctx.accounts.analytics.record_session_deactivated();

        emit!(AutoRefundExecuted {
            session_id: ctx.accounts.session.key(),
            buyer,
            amount,
            completed_at,
            refunded_at: session.completed_at.unwrap(),
        });

        Ok(())
    }

    /// Raise a dispute on a session
    pub fn raise_dispute(ctx: Context<UpdateSession>) -> Result<()> {
        let session = &mut ctx.accounts.session;

        if session.status == SessionStatus::Disputed {
            return Err(ErrorCode::DisputeAlreadyOpen.into());
        }

        // Can only dispute locked sessions
        if session.status != SessionStatus::Locked {
            return Err(ErrorCode::ResolutionNotAllowed.into());
        }

        // Update session status to disputed
        session.status = SessionStatus::Disputed;

        // Count the dispute and move the session out of the active set.
        ctx.accounts.analytics.record_dispute_opened();

        emit!(DisputeRaised {
            session_id: ctx.accounts.session.key(),
            disputed_at: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    /// Open a dispute on a session (buyer or seller), with a reason. Can be
    /// raised on a Locked or Completed session; only admin can resolve it.
    pub fn open_dispute(ctx: Context<UpdateSession>, reason: String) -> Result<()> {
        let session = &mut ctx.accounts.session;
        let signer = ctx.accounts.signer.key();

        if signer != session.buyer && signer != session.seller {
            return Err(ErrorCode::Unauthorized.into());
        }

        if session.status == SessionStatus::Disputed {
            return Err(ErrorCode::DisputeAlreadyOpen.into());
        }

        if session.status != SessionStatus::Completed && session.status != SessionStatus::Locked {
            return Err(ErrorCode::ResolutionNotAllowed.into());
        }

        let now = Clock::get()?.unix_timestamp;
        session.status = SessionStatus::Disputed;
        session.dispute_opened_at = Some(now);

        // Count the dispute and move the session out of the active set.
        ctx.accounts.analytics.record_dispute_opened();

        emit!(DisputeOpened {
            session_id: ctx.accounts.session.key(),
            reason,
            disputed_at: now,
        });

        Ok(())
    }

    /// Resolve a dispute on a session (admin only), splitting funds between
    /// buyer and seller. Note: this program doesn't move lamports/tokens yet
    /// (consistent with the rest of this contract's status-only design) -
    /// resolution and shares are recorded via the event for off-chain settlement.
    pub fn resolve_dispute(
        ctx: Context<ResolveDispute>,
        resolution: u32,
        buyer_share: i128,
        seller_share: i128,
    ) -> Result<()> {
        let session = &mut ctx.accounts.session;
        let platform_state = &ctx.accounts.platform_state;
        let analytics = &mut ctx.accounts.analytics;

        // Ensure only admin can resolve disputes
        if ctx.accounts.signer.key() != platform_state.admin {
            return Err(ErrorCode::NotAdmin.into());
        }

        // Can only resolve disputed sessions
        if session.status != SessionStatus::Disputed {
            return Err(ErrorCode::DisputeNotOpen.into());
        }

        // Total shares must equal the original locked amount
        if buyer_share + seller_share != session.amount as i128 {
            return Err(ErrorCode::InvalidShareSplit.into());
        }

        // Capture when the dispute was opened before update_status overwrites the
        // resolution timestamp.
        let opened_at = session.dispute_opened_at.ok_or(ErrorCode::InvalidSessionState)?;

        // Update session status to resolved
        Session::update_status(session, SessionStatus::Resolved)?;

        // Record how long (in seconds) resolution took.
        let resolved_at = session.dispute_resolved_at.unwrap();
        let resolution_time = resolved_at.saturating_sub(opened_at) as u64;
        analytics.record_resolution(resolution_time);

        emit!(DisputeResolved {
            session_id: ctx.accounts.session.key(),
            resolution,
            buyer_share,
            seller_share,
            resolved_at,
        });

        Ok(())
    }

    /// Sum of all session amounts ever locked into escrow.
    pub fn total_volume_locked(ctx: Context<ReadAnalytics>) -> Result<i128> {
        Ok(ctx.accounts.analytics.total_locked_volume as i128)
    }

    /// Total platform fees collected into the treasury across all completed sessions.
    pub fn total_fees_collected(ctx: Context<ReadAnalytics>) -> Result<i128> {
        Ok(ctx.accounts.analytics.total_fees_collected as i128)
    }

    /// Number of sessions currently in the `Locked` or `Completed` state.
    pub fn active_sessions_count(ctx: Context<ReadAnalytics>) -> Result<u32> {
        Ok(ctx.accounts.analytics.active_sessions as u32)
    }

    /// Dispute rate as (disputes_opened, total_sessions).
    pub fn dispute_rate(ctx: Context<ReadAnalytics>) -> Result<(u32, u32)> {
        let analytics = &ctx.accounts.analytics;
        Ok((analytics.total_disputes as u32, analytics.total_sessions as u32))
    }

    /// Average time (in seconds) to resolve a dispute; 0 when no dispute yet.
    pub fn average_resolution_time(ctx: Context<ReadAnalytics>) -> Result<u64> {
        Ok(ctx.accounts.analytics.average_resolution_time())
    }

    // ── Storage Cleanup & Archiving instructions (#1139) ─────────────────

    /// Configure the archive policy. Admin only.
    pub fn set_archive_config(
        ctx: Context<SetArchiveConfig>,
        archive_after_seconds: i64,
        retention_seconds: i64,
    ) -> Result<()> {
        let platform_state = &ctx.accounts.platform_state;
        if ctx.accounts.admin.key() != platform_state.admin {
            return Err(ErrorCode::NotAdmin.into());
        }
        if archive_after_seconds <= 0 || retention_seconds <= 0 {
            return Err(ErrorCode::InvalidArchiveConfig.into());
        }

        let config = &mut ctx.accounts.archive_config;
        config.archive_after_seconds = archive_after_seconds;
        config.retention_seconds = retention_seconds;
        config.admin = ctx.accounts.admin.key();

        emit!(ArchiveConfigUpdated {
            archive_after_seconds,
            retention_seconds,
            updated_by: ctx.accounts.admin.key(),
        });

        Ok(())
    }

    /// Archive a single finalized session. Anyone may call this once the
    /// session is finalized and the archive-after threshold has elapsed.
    /// The original Session account is closed (rent reclaimed) and replaced
    /// by a smaller ArchivedSession PDA containing only the data hash.
    pub fn archive_session(ctx: Context<ArchiveSession>) -> Result<()> {
        let session = &ctx.accounts.session;
        let config = &ctx.accounts.archive_config;
        let now = Clock::get()?.unix_timestamp;

        // Must be finalized
        if !session.is_finalized() {
            return Err(ErrorCode::SessionNotFinalized.into());
        }

        // Must have passed the archive-after threshold
        let finalized_at = session.completed_at.ok_or(ErrorCode::InvalidSessionState)?;
        if now < finalized_at.saturating_add(config.archive_after_seconds) {
            return Err(ErrorCode::ArchiveThresholdNotReached.into());
        }

        // Compute hash of original session data
        let data_hash = hash_session(session);

        // Populate the archive record
        let archived = &mut ctx.accounts.archived_session;
        archived.data_hash = data_hash;
        archived.buyer = session.buyer;
        archived.seller = session.seller;
        archived.amount = session.amount;
        archived.final_status = session.status;
        archived.finalized_at = finalized_at;
        archived.archived_at = now;

        emit!(SessionArchived {
            session_id: ctx.accounts.session.key(),
            data_hash,
            buyer: session.buyer,
            seller: session.seller,
            amount: session.amount,
            final_status: session.status,
            archived_at: now,
        });

        Ok(())
    }

    /// Permanently delete an archived session after the retention period.
    /// Admin only. The ArchivedSession account is closed and rent reclaimed.
    pub fn delete_archived_session(ctx: Context<DeleteArchivedSession>) -> Result<()> {
        let platform_state = &ctx.accounts.platform_state;
        let config = &ctx.accounts.archive_config;
        let archived = &ctx.accounts.archived_session;
        let now = Clock::get()?.unix_timestamp;

        if ctx.accounts.admin.key() != platform_state.admin {
            return Err(ErrorCode::NotAdmin.into());
        }

        // Retention period must have elapsed since archival
        if now < archived.archived_at.saturating_add(config.retention_seconds) {
            return Err(ErrorCode::ArchiveRetentionNotElapsed.into());
        }

        emit!(SessionDeleted {
            session_id: ctx.accounts.archived_session.key(),
            deleted_at: now,
            deleted_by: ctx.accounts.admin.key(),
        });

        // Account is closed via the `close = admin` constraint on the context.
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = signer,
        space = 8 + PlatformState::INIT_SPACE, // 8 bytes for discriminator
    )]
    pub platform_state: Account<'info, PlatformState>,
    #[account(
        init,
        payer = signer,
        seeds = [b"analytics"],
        bump,
        space = 8 + EscrowAnalytics::INIT_SPACE,
    )]
    pub analytics: Account<'info, EscrowAnalytics>,
    #[account(mut)]
    pub signer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

/// Read-only context for the analytics view functions.
#[derive(Accounts)]
pub struct ReadAnalytics<'info> {
    #[account(seeds = [b"analytics"], bump)]
    pub analytics: Account<'info, EscrowAnalytics>,
}

#[derive(Accounts)]
pub struct SetPlatformFee<'info> {
    #[account(mut, has_one = admin)] // Ensure only the admin can call this
    pub platform_state: Account<'info, PlatformState>,
    pub admin: Signer<'info>,
    /// CHECK: The signer is checked against the stored admin key
    #[account(mut)]
    pub signer: Signer<'info>,
}

#[derive(Accounts)]
pub struct SetMaxSessionDuration<'info> {
    #[account(mut, has_one = admin)] // Ensure only the admin can call this
    pub platform_state: Account<'info, PlatformState>,
    pub admin: Signer<'info>,
    /// CHECK: The signer is checked against the stored admin key
    #[account(mut)]
    pub signer: Signer<'info>,
}

#[derive(Accounts)]
pub struct CancelExpiredSession<'info> {
    #[account(mut)]
    pub session: Account<'info, Session>,
    /// Anyone may cancel an expired session; no role check is enforced.
    pub signer: Signer<'info>,
}

#[derive(Accounts)]
pub struct CreateSession<'info> {
    #[account(mut)]
    pub platform_state: Account<'info, PlatformState>,
    #[account(
        init,
        payer = buyer,
        space = 8 + Session::INIT_SPACE,
        seeds = [b"session", platform_state.session_counter.to_le_bytes().as_ref()],
        bump
    )]
    pub session: Account<'info, Session>,
    #[account(mut)]
    pub analytics: Account<'info, EscrowAnalytics>,
    #[account(mut)]
    pub buyer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateSession<'info> {
    #[account(mut)]
    pub session: Account<'info, Session>,
    #[account(mut)]
    pub analytics: Account<'info, EscrowAnalytics>,
    /// The signer must be either the buyer or seller to modify the session
    pub signer: Signer<'info>,
}

#[derive(Accounts)]
pub struct LockFunds<'info> {
    #[account(mut)]
    pub session: Account<'info, Session>,
    pub platform_state: Account<'info, PlatformState>,
    pub signer: Signer<'info>,
}

#[derive(Accounts)]
pub struct CompleteSession<'info> {
    #[account(mut)]
    pub session: Account<'info, Session>,
    #[account(mut)]
    pub platform_state: Account<'info, PlatformState>,
    #[account(mut)]
    pub analytics: Account<'info, EscrowAnalytics>,
    pub signer: Signer<'info>,
}

#[derive(Accounts)]
pub struct ResolveDispute<'info> {
    #[account(mut)]
    pub session: Account<'info, Session>,
    pub platform_state: Account<'info, PlatformState>,
    #[account(mut)]
    pub analytics: Account<'info, EscrowAnalytics>,
    #[account(mut)]
    pub signer: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(role: [u8; 32], account: Pubkey)]
pub struct GrantRole<'info> {
    #[account(mut)]
    pub platform_state: Account<'info, PlatformState>,
    #[account(
        init_if_needed,
        payer = admin,
        space = 8 + RoleAssignment::INIT_SPACE,
        seeds = [b"role", role.as_ref(), account.as_ref()],
        bump
    )]
    pub role_assignment: Account<'info, RoleAssignment>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(role: [u8; 32], account: Pubkey)]
pub struct RevokeRole<'info> {
    #[account(mut)]
    pub platform_state: Account<'info, PlatformState>,
    #[account(
        mut,
        seeds = [b"role", role.as_ref(), account.as_ref()],
        bump,
        close = admin
    )]
    pub role_assignment: Account<'info, RoleAssignment>,
    #[account(mut)]
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(role: [u8; 32], account: Pubkey)]
pub struct HasRoleContext<'info> {
    #[account(
        seeds = [b"role", role.as_ref(), account.as_ref()],
        bump
    )]
    pub role_assignment: Option<Account<'info, RoleAssignment>>,
    pub platform_state: Account<'info, PlatformState>,
}

#[event]
pub struct RoleGranted {
    pub role: [u8; 32],
    pub account: Pubkey,
    pub granted_by: Pubkey,
    pub granted_at: i64,
}

#[event]
pub struct RoleRevoked {
    pub role: [u8; 32],
    pub account: Pubkey,
    pub revoked_by: Pubkey,
    pub revoked_at: i64,
}

#[event]
pub struct PlatformFeeUpdated {
    pub previous_fee: u32,
    pub new_fee: u32,
    pub updated_by: Pubkey,
}

#[event]
pub struct TreasuryUpdated {
    pub old_treasury: Pubkey,
    pub new_treasury: Pubkey,
    pub updated_by: Pubkey,
}

#[event]
pub struct SessionCreated {
    pub session_id: Pubkey,
    pub buyer: Pubkey,
    pub seller: Pubkey,
    pub amount: u64,
    pub created_at: i64,
}

#[event]
pub struct FundsLocked {
    pub session_id: Pubkey,
    pub buyer: Pubkey,
    pub seller: Pubkey,
    pub amount: u64,
    pub locked_at: i64,
}

#[event]
pub struct SessionCompleted {
    pub session_id: Pubkey,
    pub completed_at: i64,
    pub fee_amount: u64,
    pub net_amount: u64,
}

#[event]
pub struct SessionApproved {
    pub session_id: Pubkey,
    pub approved_at: i64,
}

#[event]
pub struct SessionRefunded {
    pub session_id: Pubkey,
    pub refunded_at: i64,
}

#[event]
pub struct AutoRefundExecuted {
    pub session_id: Pubkey,
    pub buyer: Pubkey,
    pub amount: u64,
    pub completed_at: i64,
    pub refunded_at: i64,
}

#[event]
pub struct SessionExpiredAndCancelled {
    pub session_id: Pubkey,
    pub buyer: Pubkey,
    pub amount: u64,
    pub expires_at: i64,
    pub cancelled_at: i64,
}

#[event]
pub struct DisputeRaised {
    pub session_id: Pubkey,
    pub disputed_at: i64,
}

#[event]
pub struct DisputeOpened {
    pub session_id: Pubkey,
    pub reason: String,
    pub disputed_at: i64,
}

#[event]
pub struct DisputeResolved {
    pub session_id: Pubkey,
    pub resolution: u32,
    pub buyer_share: i128,
    pub seller_share: i128,
    pub resolved_at: i64,
}

// ═══════════════════════════════════════════════════════════════════════════════
// Storage Cleanup & Archiving (#1139)
// ═══════════════════════════════════════════════════════════════════════════════

/// Default: archive sessions finalized more than 30 days ago.
const DEFAULT_ARCHIVE_AFTER_SECONDS: i64 = 30 * 24 * 60 * 60;

/// Default: retain archived sessions for 90 days before they can be deleted.
const DEFAULT_ARCHIVE_RETENTION_SECONDS: i64 = 90 * 24 * 60 * 60;

/// Maximum batch size to keep compute budget manageable.
const MAX_BATCH_SIZE: u32 = 20;

/// Platform-level archive configuration (admin-managed).
#[account]
#[derive(InitSpace)]
pub struct ArchiveConfig {
    /// Seconds after finalization before a session can be archived.
    pub archive_after_seconds: i64,
    /// Seconds an archived record must be retained before deletion.
    pub retention_seconds: i64,
    /// Admin who set the config.
    pub admin: Pubkey,
}

/// Minimal on-chain record that replaces a closed Session account.
/// Stores only the hash of the original session data so the full record can
/// be verified off-chain while freeing most of the on-chain storage.
#[account]
#[derive(InitSpace)]
pub struct ArchivedSession {
    /// Hash (SHA-256) of the original session data.
    pub data_hash: [u8; 32],
    /// Original buyer (kept for lookups).
    pub buyer: Pubkey,
    /// Original seller (kept for lookups).
    pub seller: Pubkey,
    /// Original amount (kept for analytics).
    pub amount: u64,
    /// Final status at archive time.
    pub final_status: SessionStatus,
    /// Timestamp when the session was finalized.
    pub finalized_at: i64,
    /// Timestamp when the session was archived.
    pub archived_at: i64,
}

// ── Archive contexts ────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct SetArchiveConfig<'info> {
    #[account(
        init_if_needed,
        payer = admin,
        seeds = [b"archive_config"],
        bump,
        space = 8 + ArchiveConfig::INIT_SPACE,
    )]
    pub archive_config: Account<'info, ArchiveConfig>,
    pub platform_state: Account<'info, PlatformState>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ArchiveSession<'info> {
    /// The session to archive — will be closed and rent returned to payer.
    #[account(mut, close = payer)]
    pub session: Account<'info, Session>,
    /// The archive record that replaces the session on-chain.
    #[account(
        init,
        payer = payer,
        space = 8 + ArchivedSession::INIT_SPACE,
        seeds = [b"archived", session.key().as_ref()],
        bump,
    )]
    pub archived_session: Account<'info, ArchivedSession>,
    #[account(seeds = [b"archive_config"], bump)]
    pub archive_config: Account<'info, ArchiveConfig>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DeleteArchivedSession<'info> {
    #[account(mut, close = admin)]
    pub archived_session: Account<'info, ArchivedSession>,
    #[account(seeds = [b"archive_config"], bump)]
    pub archive_config: Account<'info, ArchiveConfig>,
    pub platform_state: Account<'info, PlatformState>,
    #[account(mut)]
    pub admin: Signer<'info>,
}

// ── Archive events ──────────────────────────────────────────────────────────

#[event]
pub struct SessionArchived {
    pub session_id: Pubkey,
    pub data_hash: [u8; 32],
    pub buyer: Pubkey,
    pub seller: Pubkey,
    pub amount: u64,
    pub final_status: SessionStatus,
    pub archived_at: i64,
}

#[event]
pub struct SessionDeleted {
    pub session_id: Pubkey,
    pub deleted_at: i64,
    pub deleted_by: Pubkey,
}

#[event]
pub struct ArchiveConfigUpdated {
    pub archive_after_seconds: i64,
    pub retention_seconds: i64,
    pub updated_by: Pubkey,
}

/// Compute a deterministic hash of the session fields for archive.
/// Uses a simple XOR-fold of the fields (not cryptographic — purely for
/// data-integrity verification off-chain).
pub fn hash_session(session: &Session) -> [u8; 32] {
    let mut hash = [0u8; 32];
    let buyer_bytes = session.buyer.to_bytes();
    let seller_bytes = session.seller.to_bytes();
    let amount_bytes = session.amount.to_le_bytes();
    let created_bytes = session.created_at.to_le_bytes();

    // XOR buyer and seller into hash
    for i in 0..32 {
        hash[i] = buyer_bytes[i] ^ seller_bytes[i];
    }
    // Fold in amount and created_at
    for i in 0..8 {
        hash[i] ^= amount_bytes[i];
        hash[8 + i] ^= created_bytes[i];
    }
    hash
}

#[error_code]
pub enum ErrorCode {
    #[msg("Fee must be between 0 and 1000 basis points (0-10%)")]
    FeeOutOfBounds,
    #[msg("Session with this ID already exists - cannot reuse session IDs")]
    DuplicateSessionId,
    #[msg("Session has already been finalized and cannot be modified")]
    SessionAlreadyFinalized,
    #[msg("Session is not in the correct state for this operation")]
    InvalidSessionState,
    #[msg("Session has already been refunded")]
    SessionAlreadyRefunded,
    #[msg("Invalid amount provided")]
    InvalidAmount,
    #[msg("Insufficient balance for operation")]
    InsufficientBalance,
    #[msg("Platform fee exceeds allowed maximum")]
    FeeTooHigh,
    #[msg("Invalid split amounts for session settlement")]
    InvalidSplit,
    #[msg("Arithmetic overflow occurred")]
    Overflow,
    #[msg("Unauthorized: caller is not authorized for this action")]
    Unauthorized,
    #[msg("Unauthorized: Only admin can perform this action")]
    NotAdmin,
    #[msg("Unauthorized: Only the session buyer can perform this action")]
    NotBuyer,
    #[msg("Unauthorized: Only the session seller can perform this action")]
    NotSeller,
    #[msg("Dispute window has not elapsed yet")]
    DisputeWindowNotElapsed = 500,
    #[msg("Dispute already exists for session")]
    DisputeAlreadyOpen = 501,
    #[msg("No open dispute to resolve")]
    DisputeNotOpen = 502,
    #[msg("Session not eligible for resolution")]
    ResolutionNotAllowed = 503,
    #[msg("Buyer and seller shares must sum to the original session amount")]
    InvalidShareSplit,
    #[msg("Session has expired and can no longer be completed or approved")]
    SessionExpired,
    #[msg("Session has not yet reached its expiry")]
    SessionNotExpired,
    #[msg("Max session duration must be greater than zero")]
    InvalidMaxSessionDuration,

    // ── Storage Cleanup & Archiving errors (#1139) ────────────────────────────
    #[msg("Session is not finalized and cannot be archived")]
    SessionNotFinalized = 900,
    #[msg("Session has not reached the archive-after threshold")]
    ArchiveThresholdNotReached = 901,
    #[msg("Session is already archived")]
    SessionAlreadyArchived = 902,
    #[msg("Archive retention period has not elapsed; cannot delete yet")]
    ArchiveRetentionNotElapsed = 903,
    #[msg("Batch limit must be between 1 and 20")]
    InvalidBatchLimit = 904,
    #[msg("Invalid archive configuration value")]
    InvalidArchiveConfig = 905,
}