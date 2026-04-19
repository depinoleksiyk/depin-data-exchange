use anchor_lang::prelude::*;
use crate::state::*;
use crate::errors::ExchangeError;
use crate::constants::*;
use crate::events::{AccessKeyIssued, AccessKeyRevoked};

#[derive(Accounts)]
pub struct IssueAccessKey<'info> {
    #[account(
        seeds = [LISTING_SEED, listing.provider.as_ref(), &listing.listing_id.to_le_bytes()],
        bump = listing.bump,
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

pub fn issue(ctx: Context<IssueAccessKey>, key_hash: [u8; 32]) -> Result<()> {
    require!(key_hash != [0u8; 32], ExchangeError::InvalidAccessKeyHash);

    let clock = Clock::get()?;
    require!(
        clock.unix_timestamp < ctx.accounts.subscription.expires_at,
        ExchangeError::SubscriptionExpired,
    );

    let sub = &mut ctx.accounts.subscription;
    sub.access_key_hash = key_hash;
    sub.access_key_active = true;
    sub.access_key_issued_at = clock.unix_timestamp;

    emit!(AccessKeyIssued {
        subscription: sub.key(),
        buyer: ctx.accounts.buyer.key(),
        issued_at: clock.unix_timestamp,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct RevokeAccessKey<'info> {
    #[account(
        seeds = [LISTING_SEED, listing.provider.as_ref(), &listing.listing_id.to_le_bytes()],
        bump = listing.bump,
    )]
    pub listing: Account<'info, DataListing>,
    #[account(
        mut,
        seeds = [SUBSCRIPTION_SEED, listing.key().as_ref(), buyer.key().as_ref()],
        bump = subscription.bump,
        constraint = subscription.buyer == buyer.key() @ ExchangeError::Unauthorized,
        constraint = subscription.access_key_active @ ExchangeError::NoAccessKey,
    )]
    pub subscription: Account<'info, DataSubscription>,
    pub buyer: Signer<'info>,
}

pub fn revoke(ctx: Context<RevokeAccessKey>) -> Result<()> {
    let clock = Clock::get()?;
    let sub = &mut ctx.accounts.subscription;
    sub.access_key_hash = [0u8; 32];
    sub.access_key_active = false;

    emit!(AccessKeyRevoked {
        subscription: sub.key(),
        buyer: ctx.accounts.buyer.key(),
        at: clock.unix_timestamp,
    });

    Ok(())
}
