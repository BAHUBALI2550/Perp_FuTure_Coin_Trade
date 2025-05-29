
use anchor_lang::prelude::*;

declare_id!("5ZHtRgU8gaPUMjUkWBFjxNF9o5m7Cr4jJ71PXTiE6TKc");

// Error codes
#[error_code]
pub enum ErrorCode {
    #[msg("Unauthorized backend")]
    UnauthorizedBackend,
    #[msg("Insufficient vault balance")]
    InsufficientVaultBalance,
    #[msg("Insufficient backend balance for transfer")]
    InsufficientBackendBalance,
    #[msg("Withdrawal overflow/underflow")]
    WithdrawalArithmeticError,
}

// Each deposit by user is stored in this struct
#[account]
pub struct UserAccount {
    pub user: Pubkey,
    pub deposit_amount: u64,      // In lamports
    pub bump: u8,
}

// Stores settings and authority pubkeys
#[account]
pub struct VaultState {
    pub bump: u8,
    pub authority: Pubkey,        // Backend authority key
    pub backend_wallet: Pubkey,   // Backend's hot wallet for liquidation
    pub sol_vault: Pubkey,        // PDA of Sol vault
    pub total_deposit: u64,
}

#[program]
pub mod trading_escrow {
    use super::*;

    // Initialize vault with backend authority
    pub fn initialize(
        ctx: Context<Initialize>, 
        backend_wallet: Pubkey,
    ) -> Result<()> {
        let vault_state = &mut ctx.accounts.vault_state;
        vault_state.bump = ctx.bumps.vault_state;
        vault_state.authority = ctx.accounts.authority.key();
        vault_state.backend_wallet = backend_wallet;
        vault_state.sol_vault = ctx.accounts.sol_vault.key();
        vault_state.total_deposit = 0;
        Ok(())
    }

    pub fn initialize_user_account(ctx: Context<InitializeUserAccount>) -> Result<()> {
        let user_acct = &mut ctx.accounts.user_account;
        user_acct.user = ctx.accounts.user.key();
        user_acct.deposit_amount = 0;
        user_acct.bump = ctx.bumps.user_account;
        Ok(())
    }

    // Called by user to deposit SOL for a stock
    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        let user_acct = &mut ctx.accounts.user_account;

        // Check if the user account is already initialized
        if user_acct.user == Pubkey::default() {
            // Initialize the user account
            user_acct.user = ctx.accounts.user.key();
            user_acct.deposit_amount = 0; // Start with 0 deposits
        }

