use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::state::*;
use crate::errors::ExchangeError;
use crate::constants::*;

#[derive(Accounts)]
pub struct RenewSubscription<'info> {
    #[account(
        mut,
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
        constraint = subscription.expires_at < Clock::get()?.unix_timestamp @ ExchangeError::SubscriptionStillActive,
    )]
    pub subscription: Account<'info, DataSubscription>,
    #[account(
        mut,
        seeds = [PROVIDER_SEED, listing.provider.as_ref()],
        bump = provider.bump,
    )]
    pub provider: Account<'info, DataProvider>,
    #[account(
        mut,
        constraint = buyer_usdc.mint == exchange.usdc_mint @ ExchangeError::InsufficientPayment,
        constraint = buyer_usdc.owner == buyer.key() @ ExchangeError::Unauthorized,
    )]
    pub buyer_usdc: Account<'info, TokenAccount>,
    #[account(
        mut,
        constraint = provider_usdc.mint == exchange.usdc_mint @ ExchangeError::InsufficientPayment,
        constraint = provider_usdc.owner == listing.provider @ ExchangeError::Unauthorized,
    )]
    pub provider_usdc: Account<'info, TokenAccount>,
    #[account(
        mut,
        constraint = treasury_usdc.mint == exchange.usdc_mint @ ExchangeError::InsufficientPayment,
        constraint = treasury_usdc.owner == exchange.treasury @ ExchangeError::Unauthorized,
    )]
    pub treasury_usdc: Account<'info, TokenAccount>,
    #[account(mut)]
    pub buyer: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<RenewSubscription>, duration_months: u8) -> Result<()> {
    require!(duration_months > 0 && duration_months <= 24, ExchangeError::InvalidDuration);

    let clock = Clock::get()?;

    let total_payment = ctx.accounts.listing.price_subscription_monthly
        .checked_mul(duration_months as u64)
        .ok_or(ExchangeError::PaymentOverflow)?;

    let commission = total_payment
        .checked_mul(ctx.accounts.exchange.commission_bps as u64)
        .ok_or(ExchangeError::PaymentOverflow)?
        .checked_div(BPS_DENOMINATOR)
        .ok_or(ExchangeError::PaymentOverflow)?;

    let provider_amount = total_payment
        .checked_sub(commission)
        .ok_or(ExchangeError::PaymentOverflow)?;

    // state updates BEFORE CPI
    let sub = &mut ctx.accounts.subscription;
    sub.started_at = clock.unix_timestamp;
    sub.expires_at = clock.unix_timestamp
        .checked_add(
            (duration_months as i64)
                .checked_mul(30 * 24 * 3600)
                .ok_or(ExchangeError::PaymentOverflow)?
        )
        .ok_or(ExchangeError::PaymentOverflow)?;
    sub.queries_used = 0;
    sub.queries_limit = (duration_months as u64)
        .checked_mul(1000)
        .ok_or(ExchangeError::PaymentOverflow)?;

    ctx.accounts.listing.total_revenue = ctx.accounts.listing.total_revenue
        .checked_add(total_payment)
        .ok_or(ExchangeError::PaymentOverflow)?;

    ctx.accounts.exchange.total_transactions = ctx.accounts.exchange.total_transactions
        .checked_add(1)
        .ok_or(ExchangeError::PaymentOverflow)?;

    ctx.accounts.provider.total_revenue = ctx.accounts.provider.total_revenue
        .checked_add(provider_amount)
        .ok_or(ExchangeError::PaymentOverflow)?;

    // CPI: pay provider
    if provider_amount > 0 {
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.buyer_usdc.to_account_info(),
                    to: ctx.accounts.provider_usdc.to_account_info(),
                    authority: ctx.accounts.buyer.to_account_info(),
                },
            ),
            provider_amount,
        )?;
    }

    // CPI: pay commission
    if commission > 0 {
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.buyer_usdc.to_account_info(),
                    to: ctx.accounts.treasury_usdc.to_account_info(),
                    authority: ctx.accounts.buyer.to_account_info(),
                },
            ),
            commission,
        )?;
    }

    Ok(())
}
