// One-shot migration helpers used to reclaim PDAs left by the v1 program
// layout. The struct formats grew several fields between v1 and v2, so the
// on-chain accounts need to be wiped before `initialize` / `register_provider`
// / `create_listing` can recreate them with the new layout.
//
// These handlers read the legacy bytes manually (no Account<T> deserialize,
// because the old layout is smaller than the new one) and then close the
// account by draining lamports, zeroing data and reassigning ownership to
// the system program so the next init/create call can claim the PDA fresh.

use anchor_lang::prelude::*;
use anchor_lang::system_program;

use crate::constants::*;
use crate::errors::ExchangeError;

fn close_raw(target: &AccountInfo, dest: &AccountInfo) -> Result<()> {
    let lamports = target.lamports();
    **dest.try_borrow_mut_lamports()? = dest
        .lamports()
        .checked_add(lamports)
        .ok_or(ExchangeError::PaymentOverflow)?;
    **target.try_borrow_mut_lamports()? = 0;

    let mut data = target.try_borrow_mut_data()?;
    for byte in data.iter_mut() {
        *byte = 0;
    }
    drop(data);

    target.assign(&system_program::ID);
    Ok(())
}

fn read_pubkey_at(info: &AccountInfo, offset: usize) -> Result<Pubkey> {
    let data = info.try_borrow_data()?;
    if data.len() < offset + 32 {
        return err!(ExchangeError::Unauthorized);
    }
    let mut buf = [0u8; 32];
    buf.copy_from_slice(&data[offset..offset + 32]);
    Ok(Pubkey::new_from_array(buf))
}

// ---- close legacy exchange ---------------------------------------------

#[derive(Accounts)]
pub struct CloseLegacyExchange<'info> {
    /// CHECK: legacy DataExchange account — deserialized manually because
    /// the v1 layout is smaller than the v2 layout.
    #[account(
        mut,
        seeds = [EXCHANGE_SEED],
        bump,
        owner = crate::ID,
    )]
    pub legacy: UncheckedAccount<'info>,
    #[account(mut)]
    pub authority: Signer<'info>,
}

pub fn close_exchange(ctx: Context<CloseLegacyExchange>) -> Result<()> {
    // First 8 bytes: Anchor discriminator. Next 32 bytes: authority pubkey.
    let stored_authority = read_pubkey_at(&ctx.accounts.legacy, 8)?;
    require_keys_eq!(
        stored_authority,
        ctx.accounts.authority.key(),
        ExchangeError::Unauthorized,
    );
    close_raw(
        &ctx.accounts.legacy.to_account_info(),
        &ctx.accounts.authority.to_account_info(),
    )
}

// ---- close legacy provider ---------------------------------------------

#[derive(Accounts)]
pub struct CloseLegacyProvider<'info> {
    /// CHECK: legacy DataProvider, manually checked below.
    #[account(
        mut,
        seeds = [PROVIDER_SEED, wallet.key().as_ref()],
        bump,
        owner = crate::ID,
    )]
    pub legacy: UncheckedAccount<'info>,
    #[account(mut)]
    pub wallet: Signer<'info>,
}

pub fn close_provider(ctx: Context<CloseLegacyProvider>) -> Result<()> {
    // v1 DataProvider bytes: [8 discriminator][32 wallet pubkey][...]
    let stored_wallet = read_pubkey_at(&ctx.accounts.legacy, 8)?;
    require_keys_eq!(
        stored_wallet,
        ctx.accounts.wallet.key(),
        ExchangeError::Unauthorized,
    );
    close_raw(
        &ctx.accounts.legacy.to_account_info(),
        &ctx.accounts.wallet.to_account_info(),
    )
}

// ---- close legacy listing ----------------------------------------------

#[derive(Accounts)]
#[instruction(listing_id: u64)]
pub struct CloseLegacyListing<'info> {
    /// CHECK: legacy DataListing bytes, manually verified.
    #[account(
        mut,
        seeds = [LISTING_SEED, provider_wallet.key().as_ref(), &listing_id.to_le_bytes()],
        bump,
        owner = crate::ID,
    )]
    pub legacy: UncheckedAccount<'info>,
    #[account(mut)]
    pub provider_wallet: Signer<'info>,
}

pub fn close_listing(ctx: Context<CloseLegacyListing>, _listing_id: u64) -> Result<()> {
    // v1 DataListing bytes: [8 discriminator][32 provider pubkey][...]
    let stored_provider = read_pubkey_at(&ctx.accounts.legacy, 8)?;
    require_keys_eq!(
        stored_provider,
        ctx.accounts.provider_wallet.key(),
        ExchangeError::Unauthorized,
    );
    close_raw(
        &ctx.accounts.legacy.to_account_info(),
        &ctx.accounts.provider_wallet.to_account_info(),
    )
}
