use anchor_lang::prelude::*;
use std::collections::HashMap;

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
#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace)]
pub struct Session {
    pub buyer: Pubkey,
    pub seller: Pubkey,
    pub amount: u64,
    pub status: SessionStatus,
    pub created_at: i64,
    pub completed_at: Option<i64>,
    pub dispute_resolved_at: Option<i64>,
}

/// Platform state that holds all escrow sessions in a persistent mapping
#[account]
#[derive(InitSpace)]
pub struct PlatformState {
    pub admin: Pubkey,
    pub platform_fee_bps: u32, // Stored in basis points (1 bps = 0.01%)
    #[max_len(0)]
    pub sessions: HashMap<Pubkey, Session>, // Sessions mapping: Session ID (Pubkey) -> Session
}

// Helper implementation for Session management
impl PlatformState {
    /// Get a session by its ID
    pub fn get_session(&self, session_id: &Pubkey) -> Option<&Session> {
        self.sessions.get(session_id)
    }

    /// Save or update a session by its ID
    pub fn save_session(&mut self, session_id: Pubkey, session: Session) {
        self.sessions.insert(session_id, session);
    }

    /// Get current platform fee (for client-side use, Anchor automatically generates this)
    pub fn get_platform_fee(&self) -> u32 {
        self.platform_fee_bps
    }
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
        platform_state.sessions = HashMap::new();
        
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
        session_id: Pubkey,
        seller: Pubkey,
        amount: u64
    ) -> Result<()> {
        let platform_state = &mut ctx.accounts.platform_state;
        
        // Check if session already exists
        if platform_state.sessions.contains_key(&session_id) {
            return Err(ErrorCode::SessionAlreadyExists.into());
        }

        // Create new session with all required fields
        let session = Session {
            buyer: ctx.accounts.buyer.key(),
            seller,
            amount,
            status: SessionStatus::Locked,
            created_at: Clock::get()?.unix_timestamp,
            completed_at: None,
            dispute_resolved_at: None,
        };

        // Save the session using our helper function
        platform_state.save_session(session_id, session);

        emit!(SessionCreated {
            session_id,
            buyer: ctx.accounts.buyer.key(),
            seller,
            amount,
            created_at: Clock::get()?.unix_timestamp,
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