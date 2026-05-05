import Link from 'next/link';
import { DATA_TYPE_META } from '../lib/constants';
import { formatUsdc, fromUsdcRaw, qualityLabel, shortAddress } from '../lib/format';
import type { RawListing } from '../lib/chain';

export function ListingRow({ listing, index }: { listing: RawListing; index: number }) {
  const meta = DATA_TYPE_META[listing.dataType];
  const q = qualityLabel(listing.qualityScore);
  const qTone =
    q.tone === 'good' ? 'text-ink' : q.tone === 'warn' ? 'text-signal' : 'text-danger';

  return (
    <li className="group">
      <Link
        href={`/listing/${listing.pubkey.toBase58()}`}
        className="grid grid-cols-[3rem_minmax(0,2.2fr)_5.5rem_8rem_6rem_auto] md:grid-cols-[3rem_minmax(0,2.5fr)_6rem_9rem_7rem_1.4rem] gap-6 items-baseline py-7 border-t border-rule2 hover:bg-vellum/80 transition-colors px-2 -mx-2"
      >
        <span className="mono text-[11px] text-ink-soft tracking-widest self-start pt-2">
          {String(index + 1).padStart(2, '0')}
        </span>

        <div className="min-w-0">
          <div className="flex items-baseline gap-3 flex-wrap">
            <span className="label">{meta.label}</span>
            {!listing.isActive && <span className="chip">paused</span>}
          </div>
          <h3 className="serif text-[26px] md:text-[32px] leading-[1.02] mt-2 text-ink group-hover:text-signal transition-colors tracking-ultra">
            {listing.title}
          </h3>
          <p className="mt-2 text-ink-muted text-[13.5px] leading-[1.6] max-w-2xl line-clamp-2">
            {listing.description}
          </p>
          <div className="mt-3 mono text-[11px] text-ink-soft">
            by {shortAddress(listing.provider.toBase58(), 5)}
            <span className="mx-2">·</span>
            {listing.totalQueries.toLocaleString()} queries served
            <span className="mx-2">·</span>
            snapshot #{listing.snapshotIndex.toString()}
          </div>
        </div>

        <div className="hidden md:block">
          <div className="label">Quality</div>
          <div className={`mono text-[20px] mt-1 tabular ${qTone}`}>
            {listing.qualityScore ? `${listing.qualityScore}` : '—'}
          </div>
          <div className="text-[11px] text-ink-soft">{q.label}</div>
        </div>

        <div>
          <div className="label">Subscription</div>
          <div className="mono text-[18px] mt-1 tabular text-ink">
            {formatUsdc(fromUsdcRaw(listing.priceSubscriptionMonthly))}
          </div>
          <div className="text-[11px] text-ink-soft mono">USDC / month</div>
        </div>

        <div>
          <div className="label">Per query</div>
          <div className="mono text-[18px] mt-1 tabular text-ink">
            {formatUsdc(fromUsdcRaw(listing.pricePerQuery), 4)}
          </div>
          <div className="text-[11px] text-ink-soft mono">USDC</div>
        </div>

        <span
          aria-hidden
          className="serif text-[28px] text-ink-faint group-hover:text-signal transition-colors self-center"
        >
          →
        </span>
      </Link>
    </li>
  );
}
