use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct DataSubscription {
    pub buyer: Pubkey,
    pub listing: Pubkey,
    pub started_at: i64,
    pub expires_at: i64,
    pub queries_used: u64,
    pub queries_limit: u64,
    pub bump: u8,
}
