use anchor_lang::prelude::*;
use crate::state::DataExchange;
use crate::constants::EXCHANGE_SEED;

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
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<Initialize>, commission_bps: u16) -> Result<()> {
    let exchange = &mut ctx.accounts.exchange;
    exchange.authority = ctx.accounts.authority.key();
    exchange.treasury = ctx.accounts.authority.key();
    exchange.commission_bps = commission_bps;
    exchange.total_listings = 0;
    exchange.total_transactions = 0;
    exchange.usdc_mint = ctx.accounts.usdc_mint.key();
    exchange.bump = ctx.bumps.exchange;
    Ok(())
}
