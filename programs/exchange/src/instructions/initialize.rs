use anchor_lang::prelude::*;
use crate::state::DataExchange;
use crate::constants::EXCHANGE_SEED;
use crate::errors::ExchangeError;

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + DataExchange::INIT_SPACE,
        seeds = [EXCHANGE_SEED],
        bump,
    )]
    pub exchange: Account<'info, DataExchange>,
    pub usdc_mint: Account<'info, anchor_spl::token::Mint>,
    /// CHECK: quality oracle public key; validated as Signer when it invokes update_quality/slash.
    pub quality_oracle: UncheckedAccount<'info>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct ExchangeInitArgs {
    pub commission_bps: u16,
    pub slash_threshold: u8,
    pub slash_grace_period: i64,
    pub min_stake_lamports: u64,
}

// 20 % is a generous upper bound for a marketplace commission; higher values
// are almost certainly a misconfiguration and would hurt buyer UX enough
// that nobody would subscribe anyway.
const MAX_COMMISSION_BPS: u16 = 2_000;

pub fn handler(ctx: Context<Initialize>, args: ExchangeInitArgs) -> Result<()> {
    require!(
        args.commission_bps <= MAX_COMMISSION_BPS,
        ExchangeError::InvalidCommission,
    );
    require!(args.slash_threshold <= 100, ExchangeError::InvalidQualityScore);

    let exchange = &mut ctx.accounts.exchange;
    exchange.authority = ctx.accounts.authority.key();
    exchange.treasury = ctx.accounts.authority.key();
    exchange.quality_oracle = ctx.accounts.quality_oracle.key();
    exchange.commission_bps = args.commission_bps;
    exchange.total_listings = 0;
    exchange.total_transactions = 0;
    exchange.usdc_mint = ctx.accounts.usdc_mint.key();
    exchange.slash_threshold = args.slash_threshold;
    exchange.slash_grace_period = args.slash_grace_period;
    exchange.min_stake_lamports = args.min_stake_lamports;
    exchange.bump = ctx.bumps.exchange;
    Ok(())
}
