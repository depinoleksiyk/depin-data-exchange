use anchor_lang::prelude::*;
use anchor_lang::system_program::{self, Transfer};
use crate::state::*;
use crate::errors::ExchangeError;
use crate::constants::*;
use crate::events::{ProviderSlashed, ProviderStaked, ProviderUnstaked, SlashReason};

// ---- stake ----

#[derive(Accounts)]
pub struct StakeProvider<'info> {
    #[account(
        mut,
        seeds = [PROVIDER_SEED, provider_wallet.key().as_ref()],
        bump = provider.bump,
    )]
    pub provider: Account<'info, DataProvider>,
    #[account(
        mut,
        seeds = [STAKE_SEED, provider_wallet.key().as_ref()],
        bump = stake_vault.bump,
        constraint = stake_vault.provider == provider_wallet.key() @ ExchangeError::Unauthorized,
    )]
    pub stake_vault: Account<'info, ProviderStakeVault>,
    #[account(mut)]
    pub provider_wallet: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn stake(ctx: Context<StakeProvider>, amount: u64, lock_duration: i64) -> Result<()> {
    require!(amount > 0, ExchangeError::ZeroStake);

    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.key(),
            Transfer {
                from: ctx.accounts.provider_wallet.to_account_info(),
                to: ctx.accounts.stake_vault.to_account_info(),
            },
        ),
        amount,
    )?;

    let clock = Clock::get()?;
    let new_lock = clock.unix_timestamp
        .checked_add(lock_duration.max(0))
        .ok_or(ExchangeError::PaymentOverflow)?;

    let p = &mut ctx.accounts.provider;
    p.stake_amount = p.stake_amount
        .checked_add(amount)
        .ok_or(ExchangeError::PaymentOverflow)?;
    if new_lock > p.stake_locked_until {
        p.stake_locked_until = new_lock;
    }

    emit!(ProviderStaked {
        provider: p.wallet,
        added: amount,
        total: p.stake_amount,
        locked_until: p.stake_locked_until,
    });

    Ok(())
}

// ---- unstake ----

#[derive(Accounts)]
pub struct UnstakeProvider<'info> {
    #[account(
        mut,
        seeds = [PROVIDER_SEED, provider_wallet.key().as_ref()],
        bump = provider.bump,
    )]
    pub provider: Account<'info, DataProvider>,
    #[account(
        mut,
        seeds = [STAKE_SEED, provider_wallet.key().as_ref()],
        bump = stake_vault.bump,
        constraint = stake_vault.provider == provider_wallet.key() @ ExchangeError::Unauthorized,
    )]
    pub stake_vault: Account<'info, ProviderStakeVault>,
    #[account(mut)]
    pub provider_wallet: Signer<'info>,
}

pub fn unstake(ctx: Context<UnstakeProvider>, amount: u64) -> Result<()> {
    require!(amount > 0, ExchangeError::ZeroStake);

    let clock = Clock::get()?;
    require!(
        clock.unix_timestamp >= ctx.accounts.provider.stake_locked_until,
        ExchangeError::StakeLocked,
    );
    require!(
        amount <= ctx.accounts.provider.stake_amount,
        ExchangeError::UnstakeExceedsStake,
    );

    // Keep minimum rent for the vault account itself.
    let rent = Rent::get()?;
    let vault_rent = rent.minimum_balance(8 + ProviderStakeVault::INIT_SPACE);
    let vault_lamports = ctx.accounts.stake_vault.to_account_info().lamports();
    let withdrawable = vault_lamports.saturating_sub(vault_rent);
    require!(amount <= withdrawable, ExchangeError::UnstakeExceedsStake);

    **ctx.accounts.stake_vault.to_account_info().try_borrow_mut_lamports()? = vault_lamports
        .checked_sub(amount)
        .ok_or(ExchangeError::PaymentOverflow)?;
    **ctx.accounts.provider_wallet.to_account_info().try_borrow_mut_lamports()? = ctx.accounts
        .provider_wallet
        .to_account_info()
        .lamports()
        .checked_add(amount)
        .ok_or(ExchangeError::PaymentOverflow)?;

    let p = &mut ctx.accounts.provider;
    p.stake_amount = p.stake_amount
        .checked_sub(amount)
        .ok_or(ExchangeError::PaymentOverflow)?;

    emit!(ProviderUnstaked {
        provider: p.wallet,
        withdrawn: amount,
        remaining: p.stake_amount,
    });

    Ok(())
}

