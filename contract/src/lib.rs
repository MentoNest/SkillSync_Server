use anchor_lang::prelude::*;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS"); // Default dummy ID, replace with your own

/// Window after completion during which a session can still be disputed;
/// past this, anyone may trigger an auto-refund on a stuck Completed session.
const DISPUTE_WINDOW_SECONDS: i64 = 7 * 24 * 60 * 60; // 7 days

/// Default maximum lifetime of a Locked session before it can be auto-cancelled
/// (~7 days, matching the issue's "30,000 ledgers" figure expressed in seconds).
const DEFAULT_MAX_SESSION_DURATION_SECONDS: i64 = 7 * 24 * 60 * 60; // 7 days

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
#[derive(InitSpace)]
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

    /// Whether the session has an expiry set and has already passed it.
    pub fn is_expired(&self, now: i64) -> bool {
        self.expires_at > 0 && now >= self.expires_at
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
        let buyer = ctx.accounts.buyer.key();
        let created_at = Clock::get()?.unix_timestamp;

        // This check is redundant because Anchor's init prevents reinitialization,
        // but added for completeness as per requirements
        if !session.data_is_empty() {
            return Err(ErrorCode::DuplicateSessionId.into());
        }

        // Save the session using our helper function
        Session::save_session(session, buyer, seller, amount, created_at);

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
        let platform_state = &mut ctx.accounts.platform_state;
        let platform_fee_bps = platform_state.platform_fee_bps;

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

        // Accumulate the settlement fee into the cumulative treasury balance so
        // it can be tracked across many sessions.
        platform_state.treasury_balance = platform_state
            .treasury_balance
            .saturating_add(fee_amount);

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

        // Update session status to refunded
        Session::update_status(session, SessionStatus::Refunded)?;

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

        // Can only dispute locked sessions
        if session.status != SessionStatus::Locked {
            return Err(ErrorCode::InvalidSessionState.into());
        }

        // Update session status to disputed
        session.status = SessionStatus::Disputed;

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

        if session.status != SessionStatus::Completed && session.status != SessionStatus::Locked {
            return Err(ErrorCode::InvalidSessionState.into());
        }

        let now = Clock::get()?.unix_timestamp;
        session.status = SessionStatus::Disputed;
        session.dispute_opened_at = Some(now);

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

        // Ensure only admin can resolve disputes
        if ctx.accounts.signer.key() != platform_state.admin {
            return Err(ErrorCode::NotAdmin.into());
        }

        // Can only resolve disputed sessions
        if session.status != SessionStatus::Disputed {
            return Err(ErrorCode::InvalidSessionState.into());
        }

        // Total shares must equal the original locked amount
        if buyer_share + seller_share != session.amount as i128 {
            return Err(ErrorCode::InvalidShareSplit.into());
        }

        // Update session status to resolved
        Session::update_status(session, SessionStatus::Resolved)?;

        emit!(DisputeResolved {
            session_id: ctx.accounts.session.key(),
            resolution,
            buyer_share,
            seller_share,
            resolved_at: session.dispute_resolved_at.unwrap(),
        });

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
    #[account(mut)]
    pub signer: Signer<'info>,
    pub system_program: Program<'info, System>,
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
    pub buyer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateSession<'info> {
    #[account(mut)]
    pub session: Account<'info, Session>,
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
    pub signer: Signer<'info>,
}

#[derive(Accounts)]
pub struct ResolveDispute<'info> {
    #[account(mut)]
    pub session: Account<'info, Session>,
    pub platform_state: Account<'info, PlatformState>,
    #[account(mut)]
    pub signer: Signer<'info>,
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
    #[msg("Unauthorized: caller is not authorized for this action")]
    Unauthorized,
    #[msg("Unauthorized: Only admin can perform this action")]
    NotAdmin,
    #[msg("Unauthorized: Only the session buyer can perform this action")]
    NotBuyer,
    #[msg("Unauthorized: Only the session seller can perform this action")]
    NotSeller,
    #[msg("Dispute window has not elapsed yet")]
    DisputeWindowNotElapsed,
    #[msg("Buyer and seller shares must sum to the original session amount")]
    InvalidShareSplit,
    #[msg("Session has expired and can no longer be completed or approved")]
    SessionExpired,
    #[msg("Session has not yet reached its expiry")]
    SessionNotExpired,
    #[msg("Max session duration must be greater than zero")]
    InvalidMaxSessionDuration,
}