# DePIN Data Exchange — v2 deploy runbook

Upgrades the existing devnet program (`3gGkKra1uhoDukSkFLCux8j3gkxoMdUjzMfHzLGKkyzk`) from the v1 layout to v2. Program ID stays the same. State is wiped because v1 struct layouts don't line up with v2.

Expected cost: ~0.1 SOL total (program data write chunks + reinit + seed listings).

## Prerequisites

- `solana` CLI ≥ 1.18
- `anchor` CLI 1.0.0
- `node` ≥ 20 + `npm`
- Python 3.11+ (for the oracle daemon, optional at deploy time)
- `deploy-keypair.json` (already present) with ≥ 0.5 SOL on devnet

```bash
solana balance deploy-keypair.json --url devnet   # must be > 0.5 SOL
```

## Steps

### 1. Build the v2 program

```bash
cargo build-sbf --manifest-path programs/exchange/Cargo.toml
anchor idl build --program-name exchange -o target/idl/exchange.json
```

Artifacts:
- `target/deploy/exchange.so` (~435 KB)
- `target/idl/exchange.json`

### 2. Upgrade the deployed program

This reuses the existing program account (same ID), just uploads the new bytes:

```bash
solana program deploy \
  --program-id target/deploy/exchange-keypair.json \
  --keypair deploy-keypair.json \
  --url devnet \
  target/deploy/exchange.so
```

If solana CLI complains about the program not being upgradeable, fall back to `anchor upgrade`:

```bash
anchor upgrade target/deploy/exchange.so \
  --program-id 3gGkKra1uhoDukSkFLCux8j3gkxoMdUjzMfHzLGKkyzk \
  --provider.wallet ./deploy-keypair.json \
  --provider.cluster devnet
```

### 3. Generate the oracle signer

```bash
npm run oracle:key
# prints the oracle pubkey and saves oracle-keypair.json (chmod 600)

# fund it so it can submit update_quality / slash txs
solana transfer <ORACLE_PUBKEY> 0.05 \
  --keypair deploy-keypair.json --url devnet --allow-unfunded-recipient
```

### 4. Wipe legacy state

```bash
npm run migrate
```

What it does:
- Lists every account owned by the program.
- For each whose first-pubkey-field matches the deploy keypair, calls the matching `close_legacy_*` instruction.
- Logs orphan PDAs owned by other wallets (they stay untouched).

Safe to re-run — already-closed accounts are just skipped.

### 5. Reinitialize the exchange

```bash
npm run init
```

What it does:
- Creates (or reuses) a mock USDC mint and a treasury ATA.
- Calls `initialize` with v2 args: 2.5% commission, slash threshold 30, 7-day grace, 0.1 SOL min stake.
- Writes `usdc-mint.json` so later runs reuse the same mint.

### 6. Seed the marketplace

```bash
npm run seed
```

What it does:
- Registers the deploy keypair as a provider (with a stake vault PDA).
- Stakes 0.15 SOL with a 24-hour lock so `create_listing` passes the stake check.
- Creates six listings across GPS / Weather / Network / Camera.
- Commits a deterministic keccak snapshot root per listing so `/v1/sample-proof` works.

### 7. Copy the fresh IDL to the frontend

```bash
cp target/idl/exchange.json web/app/idl.json
```

Frontend was kept on the v1 IDL during development; this ties it back to reality.

### 8. Restart the gateway + oracle

```bash
# gateway
cd gateway
GATEWAY_SKIP_STREAM=0 npm start &

# oracle (needs pip install -r requirements.txt first)
cd ../quality-oracle
python oracle_daemon.py --once   # smoke test
python oracle_daemon.py          # full scheduler (30 min cadence)
```

### One-shot shortcut

Once the program is upgraded (step 2) and the oracle key is funded, everything else is bundled as:

```bash
npm run full-bootstrap
```

which runs `migrate → init → seed` in sequence.

## Rollback

If something goes wrong mid-migration:
1. The program is still running v2 — no way to go back to v1 binaries without re-building v1 and redeploying.
2. Re-run `npm run migrate && npm run init && npm run seed` — every script is idempotent and safe to retry.

## Costs (approximate)

| step | SOL |
|------|-----|
| upgrade (data chunks) | 0.05 – 0.12 |
| reinit exchange + usdc mint | ~0.002 |
| register_provider + stake | 0.15 + 0.0005 |
| 6 listings + 6 snapshots | ~0.012 |
| oracle key funding | 0.05 |
| **total buffer** | **≤ 0.35 SOL** |

`deploy-keypair.json` should retain ≥ 1 SOL after the run.
