use anchor_lang::prelude::*;
use crate::state::*;
use crate::errors::ExchangeError;
use crate::constants::*;
use crate::events::QualityUpdated;

#[derive(Accounts)]
pub struct UpdateQuality<'info> {
    #[account(
        seeds = [EXCHANGE_SEED],
        bump = exchange.bump,
    )]
    pub exchange: Account<'info, DataExchange>,
    #[account(
        mut,
        seeds = [LISTING_SEED, listing.provider.as_ref(), &listing.listing_id.to_le_bytes()],
        bump = listing.bump,
    )]
    pub listing: Account<'info, DataListing>,
    #[account(
        mut,
        seeds = [PROVIDER_SEED, listing.provider.as_ref()],
        bump = provider.bump,
    )]
    pub provider: Account<'info, DataProvider>,
    #[account(
        constraint = oracle.key() == exchange.quality_oracle @ ExchangeError::NotQualityOracle,
    )]
    pub oracle: Signer<'info>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct QualityReport {
    pub freshness: u8,
    pub accuracy: u8,
    pub completeness: u8,
    pub overall: u8,
}

pub fn handler(ctx: Context<UpdateQuality>, report: QualityReport) -> Result<()> {
    require!(report.overall <= 100, ExchangeError::InvalidQualityScore);
    require!(report.freshness <= 100, ExchangeError::InvalidQualityScore);
    require!(report.accuracy <= 100, ExchangeError::InvalidQualityScore);
    require!(report.completeness <= 100, ExchangeError::InvalidQualityScore);

    let clock = Clock::get()?;
    let listing = &mut ctx.accounts.listing;
    let provider = &mut ctx.accounts.provider;
    let exchange = &ctx.accounts.exchange;

    listing.quality_score = report.overall;
    listing.quality_updated_at = clock.unix_timestamp;

    // Track how long this provider has been below the slash threshold.
    if report.overall < exchange.slash_threshold {
        if provider.low_quality_since == 0 {
            provider.low_quality_since = clock.unix_timestamp;
        }
    } else {
        provider.low_quality_since = 0;
    }

    // Update provider moving-average quality (weight: 3/4 old, 1/4 new).
    let blended = ((provider.avg_quality_score as u16)
        .checked_mul(3)
        .ok_or(ExchangeError::PaymentOverflow)?
        .checked_add(report.overall as u16)
        .ok_or(ExchangeError::PaymentOverflow)?
        .checked_div(4)
        .ok_or(ExchangeError::PaymentOverflow)?) as u8;
    provider.avg_quality_score = blended;

    emit!(QualityUpdated {
        listing: listing.key(),
        score: report.overall,
        freshness: report.freshness,
        accuracy: report.accuracy,
        completeness: report.completeness,
        at: clock.unix_timestamp,
    });

    Ok(())
}
