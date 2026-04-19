#[allow(unused_imports)]
use anchor_lang::prelude::*;

mod constants;
mod errors;
mod events;
mod instructions;
mod state;

use events::SlashReason;
use instructions::*;

// Marketplace logic
declare_id!("3gGkKra1uhoDukSkFLCux8j3gkxoMdUjzMfHzLGKkyzk");

#[program]
pub mod exchange {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, args: ExchangeInitArgs) -> Result<()> {
        instructions::initialize::handler(ctx, args)
    }

    pub fn register_provider(ctx: Context<RegisterProvider>, name: String) -> Result<()> {
        instructions::register_provider::handler(ctx, name)
    }

    pub fn create_listing(
        ctx: Context<CreateListing>,
        args: CreateListingArgs,
    ) -> Result<()> {
        instructions::create_listing::handler(ctx, args)
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

    pub fn update_quality(ctx: Context<UpdateQuality>, report: QualityReport) -> Result<()> {
        instructions::update_quality::handler(ctx, report)
    }

    pub fn issue_access_key(ctx: Context<IssueAccessKey>, key_hash: [u8; 32]) -> Result<()> {
        instructions::access_key::issue(ctx, key_hash)
    }

    pub fn revoke_access_key(ctx: Context<RevokeAccessKey>) -> Result<()> {
        instructions::access_key::revoke(ctx)
    }

    pub fn stake_provider(ctx: Context<StakeProvider>, amount: u64, lock_duration: i64) -> Result<()> {
        instructions::staking::stake(ctx, amount, lock_duration)
    }

    pub fn unstake_provider(ctx: Context<UnstakeProvider>, amount: u64) -> Result<()> {
        instructions::staking::unstake(ctx, amount)
    }

    pub fn slash_provider(ctx: Context<SlashProvider>, amount: u64, reason: SlashReason) -> Result<()> {
        instructions::staking::slash(ctx, amount, reason)
    }

    pub fn commit_snapshot(ctx: Context<CommitSnapshot>, root: [u8; 32]) -> Result<()> {
        instructions::snapshot::commit(ctx, root)
    }

    pub fn verify_sample(ctx: Context<VerifySample>, args: MerkleProofArgs) -> Result<()> {
        instructions::snapshot::verify(ctx, args)
    }

    // --- one-shot migration helpers (v1 → v2 state reset) ---

    pub fn close_legacy_exchange(ctx: Context<CloseLegacyExchange>) -> Result<()> {
        instructions::migration::close_exchange(ctx)
    }

    pub fn close_legacy_provider(ctx: Context<CloseLegacyProvider>) -> Result<()> {
        instructions::migration::close_provider(ctx)
    }

    pub fn close_legacy_listing(ctx: Context<CloseLegacyListing>, listing_id: u64) -> Result<()> {
        instructions::migration::close_listing(ctx, listing_id)
    }
}
