use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct DataExchange {
    pub authority: Pubkey,
    pub treasury: Pubkey,
    pub quality_oracle: Pubkey,
    pub commission_bps: u16,
    pub total_listings: u64,
    pub total_transactions: u64,
    pub usdc_mint: Pubkey,
    pub slash_threshold: u8,   // quality score below which provider becomes slashable
    pub slash_grace_period: i64, // seconds a provider must stay below threshold before slash
    pub min_stake_lamports: u64, // minimum required stake to create a listing
    pub bump: u8,
}
