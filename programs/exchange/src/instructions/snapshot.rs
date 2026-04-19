use anchor_lang::prelude::*;
use solana_keccak_hasher::hashv;
use crate::state::*;
use crate::errors::ExchangeError;
use crate::constants::*;
use crate::events::SnapshotCommitted;

// Provider commits a Merkle root describing the current dataset snapshot.
// Buyers / the gateway can later request a random leaf + proof and verify it.

#[derive(Accounts)]
pub struct CommitSnapshot<'info> {
    #[account(
        mut,
        seeds = [LISTING_SEED, provider_wallet.key().as_ref(), &listing.listing_id.to_le_bytes()],
        bump = listing.bump,
        constraint = listing.provider == provider_wallet.key() @ ExchangeError::Unauthorized,
    )]
    pub listing: Account<'info, DataListing>,
    pub provider_wallet: Signer<'info>,
}

pub fn commit(ctx: Context<CommitSnapshot>, root: [u8; 32]) -> Result<()> {
    let clock = Clock::get()?;
    let listing = &mut ctx.accounts.listing;
    listing.snapshot_root = root;
    listing.snapshot_index = listing.snapshot_index
        .checked_add(1)
        .ok_or(ExchangeError::PaymentOverflow)?;
    listing.snapshot_updated_at = clock.unix_timestamp;

    emit!(SnapshotCommitted {
        listing: listing.key(),
        index: listing.snapshot_index,
        root,
        at: clock.unix_timestamp,
    });

    Ok(())
}

// Read-only verification — anyone can call to assert that a leaf belongs to
// the listing's committed root. We keep it on-chain so the gateway can present
// a provable answer to an auditor without needing additional infrastructure.

#[derive(Accounts)]
pub struct VerifySample<'info> {
    #[account(
        seeds = [LISTING_SEED, listing.provider.as_ref(), &listing.listing_id.to_le_bytes()],
        bump = listing.bump,
    )]
    pub listing: Account<'info, DataListing>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct MerkleProofArgs {
    pub leaf: [u8; 32],
    pub path: Vec<ProofNode>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct ProofNode {
    pub hash: [u8; 32],
    pub is_left: bool,
}

pub fn verify(ctx: Context<VerifySample>, args: MerkleProofArgs) -> Result<()> {
    require!(args.path.len() <= MAX_MERKLE_DEPTH, ExchangeError::InvalidMerkleProof);

    let listing = &ctx.accounts.listing;
    require!(
        listing.snapshot_root != [0u8; 32],
        ExchangeError::NoSnapshot,
    );

    let mut cursor = args.leaf;
    for node in args.path.iter() {
        let hashed = if node.is_left {
            hashv(&[&node.hash, &cursor]).to_bytes()
        } else {
            hashv(&[&cursor, &node.hash]).to_bytes()
        };
        cursor = hashed;
    }

    require!(cursor == listing.snapshot_root, ExchangeError::InvalidMerkleProof);
    Ok(())
}