        // Transfer SOL from user to the vault (PDA)
        let ix = anchor_lang::solana_program::system_instruction::transfer(
            &ctx.accounts.user.key(),
            &ctx.accounts.sol_vault.key(),
            amount,
        );
        anchor_lang::solana_program::program::invoke(
            &ix,
            &[
                ctx.accounts.user.to_account_info(),
                ctx.accounts.sol_vault.to_account_info(),
            ],
        )?;
        user_acct.user = ctx.accounts.user.key();
        user_acct.deposit_amount = user_acct.deposit_amount.checked_add(amount)
            .ok_or(ErrorCode::WithdrawalArithmeticError)?;
        ctx.accounts.vault_state.total_deposit = ctx.accounts.vault_state.total_deposit.checked_add(amount)
            .ok_or(ErrorCode::WithdrawalArithmeticError)?;
        Ok(())
    }

    // Liquidation: called by backend
    // collateral: how much to take for backend
    // to_transfer: if >0, amount to send from backend_wallet to user (e.g. refund on partial liquidation)
    #[access_control(only_backend(&ctx.accounts.vault_state, &ctx.accounts.backend_authority))]
    pub fn liquidate(
        ctx: Context<Liquidate>,
        collateral: u64,
        to_transfer: i64,
    ) -> Result<()> {
        let vault_lamports = ctx.accounts.sol_vault.to_account_info().lamports();
        require!(collateral <= vault_lamports, ErrorCode::InsufficientVaultBalance);

        // Transfer collateral from vault to backend_wallet
        let sol_vault_bump = ctx.bumps.sol_vault;
        let transfer_to_backend_ix = anchor_lang::solana_program::system_instruction::transfer(
        &ctx.accounts.sol_vault.key(),
        &ctx.accounts.backend_wallet.key(),
        collateral,
    );

    anchor_lang::solana_program::program::invoke_signed(
        &transfer_to_backend_ix,
        &[
            ctx.accounts.sol_vault.to_account_info(),
            ctx.accounts.backend_wallet.to_account_info(),
        ],
        &[&[b"sol-vault", &[sol_vault_bump]]], 
    )?;

        // If backend needs to return some funds to the user (e.g. after a stoploss triggers)
        if to_transfer > 0 {
            let amount = to_transfer as u64;
            let backend_balance = ctx.accounts.backend_wallet.to_account_info().lamports();
            require!(amount <= backend_balance, ErrorCode::InsufficientBackendBalance);
            let transfer_back_ix = anchor_lang::solana_program::system_instruction::transfer(
            &ctx.accounts.backend_wallet.key(),
            &ctx.accounts.user.key(),
            amount
        );
        anchor_lang::solana_program::program::invoke(
            &transfer_back_ix,
            &[
                ctx.accounts.backend_wallet.to_account_info(),
                ctx.accounts.user.to_account_info(),
            ],
        )?;
        }
        // Optionally: update user's and vault_state's internal accounting
        // For illustration, we'll reduce user_account.deposit_amount by collateral, not tracking remainders/refunds
        ctx.accounts.user_account.deposit_amount = 0;
        ctx.accounts.vault_state.total_deposit = ctx.accounts.vault_state.total_deposit.checked_sub(collateral)
            .ok_or(ErrorCode::WithdrawalArithmeticError)?;
        Ok(())
    }
}

// Checks that the caller is the backend authority
fn only_backend(vault_state: &Account<VaultState>, signer: &Signer) -> Result<()> {
    require!(vault_state.backend_wallet == signer.key(), ErrorCode::UnauthorizedBackend);
    Ok(())
}

// Instruction context (account) structs:
#[derive(Accounts)]
#[instruction()]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init,
        payer = authority,
        space = 8 + 1 + 32 + 32 + 32 + 8,
        seeds = [b"vault-state"],
        bump,
    )]
    pub vault_state: Account<'info, VaultState>,
    #[account(
        mut,
        seeds = [b"sol-vault"],
        bump,
    )]
    /// CHECK: Vault holds SOL (system account), owned by PDA
    pub sol_vault: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct InitializeUserAccount<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(
        init,
        payer = user,
        space = 8 + 32 + 8 + 1,
        seeds = [b"user-acct", user.key().as_ref()],
        bump,
    )]
    pub user_account: Account<'info, UserAccount>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    /// CHECK: System account for user wallet
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(
        mut,
        seeds = [b"vault-state"],
        bump = vault_state.bump,
    )]
    pub vault_state: Account<'info, VaultState>,
    #[account(
        mut,
        seeds = [b"user-acct", user.key().as_ref()],
        bump,
    )]
    pub user_account: Account<'info, UserAccount>,
    #[account(
        mut,
        seeds = [b"sol-vault"],
        bump,
    )]
    /// CHECK: System account for vaulting SOL
    pub sol_vault: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Liquidate<'info> {
    #[account(mut)]
    pub backend_authority: Signer<'info>,
    #[account(
        mut,
        seeds = [b"vault-state"],
        bump = vault_state.bump,
    )]
    pub vault_state: Account<'info, VaultState>,
    #[account(
        mut,
        seeds = [b"user-acct", user.key().as_ref()],
        bump,
    )]
    pub user_account: Account<'info, UserAccount>,
    /// CHECK: System account for backend wallet
    #[account(mut)]
    pub backend_wallet: UncheckedAccount<'info>,
    /// CHECK: System account for user wallet
    #[account(mut)]
    pub user: UncheckedAccount<'info>,
    /// CHECK: Vault holds SOL (system account), owned by PDA
    #[account(
        mut,
        seeds = [b"sol-vault"],
        bump,
    )]
    pub sol_vault: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

