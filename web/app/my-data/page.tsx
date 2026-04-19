'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { PublicKey } from '@solana/web3.js';
import { useAnchorWallet, useConnection, useWallet } from '@solana/wallet-adapter-react';

import { marketplaceClient } from '../lib/useProgram';
import {
  fetchListing,
  fetchSubscriptionsForBuyer,
  type RawListing,
  type SubscriptionView,
} from '../lib/chain';
import { loadAccessKey } from '../lib/access-key-store';
import { authedQuery } from '../lib/gateway';
import { DATA_TYPE_META } from '../lib/constants';
import { formatUsdc, fromUsdcRaw, relativeTime, shortAddress } from '../lib/format';
import { Reveal } from '../components/Reveal';
import { Toast, type ToastMessage } from '../components/Toast';

type Row = {
  sub: SubscriptionView;
  listing: RawListing | null;
  accessKey: string | null;
};

export default function MyDataPage() {
  const { connection } = useConnection();
  const anchorWallet = useAnchorWallet();
  const { publicKey } = useWallet();

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [quickQuery, setQuickQuery] = useState<Record<string, any>>({});
  const [queryBusy, setQueryBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!publicKey) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const program = marketplaceClient(connection);
      const subs = await fetchSubscriptionsForBuyer(program, publicKey);
      const expanded: Row[] = await Promise.all(
        subs.map(async (sub) => {
          const listing = await fetchListing(program, sub.listing);
          const accessKey = loadAccessKey(sub.pubkey.toBase58());
          return { sub, listing, accessKey };
        })
      );
      expanded.sort((a, b) => b.sub.startedAt - a.sub.startedAt);
      setRows(expanded);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [connection, publicKey]);

  useEffect(() => {
    load();
  }, [load]);

  const handleFetchSample = useCallback(
    async (row: Row) => {
      if (!row.listing || !row.accessKey) return;
      const subKey = row.sub.pubkey.toBase58();
      setQueryBusy(subKey);
      try {
        const dataType = row.listing.dataType.toLowerCase();
        const result = await authedQuery(row.listing.pubkey.toBase58(), row.accessKey, dataType, 3);
        setQuickQuery((prev) => ({ ...prev, [subKey]: result }));
        load();
      } catch (err: any) {
        setToast({ tone: 'error', title: 'Fetch failed', body: err?.message?.slice(0, 140) });
      } finally {
        setQueryBusy(null);
      }
    },
    [load]
  );

  const summary = useMemo(() => {
    if (rows.length === 0) return null;
    const active = rows.filter((r) => r.sub.expiresAt * 1000 > Date.now()).length;
    const queries = rows.reduce((s, r) => s + r.sub.queriesUsed, 0);
    const quota = rows.reduce((s, r) => s + r.sub.queriesLimit, 0);
    return { active, queries, quota };
  }, [rows]);

  if (!publicKey) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-20 animate-fadeUp">
        <div className="panel p-10 text-center relative overflow-hidden">
          <div
            aria-hidden
            className="absolute -top-24 -left-16 h-60 w-60 rounded-full blur-3xl opacity-60"
            style={{ background: 'rgba(45, 90, 39, 0.16)' }}
          />
          <div className="relative text-xs uppercase tracking-[0.16em] text-ink-soft">My data</div>
          <h1 className="relative font-display text-[34px] mt-2 tracking-ultra">Connect wallet</h1>
          <p className="relative mt-3 text-ink-muted">
            Once you connect, this page will list every feed you're subscribed to and let you
            pull rows without leaving the dashboard.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8 animate-fadeUp">
        <div>
          <div className="text-xs uppercase tracking-[0.16em] text-ink-soft">My data</div>
          <h1 className="mt-1 font-display text-3xl md:text-[38px] tracking-ultra">
            Your subscriptions
          </h1>
          <p className="mt-1 text-ink-muted text-sm">
            Everything your wallet <span className="font-mono">{shortAddress(publicKey.toBase58(), 5)}</span> has active on devnet.
          </p>
        </div>
        <button onClick={load} className="btn-ghost border border-earth-200 text-xs" disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {summary && (
        <div className="grid md:grid-cols-3 gap-3 mb-8 animate-fadeUp" style={{ animationDelay: '120ms' }}>
          <SummaryTile label="Active subscriptions" value={summary.active.toString()} tone="forest" />
          <SummaryTile label="Queries used" value={summary.queries.toLocaleString()} tone="sunflower" />
          <SummaryTile label="Total quota" value={summary.quota.toLocaleString()} tone="clay" hint="across all feeds" />
        </div>
      )}

      {loading && rows.length === 0 ? (
        <div className="grid md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="panel h-[220px] overflow-hidden relative">
              <div className="absolute inset-0 skeleton" />
            </div>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Reveal>
          <div className="panel p-10 text-center">
            <div className="font-display text-lg">No subscriptions yet</div>
            <p className="mt-2 text-sm text-ink-muted">
              Head to the marketplace and grab any stream that looks useful — you'll see it
              appear here the moment the transaction confirms.
            </p>
            <Link href="/marketplace" className="btn-primary mt-6 inline-flex">
              Browse marketplace <span className="arrow">→</span>
            </Link>
          </div>
        </Reveal>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {rows.map((row, idx) => (
            <SubscriptionCard
              key={row.sub.pubkey.toBase58()}
              row={row}
              index={idx}
              busy={queryBusy === row.sub.pubkey.toBase58()}
              onQuery={() => handleFetchSample(row)}
              quickResult={quickQuery[row.sub.pubkey.toBase58()]}
            />
          ))}
        </div>
      )}

      <Toast message={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}

