# Royalty splits

How payments to a listing are distributed back to providers, the protocol,
and any referrers. Defaults shown here can be overridden per listing in
the contract's `Listing.royalty_bps` field.

## Default split

For a $100 USDC purchase of dataset access:

```
                 ┌────────────────────────────────────┐
                 │         100.00 USDC paid           │
                 └────────────────────────────────────┘
                                  │
              ┌───────────────────┼───────────────────┐
              ▼                   ▼                   ▼
     ┌─────────────────┐  ┌─────────────┐   ┌─────────────────┐
     │ data provider   │  │ protocol    │   │ referrer        │
     │   85.00 USDC    │  │  10.00 USDC │   │   5.00 USDC     │
     │   (8500 bps)    │  │ (1000 bps)  │   │  (500 bps)      │
     └─────────────────┘  └─────────────┘   └─────────────────┘
```

## Multi-provider listings

A listing may have several providers (e.g. a national weather network
aggregating municipal stations). Provider share is split internally:

```ts
{
  providers: [
    { wallet: "9xQ...", share_bps: 5000 },
    { wallet: "BzN...", share_bps: 3000 },
    { wallet: "QrT...", share_bps: 2000 },
  ],
  // sum must equal listing.provider_total_bps (default 8500)
}
```

## Settlement cadence

Payments stream into provider escrow on the same tx as the buy. Escrow is
unlocked once the buyer has received at least 30 minutes of usable data
(quality oracle attests). Disputes get held an extra 24h before release.

## Curation referrals

If a buyer arrived through a curator's link (`?ref=<curator-pubkey>`), the
curator's 5% share is paid out automatically. Self-referrals are stripped
at contract level — no buying-from-yourself for kickbacks.

## Override flags per listing

| field                  | default | range          | notes                              |
|------------------------|--------:|----------------|-------------------------------------|
| protocol_bps           |   1000  | 500..1500      | platform fee                       |
| provider_total_bps     |   8500  | 6500..9500     | sum of providers                   |
| referrer_bps           |    500  | 0..1500        | curator/affiliate                  |

All bps must sum to 10000.
