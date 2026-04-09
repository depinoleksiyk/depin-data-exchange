use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct DataExchange {
    pub authority: Pubkey,
    pub treasury: Pubkey,
    pub commission_bps: u16,
    pub total_listings: u64,
    pub total_transactions: u64,
    pub usdc_mint: Pubkey,
    pub bump: u8,
}
