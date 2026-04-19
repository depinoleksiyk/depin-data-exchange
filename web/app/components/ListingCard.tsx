import Link from 'next/link';
import { DATA_TYPE_META } from '../lib/constants';
import { formatUsdc, fromUsdcRaw, qualityLabel, shortAddress } from '../lib/format';
import type { RawListing } from '../lib/chain';

export function ListingCard({ listing, index = 0 }: { listing: RawListing; index?: number }) {
  const meta = DATA_TYPE_META[listing.dataType];
  const ppq = fromUsdcRaw(listing.pricePerQuery);
  const sub = fromUsdcRaw(listing.priceSubscriptionMonthly);
  const quality = qualityLabel(listing.qualityScore);

  return (
    <Link
      href={`/listing/${listing.pubkey.toBase58()}`}
      className="panel panel-hover p-5 flex flex-col gap-3 group relative overflow-hidden"
      style={{ animationDelay: `${index * 80}ms` }}
    >
      {/* corner glow on hover */}
      <span
        aria-hidden
        className="absolute -top-16 -right-16 h-40 w-40 rounded-full opacity-0 group-hover:opacity-70 transition-opacity duration-500 blur-2xl"
        style={{ background: meta.accent + '38' }}
      />

      <div className="relative flex items-center justify-between">
        <span className={`chip ${meta.tag}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`}></span>
          {meta.label}
        </span>
        {listing.qualityScore > 0 && (
          <span
            className={`text-[11px] font-medium tabular ${
              quality.tone === 'good'
                ? 'text-forest-dark'
                : quality.tone === 'warn'
                ? 'text-sunflower'
                : 'text-danger'
            }`}
          >
            {listing.qualityScore}% · {quality.label}
          </span>
        )}
      </div>

      <div className="relative">
        <h3 className="font-display text-[17px] leading-snug text-ink group-hover:text-forest transition-colors duration-300">
          {listing.title}
        </h3>
        <p className="mt-1 text-[13px] text-ink-muted leading-relaxed line-clamp-2">
          {listing.description}
        </p>
      </div>

      <div className="relative mt-auto pt-3 border-t border-earth-100 flex items-end justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-ink-soft">Subscription</div>
          <div className="text-ink font-mono text-sm tabular">{formatUsdc(sub)} USDC/mo</div>
        </div>
        <div className="text-right">
          <div className="text-[11px] uppercase tracking-wide text-ink-soft">Per query</div>
          <div className="text-ink font-mono text-sm tabular">{formatUsdc(ppq, 4)} USDC</div>
        </div>
      </div>

      <div className="relative flex items-center justify-between text-[11px] text-ink-soft">
        <span className="font-mono">by {shortAddress(listing.provider.toBase58(), 4)}</span>
        <span className="tabular">{listing.totalQueries.toLocaleString()} queries</span>
      </div>

      <span
        aria-hidden
        className="relative inline-flex items-center gap-1 text-xs font-medium text-forest opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300"
      >
        View stream <span className="transition-transform duration-300 group-hover:translate-x-1">→</span>
      </span>
    </Link>
  );
}
