use anchor_lang::prelude::*;
use crate::state::DataProvider;
use crate::errors::ExchangeError;
use crate::constants::*;

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
    provider.bump = ctx.bumps.provider;
    Ok(())
}
