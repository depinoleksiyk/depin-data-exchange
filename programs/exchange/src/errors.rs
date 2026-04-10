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
}
