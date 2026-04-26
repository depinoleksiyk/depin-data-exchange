import Link from 'next/link';
import { PROGRAM_ID } from '../lib/constants';
import { shortAddress } from '../lib/format';

export function Footer() {
  return (
    <footer className="mt-24 border-t border-earth-100 bg-parchment/60">
      <div className="max-w-6xl mx-auto px-6 py-10 grid gap-8 md:grid-cols-4 text-sm">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-forest text-cream text-[11px] font-semibold">DX</span>
            <div className="font-display text-ink text-base">DePIN Exchange</div>
          </div>
          <p className="mt-3 text-ink-muted leading-relaxed">
            A verifiable marketplace for real-world data streams, built for teams who
            cannot afford to trust a spreadsheet.
          </p>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-ink-soft mb-3">Product</div>
          <ul className="space-y-2 text-ink-muted">
            <li><Link href="/marketplace" className="link-plain">Marketplace</Link></li>
            <li><Link href="/provider" className="link-plain">Become a provider</Link></li>
            <li><Link href="/docs" className="link-plain">Documentation</Link></li>
          </ul>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-ink-soft mb-3">On-chain</div>
          <ul className="space-y-2 text-ink-muted font-mono text-xs">
            <li>
              <a
                href={`https://explorer.solana.com/address/${PROGRAM_ID.toBase58()}?cluster=devnet`}
                target="_blank"
                rel="noreferrer"
                className="link-plain"
              >
                program {shortAddress(PROGRAM_ID.toBase58(), 5)}
              </a>
            </li>
            <li>Network · Devnet</li>
            <li>Runtime · Anchor 1.0</li>
          </ul>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-ink-soft mb-3">Contact</div>
          <ul className="space-y-2 text-ink-muted">
            <li>
              <a href="https://twitter.com/depinxchg" target="_blank" rel="noreferrer" className="link-plain">
                twitter · @depinxchg
              </a>
            </li>
            <li>
              <a href="https://github.com/priyapatel/depin-exchange" target="_blank" rel="noreferrer" className="link-plain">
                github · priyapatel/depin-exchange
              </a>
            </li>
            <li>
              <a href="mailto:hello@depinxchg.dev" className="link-plain">hello@depinxchg.dev</a>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-earth-100">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between text-xs text-ink-soft">
          <span>© 2026 Priya Patel · MIT licensed</span>
          <span>Devnet preview · not financial advice</span>
        </div>
      </div>
    </footer>
  );
}