// ---- slash ----

#[derive(Accounts)]
pub struct SlashProvider<'info> {
    #[account(
        seeds = [EXCHANGE_SEED],
        bump = exchange.bump,
    )]
    pub exchange: Account<'info, DataExchange>,
    #[account(
        mut,
        seeds = [PROVIDER_SEED, provider_wallet.key().as_ref()],
        bump = provider.bump,
    )]
    pub provider: Account<'info, DataProvider>,
    #[account(
        mut,
        seeds = [STAKE_SEED, provider_wallet.key().as_ref()],
        bump = stake_vault.bump,
        constraint = stake_vault.provider == provider_wallet.key() @ ExchangeError::Unauthorized,
    )]
    pub stake_vault: Account<'info, ProviderStakeVault>,
    /// CHECK: identity anchor only, not read or written.
    pub provider_wallet: UncheckedAccount<'info>,
    #[account(
        mut,
        constraint = treasury.key() == exchange.treasury @ ExchangeError::Unauthorized,
    )]
    /// CHECK: treasury recipient, validated against exchange state.
    pub treasury: UncheckedAccount<'info>,
    #[account(
        constraint = oracle.key() == exchange.quality_oracle @ ExchangeError::NotQualityOracle,
    )]
    pub oracle: Signer<'info>,
}

pub fn slash(ctx: Context<SlashProvider>, amount: u64, reason: SlashReason) -> Result<()> {
    require!(amount > 0, ExchangeError::ZeroStake);
    require!(
        amount <= ctx.accounts.provider.stake_amount,
        ExchangeError::SlashExceedsStake,
    );

    // Persistent-low-quality slashes must respect the grace period.
    if matches!(reason, SlashReason::PersistentLowQuality) {
        let clock = Clock::get()?;
        let since = ctx.accounts.provider.low_quality_since;
        require!(since != 0, ExchangeError::QualityAboveThreshold);
        let elapsed = clock.unix_timestamp.saturating_sub(since);
        require!(
            elapsed >= ctx.accounts.exchange.slash_grace_period,
            ExchangeError::SlashGraceNotElapsed,
        );
    }

    let rent = Rent::get()?;
    let vault_rent = rent.minimum_balance(8 + ProviderStakeVault::INIT_SPACE);
    let vault_lamports = ctx.accounts.stake_vault.to_account_info().lamports();
    let withdrawable = vault_lamports.saturating_sub(vault_rent);
    require!(amount <= withdrawable, ExchangeError::SlashExceedsStake);

    **ctx.accounts.stake_vault.to_account_info().try_borrow_mut_lamports()? = vault_lamports
        .checked_sub(amount)
        .ok_or(ExchangeError::PaymentOverflow)?;
    **ctx.accounts.treasury.to_account_info().try_borrow_mut_lamports()? = ctx.accounts
        .treasury
        .to_account_info()
        .lamports()
        .checked_add(amount)
        .ok_or(ExchangeError::PaymentOverflow)?;

    let p = &mut ctx.accounts.provider;
    p.stake_amount = p.stake_amount
        .checked_sub(amount)
        .ok_or(ExchangeError::PaymentOverflow)?;
    p.slash_count = p.slash_count
        .checked_add(1)
        .ok_or(ExchangeError::PaymentOverflow)?;
    // reset grace window after slash
    p.low_quality_since = 0;

    emit!(ProviderSlashed {
        provider: p.wallet,
        amount,
        reason,
        at: Clock::get()?.unix_timestamp,
    });

    Ok(())
}
