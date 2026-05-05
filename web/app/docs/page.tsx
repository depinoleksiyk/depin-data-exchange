import Link from 'next/link';
import { PROGRAM_ID, USDC_MINT, QUALITY_ORACLE } from '../lib/constants';
import { Reveal } from '../components/Reveal';

export default function DocsPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <div className="animate-fadeUp">
        <div className="text-xs uppercase tracking-[0.16em] text-ink-soft">Documentation</div>
        <h1 className="mt-2 font-display text-3xl md:text-[38px] tracking-ultra">A buyer's guide</h1>
        <p className="mt-3 text-ink-muted max-w-lg">
          Five steps between connecting a wallet and pulling a verified reading. Plus
          every address you'll end up needing along the way.
        </p>
      </div>

      <div className="mt-10 space-y-8">
        <Reveal>
          <Article num="01" title="Connect a wallet">
            Works with Phantom or Solflare on Solana devnet. Make sure your wallet is in
            the devnet network mode — mainnet will show empty balances.
          </Article>
        </Reveal>

        <Reveal delay={80}>
          <Article num="02" title="Get mock USDC">
            The exchange uses a freshly minted mock USDC token on devnet at{' '}
            <code className="font-mono text-xs bg-parchment px-1.5 py-0.5 rounded">
              {USDC_MINT.toBase58()}
            </code>
            . The deploy authority holds the mint keys — ping us on Twitter for a
            hand-out until the public faucet ships.
          </Article>
        </Reveal>

        <Reveal delay={160}>
          <Article num="03" title="Subscribe & query">
            Pick a listing, click <em>Subscribe</em>, sign once. Then issue an access
            key — a 32-byte secret whose keccak256 hash lives on-chain. Every subsequent
            call to the gateway carries it as a Bearer token. No wallet pop-ups per
            query.
          </Article>
        </Reveal>

        <Reveal delay={240}>
          <Article num="04" title="Verify a sample">
            Each listing commits a keccak Merkle root via{' '}
            <code className="font-mono text-xs bg-parchment px-1.5 py-0.5 rounded">commit_snapshot</code>. The gateway exposes{' '}
            <code className="font-mono text-xs bg-parchment px-1.5 py-0.5 rounded">/v1/sample-proof/:listing</code>{' '}
            which returns a random leaf and proof. Run{' '}
            <code className="font-mono text-xs bg-parchment px-1.5 py-0.5 rounded">verify_sample</code>{' '}
            on-chain to confirm the leaf belongs to the committed root.
          </Article>
        </Reveal>

        <Reveal delay={320}>
          <Article num="05" title="Program addresses">
            <ul className="mt-3 space-y-2 font-mono text-sm text-ink-muted">
              <li className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-wider text-ink-soft w-20">program</span>
                <span className="text-ink">{PROGRAM_ID.toBase58()}</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-wider text-ink-soft w-20">usdc mint</span>
                <span className="text-ink">{USDC_MINT.toBase58()}</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-wider text-ink-soft w-20">oracle</span>
                <span className="text-ink">{QUALITY_ORACLE.toBase58()}</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-wider text-ink-soft w-20">source</span>
                <Link
                  href="https://github.com/priyapatel/depin-exchange"
                  className="link-plain"
                  target="_blank"
                >
                  github · priyapatel/depin-exchange
                </Link>
              </li>
            </ul>
          </Article>
        </Reveal>
      </div>
    </div>
  );
}

function Article({
  num,
  title,
  children,
}: {
  num: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <article className="panel p-6 relative overflow-hidden group hover:shadow-lift transition-shadow duration-300">
      <div className="flex items-start gap-4">
        <span className="font-mono text-xs text-forest-dark bg-forest-soft px-2 py-1 rounded shrink-0">
          {num}
        </span>
        <div className="flex-1">
          <h2 className="font-display text-xl">{title}</h2>
          <div className="mt-3 text-ink-muted leading-relaxed text-[14px]">{children}</div>
        </div>
      </div>
    </article>
  );
}
