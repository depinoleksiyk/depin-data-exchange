use anchor_lang::prelude::*;

// what kind of data is this listing providing
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum DataType {
    Gps,
    Weather,
    Network,
    Camera,
}

#[account]
#[derive(InitSpace)]
pub struct DataListing {
    pub provider: Pubkey,
    pub listing_id: u64,
    pub data_type: DataType,
    #[max_len(64)]
    pub title: String,
    #[max_len(256)]
    pub description: String,
    pub price_per_query: u64,
    pub price_subscription_monthly: u64,
    pub total_queries: u64,
    pub total_revenue: u64,
    pub quality_score: u8,
    pub is_active: bool,
    pub zk_attestation: Option<[u8; 64]>,
    pub created_at: i64,
    pub bump: u8,
}
