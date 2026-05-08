pub const EXCHANGE_SEED: &[u8] = b"data_exchange";
pub const LISTING_SEED: &[u8] = b"listing";
pub const SUBSCRIPTION_SEED: &[u8] = b"subscription";
pub const PROVIDER_SEED: &[u8] = b"provider";
pub const QUERY_SEED: &[u8] = b"query";
pub const STAKE_SEED: &[u8] = b"stake_vault";

pub const BPS_DENOMINATOR: u64 = 10_000;
pub const MAX_TITLE_LEN: usize = 64;
pub const MAX_DESCRIPTION_LEN: usize = 256;
pub const MAX_NAME_LEN: usize = 64;
pub const SECONDS_PER_MONTH: i64 = 30 * 24 * 3600;
pub const DEFAULT_QUERIES_PER_MONTH: u64 = 1_000;
pub const MAX_MERKLE_DEPTH: usize = 24; // supports up to 2^24 leaves
// Renewals must happen within this window past expiry; beyond it the
// subscription is considered abandoned and the buyer must subscribe afresh.
pub const RENEW_GRACE_SECS: i64 = 90 * 24 * 3600; // 90 days
