# Webhook integration

Enterprise tier subscribers receive real-time data updates via webhooks
instead of polling the API. This document covers the wire format, retry
policy, and signature verification.

## Eligibility

Available on **Enterprise** tier (`TIER_ENTERPRISE_PRICE_USDC`). Pro tier
gets polling-only access.

## Configuring an endpoint

```bash
curl -X POST https://api.depinx.network/v1/webhooks \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-server.com/depinx-hook",
    "events": ["dataset.row", "dataset.batch", "subscription.expiring"],
    "datasets": ["weather-mountain", "gps-fleet-eu"]
  }'
```

The response includes a `webhookSecret` (32-byte hex). **Save this** — it's
shown only once and you'll need it for signature verification.

## Event envelope

```json
{
  "id": "wh_2x4Y...",
  "ts": 1714560000,
  "type": "dataset.row",
  "datasetId": "weather-mountain",
  "data": {
    "stationId": "wxm-zermatt-04",
    "tempC": -2.3,
    "humidityPct": 78
  }
}
```

## Event types

| type                     | when                                                   |
|--------------------------|--------------------------------------------------------|
| `dataset.row`            | per-row data update (high frequency)                  |
| `dataset.batch`          | hourly aggregate, 100 rows max per batch              |
| `subscription.expiring`  | 7 days before subscription ends                       |
| `subscription.renewed`   | renewal payment confirmed on-chain                    |
| `provider.offline`       | upstream provider stopped serving for >5 min          |

## Retry policy

A 2xx response acknowledges. Anything else triggers exponential backoff:

```
attempt 1: t+0s
attempt 2: t+30s
attempt 3: t+2m
attempt 4: t+10m
attempt 5: t+1h
```

After 5 failed attempts the event is dropped and a `webhook.failure` is
written to your audit log.

## Signature verification

Each request includes a `Depinx-Signature` header:

```
Depinx-Signature: t=1714560000,v1=5257a869...
```

Verify with HMAC-SHA256 over `{timestamp}.{body}` using your secret:

```ts
import crypto from 'node:crypto'

function verifySignature(req: Request, secret: string): boolean {
  const sig = req.headers.get('Depinx-Signature')!
  const [tsPart, v1Part] = sig.split(',')
  const ts = tsPart.split('=')[1]
  const v1 = v1Part.split('=')[1]
  const body = await req.text()
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${ts}.${body}`)
    .digest('hex')
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1))
}
```

Reject any request older than 5 minutes (replay protection).

## Rate limits

A receiver that returns >50% non-2xx within a 5-minute window is paused for
the next 30 minutes. We'll resume when your endpoint returns 2xx again.
