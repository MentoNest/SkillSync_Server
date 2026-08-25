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
        let buyer = ctx.accounts.buyer.key();
        let created_at = Clock::get()?.unix_timestamp;

        // Save the session using our helper function
        Session::save_session(session, buyer, seller, amount, created_at);

        emit!(SessionCreated {
            session_id: ctx.accounts.session.key(),
            buyer,
            seller,
            amount,
            created_at,
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
    #[account(
        init,
        payer = buyer,
        space = 8 + Session::INIT_SPACE,
        seeds = [b"session", buyer.key().as_ref(), &Clock::get()?.unix_timestamp.to_le_bytes()],
        bump
    )]
    pub session: Account<'info, Session>,
    #[account(mut)]
    pub buyer: Signer<'info>,
    pub system_program: Program<'info, System>,
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

#[error_code]
pub enum ErrorCode {
    #[msg("Fee must be between 0 and 1000 basis points (0-10%)")]
    FeeOutOfBounds,
    #[msg("Session with this ID already exists")]
    SessionAlreadyExists,
}