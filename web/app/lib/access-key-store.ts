'use client';

// Access keys are the secret bearer tokens the gateway checks on every
// authed query. We keep them in localStorage keyed by subscription pubkey
// so a buyer can close the tab and come back without re-signing a new
// key — which would cost an on-chain transaction every time.

const NAMESPACE = 'depinxchg:access-key:v1';

function storageKey(subscriptionPubkey: string): string {
  return `${NAMESPACE}:${subscriptionPubkey}`;
}

export function saveAccessKey(subscriptionPubkey: string, rawHex: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey(subscriptionPubkey), rawHex);
  } catch {
    /* quota exceeded or storage disabled — silent */
  }
}

export function loadAccessKey(subscriptionPubkey: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(storageKey(subscriptionPubkey));
  } catch {
    return null;
  }
}

export function clearAccessKey(subscriptionPubkey: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(storageKey(subscriptionPubkey));
  } catch {
    /* noop */
  }
}
