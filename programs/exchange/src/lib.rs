#[allow(unused_imports)]
use anchor_lang::prelude::*;

mod constants;
mod errors;
mod instructions;
mod state;

use instructions::*;
use state::*;

// Marketplace logic
declare_id!("5mnqN7onSgqy9tBCTJ46N2mGr4Ty68fvCg4HqK5TsdTo");

#[program]
pub mod exchange {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, commission_bps: u16) -> Result<()> {
        instructions::initialize::handler(ctx, commission_bps)
    }

    pub fn register_provider(ctx: Context<RegisterProvider>, name: String) -> Result<()> {
        instructions::register_provider::handler(ctx, name)
    }

    pub fn create_listing(
        ctx: Context<CreateListing>,
        listing_id: u64,
        data_type: state::DataType,
        title: String,
        description: String,
        price_per_query: u64,
        price_subscription_monthly: u64,
    ) -> Result<()> {
        instructions::create_listing::handler(
            ctx, listing_id, data_type, title, description,
            price_per_query, price_subscription_monthly,
        )
    }

    pub fn subscribe(ctx: Context<Subscribe>, duration_months: u8) -> Result<()> {
        instructions::subscribe::handler(ctx, duration_months)
    }

    pub fn query_data(ctx: Context<QueryData>) -> Result<()> {
        instructions::query_data::handler(ctx)
    }

    pub fn rate_listing(ctx: Context<RateListing>, rating: u8) -> Result<()> {
        instructions::rate_listing::handler(ctx, rating)
    }

    pub fn renew_subscription(ctx: Context<RenewSubscription>, duration_months: u8) -> Result<()> {
        instructions::renew_subscription::handler(ctx, duration_months)
    }
}
