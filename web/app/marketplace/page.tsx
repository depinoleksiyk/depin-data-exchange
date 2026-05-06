'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useConnection } from '@solana/wallet-adapter-react';
import { DATA_TYPES } from '../lib/constants';
import { marketplaceClient } from '../lib/useProgram';
import { fetchListings, type RawListing } from '../lib/chain';
import { ListingCard } from '../components/ListingCard';
import { StatTile } from '../components/StatTile';
import { CountUp } from '../components/CountUp';
import { Reveal } from '../components/Reveal';

export default function MarketplacePage() {
  const { connection } = useConnection();
  const [listings, setListings] = useState<RawListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<string>('All');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const program = marketplaceClient(connection);
      const rows = await fetchListings(program);
      setListings(rows);
    } catch (err) {
      console.error('failed to load listings', err);
    } finally {
      setLoading(false);
    }
  }, [connection]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return listings.filter((l) => {
      if (typeFilter !== 'All' && l.dataType !== typeFilter) return false;
      if (!q) return true;
      return l.title.toLowerCase().includes(q) || l.description.toLowerCase().includes(q);
    });
  }, [listings, typeFilter, search]);

  const stats = useMemo(() => {
    const total = listings.length;
    const avgQuality = total === 0 ? 0 : Math.round(listings.reduce((s, l) => s + l.qualityScore, 0) / total);
    const totalQueries = listings.reduce((s, l) => s + Number(l.totalQueries), 0);
    return { total, avgQuality, totalQueries };
  }, [listings]);

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8 animate-fadeUp">
        <div>
          <div className="text-xs uppercase tracking-[0.16em] text-ink-soft">Marketplace</div>
          <h1 className="mt-1 font-display text-3xl md:text-[38px] tracking-ultra">
            Browse verified data streams
          </h1>
          <p className="mt-1 text-ink-muted text-sm max-w-xl">
            Every listing is staked on-chain. Hover a card to see it lift.
          </p>
        </div>
        <button
          onClick={load}
          className="btn-ghost border border-earth-200 text-xs hover:border-forest/30 transition-colors"
          disabled={loading}
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      <div className="grid md:grid-cols-3 gap-3 mb-8 animate-fadeUp" style={{ animationDelay: '120ms' }}>
        <StatTile
          label="Active listings"
          value={<CountUp value={stats.total} />}
          tone="forest"
          hint="published in the last hour"
        />
        <StatTile
          label="Avg quality score"
          value={stats.avgQuality > 0 ? <><CountUp value={stats.avgQuality} />%</> : '—'}
          tone="sunflower"
          hint="pushed on-chain by the quality oracle"
        />
        <StatTile
          label="Queries served"
          value={<CountUp value={stats.totalQueries} />}
          tone="clay"
          hint="lifetime across all feeds"
        />
      </div>

      <div className="panel px-4 py-3 flex flex-col md:flex-row md:items-center gap-3 mb-6 animate-fadeUp" style={{ animationDelay: '200ms' }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search feeds by title or description…"
          className="flex-1 bg-transparent outline-none text-sm placeholder:text-ink-soft"
        />
        <div className="flex items-center gap-1 overflow-x-auto">
          {['All', ...DATA_TYPES].map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`relative px-3 py-1.5 text-xs rounded-md whitespace-nowrap transition-all duration-200 ${
                typeFilter === t
                  ? 'bg-ink text-cream shadow-card'
                  : 'text-ink-muted hover:text-ink hover:bg-earth-50'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {loading && listings.length === 0 ? (
        <LoadingGrid />
      ) : filtered.length === 0 ? (
        <EmptyState hasListings={listings.length > 0} />
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((listing, idx) => (
            <div
              key={listing.pubkey.toBase58()}
              className="animate-fadeUp"
              style={{ animationDelay: `${Math.min(idx, 8) * 70 + 100}ms` }}
            >
              <ListingCard listing={listing} index={idx} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LoadingGrid() {
  return (
    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="panel h-[220px] overflow-hidden relative"
          style={{ animationDelay: `${i * 60}ms` }}
        >
          <div className="absolute inset-0 skeleton" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ hasListings }: { hasListings: boolean }) {
  return (
    <Reveal>
      <div className="panel p-10 text-center">
        <div className="font-display text-lg">
          {hasListings ? 'Nothing matches that filter' : 'No listings on-chain yet'}
        </div>
        <p className="mt-2 text-sm text-ink-muted">
          {hasListings
            ? 'Try a different type, or clear your search.'
            : 'Run `npm run seed` in the repo to populate devnet, or become a provider.'}
        </p>
      </div>
    </Reveal>
  );
}
