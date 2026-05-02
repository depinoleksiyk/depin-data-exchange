# SLA — service-level agreement

What buyers and providers can expect from the depin-data-exchange platform.

## Buyer guarantees

When a paid subscription is active:

| metric                | target  | breach response                    |
|-----------------------|---------|-------------------------------------|
| API uptime            | 99.5%   | 1-day extension per breach hour     |
| P95 query latency     | < 800ms | best-effort credit on report        |
| Data freshness        | per-listing cadence ± 20% | listing flagged amber on dashboard |
| Settlement            | 30s     | manual settlement after 5 min       |

## Provider guarantees

Once enrolled and verified:

| metric                | target                        |
|-----------------------|--------------------------------|
| Royalty payout cadence| streaming on each buy          |
| Dispute window        | 24 hours per buy               |
| Onboarding speed      | < 5 minutes from listing publish |
| Status page uptime    | 99.9%                          |

## Measuring uptime

Uptime is computed monthly across all gateway endpoints. A *region* is
considered down if its sequential 5-minute health-check probes return
non-2xx for ≥ 2 consecutive checks. Regional outages are weighted by
that region's share of total queries.

## Force majeure

Excluded from SLA: Solana network outages > 30 min, Helius RPC
incidents, AWS regional outages, force-majeure events broadly.

## Tier escalation

| tier        | response time | dispute resolution |
|-------------|---------------|-------------------|
| Free        | best-effort   | community         |
| Pro         | < 24h         | maintainer review |
| Enterprise  | < 4h          | dedicated channel |

## Reporting issues

```bash
curl -X POST https://api.depinx.network/v1/incidents \
  -H "Authorization: Bearer $API_KEY" \
  -d '{"listing_id": "...", "issue": "...", "expected": "...", "got": "..."}'
```

Or open a github issue with the exchange tag.
