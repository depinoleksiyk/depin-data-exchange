use anchor_lang::prelude::*;
use crate::state::{DataProvider, ProviderStakeVault};
use crate::errors::ExchangeError;
use crate::constants::*;
use crate::events::ProviderRegistered;

#[derive(Accounts)]
pub struct RegisterProvider<'info> {
    #[account(
        init,
        payer = wallet,
        space = 8 + DataProvider::INIT_SPACE,
        seeds = [PROVIDER_SEED, wallet.key().as_ref()],
        bump,
    )]
    pub provider: Account<'info, DataProvider>,
    #[account(
        init,
        payer = wallet,
        space = 8 + ProviderStakeVault::INIT_SPACE,
        seeds = [STAKE_SEED, wallet.key().as_ref()],
        bump,
    )]
    pub stake_vault: Account<'info, ProviderStakeVault>,
    #[account(mut)]
    pub wallet: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<RegisterProvider>, name: String) -> Result<()> {
    require!(name.len() <= MAX_NAME_LEN, ExchangeError::NameTooLong);

    let provider = &mut ctx.accounts.provider;
    provider.wallet = ctx.accounts.wallet.key();
    provider.name = name;
    provider.total_listings = 0;
    provider.total_revenue = 0;
    provider.avg_quality_score = 0;
    provider.is_verified = false;
    provider.devices_registered = 0;
    provider.next_listing_id = 1;
    provider.stake_amount = 0;
    provider.stake_locked_until = 0;
    provider.slash_count = 0;
    provider.low_quality_since = 0;
    provider.bump = ctx.bumps.provider;

    let vault = &mut ctx.accounts.stake_vault;
    vault.provider = ctx.accounts.wallet.key();
    vault.bump = ctx.bumps.stake_vault;

    emit!(ProviderRegistered {
        wallet: ctx.accounts.wallet.key(),
        at: Clock::get()?.unix_timestamp,
    });
    Ok(())
}
