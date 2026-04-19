use anchor_lang::prelude::*;
use crate::state::*;
use crate::errors::ExchangeError;
use crate::constants::*;
use crate::events::QueryExecuted;

#[derive(Accounts)]
pub struct QueryData<'info> {
    #[account(
        seeds = [EXCHANGE_SEED],
        bump = exchange.bump,
    )]
    pub exchange: Account<'info, DataExchange>,
    #[account(
        mut,
        seeds = [LISTING_SEED, listing.provider.as_ref(), &listing.listing_id.to_le_bytes()],
        bump = listing.bump,
        constraint = listing.is_active @ ExchangeError::ListingNotActive,
    )]
    pub listing: Account<'info, DataListing>,
    #[account(
        mut,
        seeds = [SUBSCRIPTION_SEED, listing.key().as_ref(), buyer.key().as_ref()],
        bump = subscription.bump,
        constraint = subscription.buyer == buyer.key() @ ExchangeError::Unauthorized,
    )]
    pub subscription: Account<'info, DataSubscription>,
    pub buyer: Signer<'info>,
}

pub fn handler(ctx: Context<QueryData>) -> Result<()> {
    let clock = Clock::get()?;
    let sub = &mut ctx.accounts.subscription;

    require!(
        clock.unix_timestamp < sub.expires_at,
        ExchangeError::SubscriptionExpired
    );

    require!(
        sub.queries_used < sub.queries_limit,
        ExchangeError::QueryLimitReached
    );

    sub.queries_used = sub.queries_used
        .checked_add(1)
        .ok_or(ExchangeError::PaymentOverflow)?;

    ctx.accounts.listing.total_queries = ctx.accounts.listing.total_queries
        .checked_add(1)
        .ok_or(ExchangeError::PaymentOverflow)?;

    emit!(QueryExecuted {
        listing: ctx.accounts.listing.key(),
        buyer: ctx.accounts.buyer.key(),
        queries_used: sub.queries_used,
        at: clock.unix_timestamp,
    });

    Ok(())
}
