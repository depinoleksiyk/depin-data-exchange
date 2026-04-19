use anchor_lang::prelude::*;
use crate::state::*;
use crate::errors::ExchangeError;
use crate::constants::*;
use crate::events::ListingRated;

#[derive(Accounts)]
pub struct RateListing<'info> {
    #[account(
        mut,
        seeds = [LISTING_SEED, listing.provider.as_ref(), &listing.listing_id.to_le_bytes()],
        bump = listing.bump,
    )]
    pub listing: Account<'info, DataListing>,
    #[account(
        mut,
        seeds = [SUBSCRIPTION_SEED, listing.key().as_ref(), buyer.key().as_ref()],
        bump = subscription.bump,
        constraint = subscription.buyer == buyer.key() @ ExchangeError::Unauthorized,
        constraint = !subscription.has_rated @ ExchangeError::AlreadyRated,
    )]
    pub subscription: Account<'info, DataSubscription>,
    pub buyer: Signer<'info>,
}

pub fn handler(ctx: Context<RateListing>, rating: u8) -> Result<()> {
    require!(rating >= 1 && rating <= 5, ExchangeError::InvalidRating);

    let listing = &mut ctx.accounts.listing;

    // rating 1-5 → score 20-100, moving avg with current quality_score
    let rating_scaled = (rating as u16)
        .checked_mul(20)
        .ok_or(ExchangeError::PaymentOverflow)?;

    let new_score = ((listing.quality_score as u16)
        .checked_add(rating_scaled)
        .ok_or(ExchangeError::PaymentOverflow)?
        .checked_div(2)
        .ok_or(ExchangeError::PaymentOverflow)?) as u8;

    listing.quality_score = new_score;

    ctx.accounts.subscription.has_rated = true;

    emit!(ListingRated {
        listing: listing.key(),
        buyer: ctx.accounts.buyer.key(),
        rating,
        new_score,
    });

    Ok(())
}
