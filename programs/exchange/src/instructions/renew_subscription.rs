use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::state::*;
use crate::errors::ExchangeError;
use crate::constants::*;
use crate::events::SubscriptionRenewed;

#[derive(Accounts)]
pub struct RenewSubscription<'info> {
    #[account(
        mut,
        seeds = [EXCHANGE_SEED],
        bump = exchange.bump,
    )]
    pub exchange: Box<Account<'info, DataExchange>>,
    #[account(
        mut,
        seeds = [LISTING_SEED, listing.provider.as_ref(), &listing.listing_id.to_le_bytes()],
        bump = listing.bump,
        constraint = listing.is_active @ ExchangeError::ListingNotActive,
    )]
    pub listing: Box<Account<'info, DataListing>>,
    #[account(
        mut,
        seeds = [SUBSCRIPTION_SEED, listing.key().as_ref(), buyer.key().as_ref()],
        bump = subscription.bump,
        constraint = subscription.buyer == buyer.key() @ ExchangeError::Unauthorized,
    )]
    pub subscription: Box<Account<'info, DataSubscription>>,
    #[account(
        mut,
        seeds = [PROVIDER_SEED, listing.provider.as_ref()],
        bump = provider.bump,
    )]
    pub provider: Box<Account<'info, DataProvider>>,
    #[account(
        mut,
        constraint = buyer_usdc.mint == exchange.usdc_mint @ ExchangeError::InsufficientPayment,
        constraint = buyer_usdc.owner == buyer.key() @ ExchangeError::Unauthorized,
    )]
    pub buyer_usdc: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        constraint = provider_usdc.mint == exchange.usdc_mint @ ExchangeError::InsufficientPayment,
        constraint = provider_usdc.owner == listing.provider @ ExchangeError::Unauthorized,
    )]
    pub provider_usdc: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        constraint = treasury_usdc.mint == exchange.usdc_mint @ ExchangeError::InsufficientPayment,
        constraint = treasury_usdc.owner == exchange.treasury @ ExchangeError::Unauthorized,
    )]
    pub treasury_usdc: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub buyer: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<RenewSubscription>, duration_months: u8) -> Result<()> {
    require!(duration_months > 0 && duration_months <= 24, ExchangeError::InvalidDuration);

    let clock = Clock::get()?;
    require!(
        ctx.accounts.subscription.expires_at < clock.unix_timestamp,
        ExchangeError::SubscriptionStillActive,
    );

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

    let expires_at = clock.unix_timestamp
        .checked_add(
            (duration_months as i64)
                .checked_mul(SECONDS_PER_MONTH)
                .ok_or(ExchangeError::PaymentOverflow)?
        )
        .ok_or(ExchangeError::PaymentOverflow)?;

    let queries_limit = (duration_months as u64)
        .checked_mul(DEFAULT_QUERIES_PER_MONTH)
        .ok_or(ExchangeError::PaymentOverflow)?;

    let sub = &mut ctx.accounts.subscription;
    sub.started_at = clock.unix_timestamp;
    sub.expires_at = expires_at;
    sub.queries_used = 0;
    sub.queries_limit = queries_limit;
    sub.has_rated = false;
    // keep access key if still active; buyer can reissue/revoke separately

    ctx.accounts.listing.total_revenue = ctx.accounts.listing.total_revenue
        .checked_add(total_payment)
        .ok_or(ExchangeError::PaymentOverflow)?;

    ctx.accounts.exchange.total_transactions = ctx.accounts.exchange.total_transactions
        .checked_add(1)
        .ok_or(ExchangeError::PaymentOverflow)?;

    ctx.accounts.provider.total_revenue = ctx.accounts.provider.total_revenue
        .checked_add(provider_amount)
        .ok_or(ExchangeError::PaymentOverflow)?;

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

    emit!(SubscriptionRenewed {
        listing: ctx.accounts.listing.key(),
        buyer: ctx.accounts.buyer.key(),
        total_payment,
        expires_at,
    });

    Ok(())
}
