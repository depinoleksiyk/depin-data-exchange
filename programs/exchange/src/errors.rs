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
}
