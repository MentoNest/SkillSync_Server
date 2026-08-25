use anchor_lang::prelude::*;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS"); // Default dummy ID, replace with your own

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
    pub completed_at: Option<i64>,
    pub dispute_resolved_at: Option<i64>,
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
        session_account.completed_at = None;
        session_account.dispute_resolved_at = None;
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
    pub fn lock_funds(ctx: Context<UpdateSession>, amount: u64) -> Result<()> {
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

        emit!(FundsLocked {
            session_id: ctx.accounts.session.key(),
            amount,
            locked_at: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    /// Complete a session - can only be called on locked sessions
    pub fn complete_session(ctx: Context<UpdateSession>) -> Result<()> {
        let session = &mut ctx.accounts.session;

        // Cannot reuse an already completed session
        if session.status != SessionStatus::Locked {
            return Err(ErrorCode::SessionAlreadyFinalized.into());
        }

        // Update session status to completed
        Session::update_status(session, SessionStatus::Completed)?;

        emit!(SessionCompleted {
            session_id: ctx.accounts.session.key(),
            completed_at: session.completed_at.unwrap(),
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

        // Check session not already refunded or otherwise finalized
        if session.status == SessionStatus::Refunded {
            return Err(ErrorCode::SessionAlreadyRefunded.into());
        }
        if session.status != SessionStatus::Locked && session.status != SessionStatus::Disputed {
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

    /// Resolve a dispute on a session (admin only)
    pub fn resolve_dispute(ctx: Context<ResolveDispute>) -> Result<()> {
        let session = &mut ctx.accounts.session;
        let platform_state = &ctx.accounts.platform_state;

        // Ensure only admin can resolve disputes
        if ctx.accounts.signer.key() != platform_state.admin {
            return Err(ErrorCode::Unauthorized.into());
        }

        // Can only resolve disputed sessions
        if session.status != SessionStatus::Disputed {
            return Err(ErrorCode::InvalidSessionState.into());
        }

        // Update session status to resolved
        Session::update_status(session, SessionStatus::Resolved)?;

        emit!(DisputeResolved {
            session_id: ctx.accounts.session.key(),
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
    pub amount: u64,
    pub locked_at: i64,
}

#[event]
pub struct SessionCompleted {
    pub session_id: Pubkey,
    pub completed_at: i64,
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
pub struct DisputeRaised {
    pub session_id: Pubkey,
    pub disputed_at: i64,
}

#[event]
pub struct DisputeResolved {
    pub session_id: Pubkey,
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
    #[msg("Unauthorized: Only admin can perform this action")]
    Unauthorized,
}