use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

declare_id!("gv4Ep7vbpPgHfTkZbgb834Jyve2mH19iSqCsQy6oukn");


#[program]
pub mod escrow {
    use super::*;

    pub fn deposit_funds(
        ctx: Context<DepositFunds>,
        amount: u64,
        _position_id: String,
    ) -> Result<()> {
        let ix = anchor_lang::solana_program::system_instruction::transfer(
            ctx.accounts.user.key,
            ctx.accounts.vault.key,
            amount,
        );
        anchor_lang::solana_program::program::invoke(
            &ix,
            &[
                ctx.accounts.user.to_account_info(),
                ctx.accounts.vault.to_account_info(),
            ],
        )?;
        Ok(())
    }

    pub fn release_funds(
        ctx: Context<ReleaseFunds>,
        total_payout: u64,
        total_fee: i64,
    ) -> Result<()> {
        let vault = &ctx.accounts.vault;
        let vault_bump = ctx.bumps.vault;
        let escrow_key = ctx.accounts.escrow.key(); // bind to keep it alive
        let seeds = &[b"vault", escrow_key.as_ref(), &[vault_bump]];
        let signer_seeds = &[&seeds[..]];

        if total_fee >= 0 {
            let fee_u64 = total_fee as u64;
            require!(total_payout > fee_u64, EscrowError::InsufficientPayout);

            let payout_to_user = total_payout - fee_u64;

            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: vault.to_account_info(),
                        to: ctx.accounts.backend_token_account.to_account_info(),
                        authority: vault.to_account_info(),
                    },
                    signer_seeds,
                ),
                fee_u64,
            )?;

            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: vault.to_account_info(),
                        to: ctx.accounts.user_token_account.to_account_info(),
                        authority: vault.to_account_info(),
                    },
                    signer_seeds,
                ),
                payout_to_user,
            )?;
        } else {
            let fee_u64 = (-total_fee) as u64;
            let total_user_payout = total_payout + fee_u64;

            token::transfer(
                CpiContext::new(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.backend_token_account.to_account_info(),
                        to: vault.to_account_info(),
                        authority: ctx.accounts.backend.to_account_info(),
                    },
                ),
                fee_u64,
            )?;

            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: vault.to_account_info(),
                        to: ctx.accounts.user_token_account.to_account_info(),
                        authority: vault.to_account_info(),
                    },
                    signer_seeds,
                ),
                total_user_payout,
            )?;
        }

        Ok(())
    }
}

#[account]
pub struct EscrowAccount {
    pub initializer: Pubkey,
    pub created_at: i64,
    pub vault_bump: u8,
    pub vault: Pubkey, // just the vault's address
    // Add whatever fields you need to track for your escrow
}

#[derive(Accounts)]
pub struct DepositFunds<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    /// CHECK: This is a PDA vault account and its validity is ensured via seeds and bump
    #[account(mut)]
    pub vault: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ReleaseFunds<'info> {
    #[account(
        mut,
        seeds = [b"vault", escrow.key().as_ref()],
        bump,
    )]
    pub vault: Account<'info, TokenAccount>,

    #[account(mut)]
    pub escrow: Account<'info, EscrowAccount>,

    /// CHECK: destination is a generic SPL token account (used as fallback if needed)
    #[account(mut)]
    pub destination: Account<'info, TokenAccount>,

    #[account(mut)]
    pub backend_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user_token_account: Account<'info, TokenAccount>,

    /// CHECK: backend is a signer and only used for authority check
    #[account(signer)]
    pub backend: AccountInfo<'info>,

    #[account(signer)]
    pub authority: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

#[error_code]
pub enum EscrowError {
    #[msg("Total payout must be greater than fee")]
    InsufficientPayout,
}
