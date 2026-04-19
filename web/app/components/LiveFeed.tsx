'use client';

import { useEffect, useRef, useState } from 'react';
import { GATEWAY_URL } from '../lib/constants';

type Entry = {
  id: string;
  kind: string;
  subject: string;
  detail: string;
  t: number;
  tone: 'forest' | 'clay' | 'sunflower' | 'ink';
};

const PALETTE: Record<string, { label: string; tone: Entry['tone'] }> = {
  SubscriptionCreated: { label: 'subscribed', tone: 'forest' },
  SubscriptionRenewed: { label: 'renewed', tone: 'forest' },
  QueryExecuted:       { label: 'queried',    tone: 'ink' },
  QualityUpdated:      { label: 'graded',     tone: 'sunflower' },
  SnapshotCommitted:   { label: 'snapshot',   tone: 'ink' },
  ProviderStaked:      { label: 'staked',     tone: 'forest' },
  ProviderSlashed:     { label: 'slashed',    tone: 'clay' },
  AccessKeyIssued:     { label: 'key issued', tone: 'forest' },
};

const SEED: Entry[] = [
  { id: 's1', kind: 'snapshot',    subject: 'Berlin Wx Network',      detail: 'keccak root 0x8c9c…',   t: Date.now() - 1_000 * 48,  tone: 'ink' },
  { id: 's2', kind: 'graded',      subject: 'NYC Fleet GPS',          detail: 'q=87 · fresh 96',       t: Date.now() - 1_000 * 122, tone: 'sunflower' },
  { id: 's3', kind: 'subscribed',  subject: 'Tokyo Air Quality',      detail: '1 mo · 4.00 USDC',      t: Date.now() - 1_000 * 301, tone: 'forest' },
  { id: 's4', kind: 'key issued',  subject: 'Helium Coverage',        detail: 'bearer cached',         t: Date.now() - 1_000 * 522, tone: 'forest' },
  { id: 's5', kind: 'staked',      subject: 'priya.sol',              detail: '+0.15 SOL',             t: Date.now() - 1_000 * 810, tone: 'forest' },
  { id: 's6', kind: 'queried',     subject: 'EU Freight Corridors',   detail: '5 rows · 17 ms',        t: Date.now() - 1_000 * 940, tone: 'ink' },
];

function shortid() {
  return Math.random().toString(36).slice(2, 10);
}

function timeAgo(ms: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const TONE_DOT: Record<Entry['tone'], string> = {
  forest: 'bg-forest',
  clay: 'bg-clay',
  sunflower: 'bg-sunflower',
  ink: 'bg-ink',
};

const TONE_CHIP: Record<Entry['tone'], string> = {
  forest: 'bg-forest-soft text-forest-dark',
  clay: 'bg-clay-soft text-clay',
  sunflower: 'bg-sunflower-soft text-sunflower',
  ink: 'bg-earth-100 text-ink',
};

export function LiveFeed() {
  const [entries, setEntries] = useState<Entry[]>(SEED);
  const [live, setLive] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const base = GATEWAY_URL || `${window.location.protocol}//${window.location.hostname}:4001`;
    const wsProto = base.startsWith('https') ? 'wss' : 'ws';
    const wsUrl = `${wsProto}://${base.replace(/^https?:\/\//, '')}/events`;

    let retry: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    const open = () => {
      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;
        ws.onopen = () => setLive(true);
        ws.onclose = () => {
          setLive(false);
          if (!closed) retry = setTimeout(open, 4000);
        };
        ws.onerror = () => ws.close();
        ws.onmessage = (ev) => {
          try {
            const msg = JSON.parse(ev.data);
            if (msg?.type === 'event' && msg.name) {
              const palette = PALETTE[msg.name] || { label: msg.name.toLowerCase(), tone: 'ink' as const };
              const subject =
                msg.data?.listing?.slice?.(0, 6) ||
                msg.data?.provider?.slice?.(0, 6) ||
                msg.data?.subscription?.slice?.(0, 6) ||
                '—';
              const detail = JSON.stringify(msg.data).slice(0, 80);
              setEntries((prev) =>
                [{ id: shortid(), kind: palette.label, subject: `${subject}…`, detail, t: Date.now(), tone: palette.tone }, ...prev].slice(0, 14)
              );
            }
          } catch (err) {
            // Non-JSON frames shouldn't happen in normal operation — surface
            // them so broken event formats are noticed in dev and
            // anomalous floods stand out in prod logs.
            if (typeof console !== 'undefined') {
              console.warn('[LiveFeed] dropped non-JSON frame', err);
            }
          }
        };
      } catch {
        retry = setTimeout(open, 4000);
      }
    };
    open();

    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      wsRef.current?.close();
    };
  }, []);

  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-earth-100 bg-parchment/60">
        <div className="flex items-center gap-2">
          <span className="pulse-dot" />
          <span className="text-[11px] uppercase tracking-[0.16em] text-ink-soft">
            {live ? 'Live ledger' : 'Live ledger · cached'}
          </span>
        </div>
        <span className="text-[11px] text-ink-soft font-mono">devnet · updated just now</span>
      </div>
      <ul className="divide-y divide-earth-100">
        {entries.slice(0, 6).map((e, idx) => (
          <li
            key={e.id}
            className="grid grid-cols-[7rem_1fr_auto] gap-3 items-center px-5 py-3 animate-fadeUp"
            style={{ animationDelay: `${idx * 80 + 80}ms` }}
          >
            <span className={`chip ${TONE_CHIP[e.tone]}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${TONE_DOT[e.tone]}`} />
              {e.kind}
            </span>
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{e.subject}</div>
              <div className="text-[11px] text-ink-soft font-mono truncate">{e.detail}</div>
            </div>
            <span className="text-[11px] text-ink-soft whitespace-nowrap font-mono tabular">{timeAgo(e.t)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
