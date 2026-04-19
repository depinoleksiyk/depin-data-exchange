use anchor_lang::prelude::*;
use crate::state::*;
use crate::errors::ExchangeError;
use crate::constants::*;
use crate::events::ListingCreated;

// Cap prices so a misconfigured provider can't brick subscribe with a
// u64::MAX price that would overflow checked_mul mid-flow.
// 1 million USDC (6 decimals) per query or month is well above any plausible
// real price but far below the overflow threshold.
const MAX_PRICE_USDC_RAW: u64 = 1_000_000 * 1_000_000;

#[derive(Accounts)]
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
        constraint = provider.stake_amount >= exchange.min_stake_lamports @ ExchangeError::InsufficientStake,
    )]
    pub provider: Account<'info, DataProvider>,
    #[account(
        init,
        payer = provider_wallet,
        space = 8 + DataListing::INIT_SPACE,
        seeds = [LISTING_SEED, provider_wallet.key().as_ref(), &provider.next_listing_id.to_le_bytes()],
        bump,
    )]
    pub listing: Account<'info, DataListing>,
    #[account(mut)]
    pub provider_wallet: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct CreateListingArgs {
    pub data_type: DataType,
    pub title: String,
    pub description: String,
    pub price_per_query: u64,
    pub price_subscription_monthly: u64,
}

pub fn handler(ctx: Context<CreateListing>, args: CreateListingArgs) -> Result<()> {
    require!(args.title.len() <= MAX_TITLE_LEN, ExchangeError::TitleTooLong);
    require!(args.description.len() <= MAX_DESCRIPTION_LEN, ExchangeError::DescriptionTooLong);
    require!(
        args.price_per_query <= MAX_PRICE_USDC_RAW,
        ExchangeError::PriceTooHigh,
    );
    require!(
        args.price_subscription_monthly <= MAX_PRICE_USDC_RAW,
        ExchangeError::PriceTooHigh,
    );

    let clock = Clock::get()?;
    let listing_id = ctx.accounts.provider.next_listing_id;

    let listing = &mut ctx.accounts.listing;
    listing.provider = ctx.accounts.provider_wallet.key();
    listing.listing_id = listing_id;
    listing.data_type = args.data_type;
    listing.title = args.title;
    listing.description = args.description;
    listing.price_per_query = args.price_per_query;
    listing.price_subscription_monthly = args.price_subscription_monthly;
    listing.total_queries = 0;
    listing.total_revenue = 0;
    // Start at 100 so a fresh listing is never instantly slashable, even if
    // the configured slash_threshold is close to 50. Quality decays as real
    // reports / ratings come in.
    listing.quality_score = 100;
    listing.is_active = true;
    listing.zk_attestation = None;
    listing.snapshot_root = [0u8; 32];
    listing.snapshot_index = 0;
    listing.snapshot_updated_at = 0;
    listing.quality_updated_at = 0;
    listing.created_at = clock.unix_timestamp;
    listing.bump = ctx.bumps.listing;

    ctx.accounts.exchange.total_listings = ctx.accounts.exchange.total_listings
        .checked_add(1)
        .ok_or(ExchangeError::PaymentOverflow)?;

    let p = &mut ctx.accounts.provider;
    p.total_listings = p.total_listings
        .checked_add(1)
        .ok_or(ExchangeError::PaymentOverflow)?;
    p.next_listing_id = p.next_listing_id
        .checked_add(1)
        .ok_or(ExchangeError::PaymentOverflow)?;

    emit!(ListingCreated {
        listing: ctx.accounts.listing.key(),
        provider: ctx.accounts.listing.provider,
        listing_id,
        price_per_query: ctx.accounts.listing.price_per_query,
        price_subscription_monthly: ctx.accounts.listing.price_subscription_monthly,
        at: clock.unix_timestamp,
    });

    Ok(())
}
