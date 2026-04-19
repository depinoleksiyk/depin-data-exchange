import { GATEWAY_URL } from './constants';

function baseUrl(): string {
  return GATEWAY_URL || '/api';
}

export async function gatewayHealth(): Promise<{ status: string; programId: string } | null> {
  try {
    const r = await fetch(`${baseUrl()}/health`);
    if (!r.ok) return null;
    return r.json();
  } catch {
    return null;
  }
}

export async function samplePreview(listing: string, type: string) {
  const r = await fetch(`${baseUrl()}/v1/preview/${listing}?type=${encodeURIComponent(type)}`);
  if (!r.ok) throw new Error(`preview failed: ${r.status}`);
  return r.json();
}

export async function sampleProof(listing: string, type: string) {
  const r = await fetch(`${baseUrl()}/v1/sample-proof/${listing}?type=${encodeURIComponent(type)}`);
  if (!r.ok) throw new Error(`proof failed: ${r.status}`);
  return r.json();
}

export async function subscriptionStatus(listing: string, buyer: string) {
  const r = await fetch(`${baseUrl()}/v1/subscription?listing=${listing}&buyer=${buyer}`);
  if (!r.ok) return null;
  return r.json();
}

export async function issueAccessKey(params: {
  subscription: string;
  accessKey: string;
  txSignature: string;
}) {
  const r = await fetch(`${baseUrl()}/v1/access-keys/issue`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(params),
  });
  const body = await r.json();
  if (!r.ok) throw new Error(body?.message || body?.error || `issue failed: ${r.status}`);
  return body;
}

export async function authedQuery(
  listing: string,
  accessKey: string,
  dataType: string,
  limit = 5
) {
  const r = await fetch(`${baseUrl()}/v1/query/${listing}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${accessKey}`,
    },
    body: JSON.stringify({ dataType, limit }),
  });
  const body = await r.json();
  if (!r.ok) throw new Error(body?.message || body?.error || `query failed: ${r.status}`);
  return body;
}

export async function payWithSol(params: {
  serializedTx: string;
  listing: string;
  buyer: string;
  durationMonths: number;
  solLamports: string;
  solPriceUsd: number;
  slippageBps?: number;
}) {
  const r = await fetch(`${baseUrl()}/v1/pay-with-sol`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(params),
  });
  const body = await r.json();
  if (!r.ok) throw new Error(body?.message || body?.error || `pay-with-sol failed: ${r.status}`);
  return body;
}

export async function payPerQuery(listing: string, txSignature: string, dataType: string, limit = 5) {
  const r = await fetch(`${baseUrl()}/v1/query-tx/${listing}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ txSignature, dataType, limit }),
  });
  const body = await r.json();
  if (!r.ok) throw new Error(body?.message || body?.error || `query-tx failed: ${r.status}`);
  return body;
}
