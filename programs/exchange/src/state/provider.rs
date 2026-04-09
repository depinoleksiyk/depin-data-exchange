use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct DataProvider {
    pub wallet: Pubkey,
    #[max_len(64)]
    pub name: String,
    pub total_listings: u16,
    pub total_revenue: u64,
    pub avg_quality_score: u8,
    pub is_verified: bool,
    pub devices_registered: u16,
    pub bump: u8,
}