function SummaryTile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone: 'forest' | 'clay' | 'sunflower';
}) {
  const toneCls =
    tone === 'forest' ? 'text-forest-dark' : tone === 'sunflower' ? 'text-sunflower' : 'text-clay';
  return (
    <div className="panel px-4 py-3.5">
      <div className="text-[11px] uppercase tracking-[0.12em] text-ink-soft">{label}</div>
      <div className={`mt-1 text-xl font-display tabular ${toneCls}`}>{value}</div>
      {hint && <div className="mt-1 text-[11px] text-ink-soft">{hint}</div>}
    </div>
  );
}

function SubscriptionCard({
  row,
  index,
  busy,
  onQuery,
  quickResult,
}: {
  row: Row;
  index: number;
  busy: boolean;
  onQuery: () => void;
  quickResult?: any;
}) {
  const { sub, listing, accessKey } = row;
  const expired = sub.expiresAt * 1000 < Date.now();
  const expiresIn = expired ? 'expired' : relativeTime(sub.expiresAt);
  const quotaPct = Math.min(100, (sub.queriesUsed / Math.max(1, sub.queriesLimit)) * 100);
  const meta = listing ? DATA_TYPE_META[listing.dataType] : null;

  return (
    <div
      className="panel p-5 relative overflow-hidden animate-fadeUp"
      style={{ animationDelay: `${Math.min(index, 6) * 70 + 80}ms` }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {meta && (
            <span className={`chip ${meta.tag}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
              {meta.label}
            </span>
          )}
          <h3 className="mt-2 font-display text-lg">
            {listing ? (
              <Link href={`/listing/${listing.pubkey.toBase58()}`} className="hover:text-forest transition-colors">
                {listing.title}
              </Link>
            ) : (
              'Listing gone'
            )}
          </h3>
          {listing && (
            <p className="text-[11px] text-ink-soft font-mono">
              by {shortAddress(listing.provider.toBase58(), 5)} · {formatUsdc(fromUsdcRaw(listing.priceSubscriptionMonthly))} USDC/mo
            </p>
          )}
        </div>
        <div className="text-right">
          <span className={`pill ${expired ? 'bg-clay-soft text-clay' : 'bg-forest-soft text-forest-dark'}`}>
            {expired ? 'expired' : 'active'}
          </span>
          <div className="text-[11px] text-ink-soft mt-1 tabular">{expiresIn}</div>
        </div>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between text-[11px] text-ink-soft uppercase tracking-wide">
          <span>Queries</span>
          <span className="tabular">{sub.queriesUsed.toLocaleString()} / {sub.queriesLimit.toLocaleString()}</span>
        </div>
        <div className="mt-1.5 h-1.5 rounded-full bg-earth-100 overflow-hidden">
          <div
            className="h-full progress-fill"
            style={{
              width: `${quotaPct}%`,
              background: expired ? '#b4552c' : '#2d5a27',
            }}
          />
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2">
        {accessKey ? (
          <>
            <button
              onClick={onQuery}
              disabled={busy || expired}
              className="btn-primary text-xs"
            >
              {busy ? 'Fetching…' : <>Fetch 3 rows <span className="arrow">→</span></>}
            </button>
            <Link
              href={listing ? `/listing/${listing.pubkey.toBase58()}` : '#'}
              className="btn-ghost border border-earth-200 text-xs"
            >
              Open
            </Link>
          </>
        ) : (
          <Link
            href={listing ? `/listing/${listing.pubkey.toBase58()}` : '#'}
            className="btn-secondary text-xs"
          >
            {sub.accessKeyActive ? 'Key missing locally — re-issue' : 'Issue access key'} <span className="arrow">→</span>
          </Link>
        )}
      </div>

      {quickResult && (
        <pre className="mt-3 font-mono text-[11px] bg-parchment rounded-lg p-3 overflow-x-auto max-h-[180px] animate-fadeUp">
          {JSON.stringify(quickResult, null, 2)}
        </pre>
      )}
    </div>
  );
}
