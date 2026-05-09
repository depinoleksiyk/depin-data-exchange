# Changelog

DePIN Data Exchange — Solana marketplace for verified IoT / DePIN data.

## phase 4.5 — devnet contract + listings

- contract: deployed to devnet — `5mnqN7onSgqy9tBCTJ46N2mGr4Ty68fvCg4HqK5TsdTo`
- contract: provider registration + listing creation flow
- contract: USDC subscription payment with mock USDC mint for devnet
- frontend: wallet adapter, listing browser, provider dashboard, my-data view
- scripts: 3 demo listings seeded for showcase
- docs: B2B use cases page covering logistics, micro-weather, urban air quality

## phase 4 — gateway + scaffolds

- gateway: node service exposing listing query proxy with USDC pay-gating
- scripts: provider onboarding helper + listing-creation CLI

## phase 3 — anchor program bones

- factory + listing + subscription state PDAs
- create_listing / subscribe / cancel_subscription instructions
- gas-bench fixtures for measuring per-listing cost
