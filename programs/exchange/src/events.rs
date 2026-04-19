use anchor_lang::prelude::*;

#[event]
pub struct SubscriptionCreated {
    pub listing: Pubkey,
    pub buyer: Pubkey,
    pub total_payment: u64,
    pub expires_at: i64,
}

#[event]
pub struct SubscriptionRenewed {
    pub listing: Pubkey,
    pub buyer: Pubkey,
    pub total_payment: u64,
    pub expires_at: i64,
}

#[event]
pub struct QueryExecuted {
    pub listing: Pubkey,
    pub buyer: Pubkey,
    pub queries_used: u64,
    pub at: i64,
}

#[event]
pub struct QualityUpdated {
    pub listing: Pubkey,
    pub score: u8,
    pub freshness: u8,
    pub accuracy: u8,
    pub completeness: u8,
    pub at: i64,
}

#[event]
pub struct SnapshotCommitted {
    pub listing: Pubkey,
    pub index: u64,
    pub root: [u8; 32],
    pub at: i64,
}

#[event]
pub struct ProviderStaked {
    pub provider: Pubkey,
    pub added: u64,
    pub total: u64,
    pub locked_until: i64,
}

#[event]
pub struct ProviderUnstaked {
    pub provider: Pubkey,
    pub withdrawn: u64,
    pub remaining: u64,
}

#[event]
pub struct ProviderSlashed {
    pub provider: Pubkey,
    pub amount: u64,
    pub reason: SlashReason,
    pub at: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub enum SlashReason {
    PersistentLowQuality,
    FailedAttestation,
    ManualAuthority,
}

#[event]
pub struct AccessKeyIssued {
    pub subscription: Pubkey,
    pub buyer: Pubkey,
    pub issued_at: i64,
}

#[event]
pub struct AccessKeyRevoked {
    pub subscription: Pubkey,
    pub buyer: Pubkey,
    pub at: i64,
}

#[event]
pub struct ListingRated {
    pub listing: Pubkey,
    pub buyer: Pubkey,
    pub rating: u8,
    pub new_score: u8,
}
