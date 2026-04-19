use anchor_lang::prelude::*;

#[error_code]
pub enum ExchangeError {
    #[msg("Only the exchange authority can do this")]
    Unauthorized,
    #[msg("This data listing is not active")]
    ListingNotActive,
    #[msg("Data subscription has expired")]
    SubscriptionExpired,
    #[msg("Query limit reached for this subscription")]
    QueryLimitReached,
    #[msg("Insufficient USDC for this purchase")]
    InsufficientPayment,
    #[msg("Calculation overflow in payment")]
    PaymentOverflow,
    #[msg("Provider name exceeds maximum length")]
    NameTooLong,
    #[msg("Rating must be between 1 and 5")]
    InvalidRating,
    #[msg("Subscription duration must be 1-24 months")]
    InvalidDuration,
    #[msg("Commission rate exceeds maximum")]
    InvalidCommission,
    #[msg("Listing title exceeds maximum length")]
    TitleTooLong,
    #[msg("Listing description exceeds maximum length")]
    DescriptionTooLong,
    #[msg("Subscription is still active, cannot renew")]
    SubscriptionStillActive,

    // new
    #[msg("This subscription has already submitted a rating")]
    AlreadyRated,
    #[msg("Signer is not the configured quality oracle")]
    NotQualityOracle,
    #[msg("Quality score must be in the 0-100 range")]
    InvalidQualityScore,
    #[msg("Provider has not staked enough lamports to list")]
    InsufficientStake,
    #[msg("Staked lamports are still locked")]
    StakeLocked,
    #[msg("Provider quality is above the slash threshold")]
    QualityAboveThreshold,
    #[msg("Provider has not been below threshold long enough to slash")]
    SlashGraceNotElapsed,
    #[msg("Slash amount exceeds current stake")]
    SlashExceedsStake,
    #[msg("Merkle proof does not match committed snapshot root")]
    InvalidMerkleProof,
    #[msg("No snapshot has been committed for this listing")]
    NoSnapshot,
    #[msg("Access key hash must be exactly 32 bytes")]
    InvalidAccessKeyHash,
    #[msg("Subscription does not have an active access key")]
    NoAccessKey,
    #[msg("Stake amount must be greater than zero")]
    ZeroStake,
    #[msg("Unstake amount exceeds staked amount")]
    UnstakeExceedsStake,
    #[msg("Subscription has been abandoned past the renewal window")]
    SubscriptionAbandoned,
    #[msg("Provider price exceeds the protocol cap")]
    PriceTooHigh,
    #[msg("Access key hash is not a valid non-trivial value")]
    InvalidAccessKeyValue,
}
