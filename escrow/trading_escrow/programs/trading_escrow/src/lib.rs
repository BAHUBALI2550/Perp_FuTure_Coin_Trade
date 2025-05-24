use anchor_lang::prelude::*;

declare_id!("5ZHtRgU8gaPUMjUkWBFjxNF9o5m7Cr4jJ71PXTiE6TKc");

#[program]
pub mod trading_escrow {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>, 
        vault: Pubkey, 
        backend: Pubkey
    ) -> Result<()> {
        // Validate that provided vault and backend addresses are not default
        require!(vault != Pubkey::default(), ErrorCode::InvalidVault);
        require!(backend != Pubkey::default(), ErrorCode::InvalidBackend);
        
        // Assuming you want to store these values or use them somehow.
        // Since we're not storing them in a Config struct or similar, we'll just log them.
        msg!("Vault set to: {:?}", vault);
        msg!("Backend set to: {:?}", backend);
        // If you want to save these addresses, you'd typically manage this in state.
        // You might need to handle logic around these accounts depending on your use case.
        // Currently, no action is required to initialize them in this context.
        Ok(())
    }

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        let depositor = &ctx.accounts.depositor;
        let vault = &mut ctx.accounts.vault;

        // Transfer SOL from user to vault
        **depositor.to_account_info().try_borrow_mut_lamports()? -= amount;
        **vault.to_account_info().try_borrow_mut_lamports()? += amount;
        Ok(())
    }

   pub fn liquidate(ctx: Context<Liquidate>, fee: i64, amount: u64) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    let backend = &mut ctx.accounts.backend;
    let user = &mut ctx.accounts.user;

    let vault_balance = **vault.to_account_info().lamports.borrow();

    // Check if amount to liquidate is valid
    if amount > vault_balance {
        return Err(ErrorCode::InvalidLiquidationAmount.into());
    }

    // Determine fee and remaining
    if fee >= 0 {
        let fee_amount = fee as u64;
        // Adjust vault and backend for fee
        **vault.to_account_info().try_borrow_mut_lamports()? -= fee_amount;
        **backend.to_account_info().try_borrow_mut_lamports()? += fee_amount;

        // Transfer only the specified amount to user
        **vault.to_account_info().try_borrow_mut_lamports()? -= amount;
        **user.try_borrow_mut_lamports()? += amount;

    } else {
        // Negative fee
        let fee_amount = (-fee) as u64;

        if **backend.to_account_info().lamports.borrow() >= fee_amount {
            // Deduct fee from backend
            **backend.to_account_info().try_borrow_mut_lamports()? -= fee_amount;
            // Send fee plus amount to user
            **backend.to_account_info().try_borrow_mut_lamports()? -= amount;
            **user.try_borrow_mut_lamports()? += amount + fee_amount;
        } else {
            // Not enough funds in backend
            let backend_balance = **backend.to_account_info().lamports.borrow();
            **backend.to_account_info().try_borrow_mut_lamports()? -= backend_balance;
            **user.try_borrow_mut_lamports()? += backend_balance + amount;
        }
    }

    Ok(())
}
}

// Contexts
#[derive(Accounts)]
pub struct Initialize<'info> {
    /// CHECK: We are trusting this account (e.g., PDA or external account)
    #[account(mut)]
    pub vault: AccountInfo<'info>,
    /// CHECK: This account is controlled externally
    #[account(mut)]
    pub backend: AccountInfo<'info>,
    #[account(mut)]
    pub owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub depositor: Signer<'info>,
    /// CHECK: We are trusting this account (e.g., PDA or external account)
    #[account(mut)]
    pub vault: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct Liquidate<'info> {
    /// CHECK: We are trusting this account (e.g., PDA or external account)
    #[account(mut)]
    pub vault: AccountInfo<'info>,
    /// CHECK: This account is controlled externally
    #[account(mut)]
    pub backend: AccountInfo<'info>,
    /// CHECK: This account is controlled externally
    #[account(mut)]
    pub user: AccountInfo<'info>,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Invalid vault address")]
    InvalidVault,
    #[msg("Invalid backend address")]
    InvalidBackend,
    #[msg("Invalid liquidation amount")]
    InvalidLiquidationAmount,
}