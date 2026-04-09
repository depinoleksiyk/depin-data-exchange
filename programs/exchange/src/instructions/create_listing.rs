use anchor_lang::prelude::*;
use crate::state::*;
use crate::errors::ExchangeError;
use crate::constants::*;

#[derive(Accounts)]
#[instruction(listing_id: u64)]
pub struct CreateListing<'info> {
    #[account(
        mut,
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
        init,
        payer = provider_wallet,
        space = 8 + DataListing::INIT_SPACE,
        seeds = [LISTING_SEED, provider_wallet.key().as_ref(), &listing_id.to_le_bytes()],
        bump,
    )]
    pub listing: Account<'info, DataListing>,
    #[account(mut)]
    pub provider_wallet: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<CreateListing>,
    listing_id: u64,
    data_type: DataType,
    title: String,
    description: String,
    price_per_query: u64,
    price_subscription_monthly: u64,
) -> Result<()> {
    require!(title.len() <= MAX_TITLE_LEN, ExchangeError::NameTooLong);

    let clock = Clock::get()?;
    let listing = &mut ctx.accounts.listing;
    listing.provider = ctx.accounts.provider_wallet.key();
    listing.listing_id = listing_id;
    listing.data_type = data_type;
    listing.title = title;
    listing.description = description;
    listing.price_per_query = price_per_query;
    listing.price_subscription_monthly = price_subscription_monthly;
    listing.total_queries = 0;
    listing.total_revenue = 0;
    listing.quality_score = 50;
    listing.is_active = true;
    listing.zk_attestation = None;
    listing.created_at = clock.unix_timestamp;
    listing.bump = ctx.bumps.listing;

    ctx.accounts.exchange.total_listings = ctx.accounts.exchange.total_listings
        .checked_add(1)
        .ok_or(ExchangeError::PaymentOverflow)?;
    ctx.accounts.provider.total_listings += 1;

    Ok(())
}
