import Link from 'next/link';
import { CoverageMap } from './components/CoverageMap';
import { LiveFeed } from './components/LiveFeed';
import { Reveal } from './components/Reveal';
import { CountUp } from './components/CountUp';

const STEPS = [
  {
    n: '01',
    title: 'Browse verified feeds',
    body: 'Every listing shows its on-chain quality score and the last time an independent oracle touched it. No screenshots, no trust-me data packs.',
    accent: 'bg-forest-soft text-forest-dark',
  },
  {
    n: '02',
    title: 'Subscribe with USDC',
    body: 'One on-chain transaction locks in monthly access. Commission splits automatically between the provider and the exchange treasury.',
    accent: 'bg-sunflower-soft text-sunflower',
  },
  {
    n: '03',
    title: 'Pull data, verify, rate',
    body: 'Use a single access key or pay per query. Merkle proofs let you spot-check any row. Publish a rating to hold providers accountable.',
    accent: 'bg-clay-soft text-clay',
  },
];

const AUDIENCE = [
  { title: 'Fleet & logistics', body: 'Route on live Hivemapper + GPS feeds instead of static shapefiles.' },
  { title: 'Climate research', body: 'Blend community weather stations with ground-truth station data.' },
  { title: 'Coverage analytics', body: 'Helium, IoTeX and Render telemetry in a single uniform schema.' },
];

const TRUST_CARDS = [
  { kicker: 'Stake',    title: 'Slashing escrow',       body: 'Providers lock SOL per listing. Bad data burns the stake.', tone: 'bg-forest-soft text-forest-dark' },
  { kicker: 'Oracle',   title: 'On-chain scoring',      body: 'Independent signer grades every feed every 30 minutes.',    tone: 'bg-sunflower-soft text-sunflower' },
  { kicker: 'Snapshot', title: 'Keccak Merkle roots',   body: 'Providers commit a root so buyers can spot-check any row.', tone: 'bg-clay-soft text-clay' },
  { kicker: 'Access',   title: 'HMAC keys, no re-sign', body: 'Subscribe once, call the gateway with a plain bearer token.', tone: 'bg-earth-100 text-ink' },
];

export default function LandingPage() {
  return (
    <div>
      {/* HERO */}
      <section className="relative overflow-hidden">
        {/* ambient orb */}
        <div aria-hidden className="hero-orb -z-10 top-[-160px] left-1/2 -translate-x-1/2 h-[420px] w-[820px]" style={{ background: 'rgba(45, 90, 39, 0.18)' }} />
        <div aria-hidden className="absolute inset-0 -z-10 bg-dots opacity-60" />

        <div className="max-w-6xl mx-auto px-6 pt-16 pb-16 md:pt-24 md:pb-24">
          <div className="grid lg:grid-cols-[1.15fr_0.95fr] items-center gap-12 lg:gap-16">
            <div>
              <div className="animate-fadeIn">
                <span className="pill bg-forest-soft text-forest-dark">
                  <span className="pulse-dot" />
                  Live on devnet · v2
                </span>
              </div>

              <h1 className="mt-6 font-display text-[44px] leading-[1.04] md:text-[64px] tracking-ultra">
                <span className="block animate-fadeUp" style={{ animationDelay: '80ms' }}>The marketplace where</span>
                <span className="block animate-fadeUp text-forest" style={{ animationDelay: '180ms' }}>real-world data</span>
                <span className="block animate-fadeUp" style={{ animationDelay: '280ms' }}>earns its trust.</span>
              </h1>

              <p
                className="mt-6 text-ink-muted text-[17px] leading-relaxed max-w-xl animate-fadeUp"
                style={{ animationDelay: '400ms' }}
              >
                DePIN Exchange lets teams buy verified IoT and DePIN data streams —
                GPS, weather, signal, imagery — while holding providers accountable
                with staked SOL and cryptographic snapshots.
              </p>

              <div
                className="mt-8 flex flex-wrap gap-3 animate-fadeUp"
                style={{ animationDelay: '520ms' }}
              >
                <Link href="/marketplace" className="btn-primary">
                  Browse marketplace <span className="arrow">→</span>
                </Link>
                <Link href="/provider" className="btn-secondary">
                  Sell a data feed
                </Link>
              </div>

              <div
                className="mt-10 grid grid-cols-3 gap-6 max-w-lg text-sm animate-fadeUp"
                style={{ animationDelay: '620ms' }}
              >
                <div>
                  <div className="font-display text-2xl text-ink tabular">
                    <CountUp value={0.1} decimals={2} />
                    <span className="text-ink-soft text-sm font-normal ml-1">SOL</span>
                  </div>
                  <div className="text-ink-soft text-xs mt-1">Minimum provider stake</div>
                </div>
                <div>
                  <div className="font-display text-2xl text-ink tabular">
                    <CountUp value={2.5} decimals={1} suffix="%" />
                  </div>
                  <div className="text-ink-soft text-xs mt-1">Platform commission</div>
                </div>
                <div>
                  <div className="font-display text-2xl text-ink tabular">
                    <CountUp value={30} />
                    <span className="text-ink-soft text-sm font-normal ml-1">min</span>
                  </div>
                  <div className="text-ink-soft text-xs mt-1">Oracle refresh cadence</div>
                </div>
              </div>
            </div>

            <div
              className="relative lg:sticky lg:top-24 space-y-4 animate-fadeUp"
              style={{ animationDelay: '320ms' }}
            >
              <CoverageMap
                highlights={[
                  { x: 200, y: 210, label: 'NYC fleet', tone: 'forest' },
                  { x: 440, y: 150, label: 'Berlin wx', tone: 'sunflower' },
                  { x: 660, y: 230, label: 'Tokyo AQI', tone: 'clay' },
                  { x: 380, y: 340, label: 'Helium', tone: 'forest' },
                  { x: 780, y: 310, label: 'Singapore', tone: 'sunflower' },
                ]}
              />
              <LiveFeed />
            </div>
          </div>
        </div>

        {/* marquee band — gently scrolling mentions */}
        <div className="border-y border-earth-100 bg-parchment/50 overflow-hidden">
          <div className="ticker py-3 text-[12px] font-mono text-ink-soft">
            {Array.from({ length: 2 }).map((_, dup) => (
              <div key={dup} className="flex gap-10 shrink-0">
                <span>· Helium · Hivemapper · IoTeX · Weatherman · Render · DeWi Alliance ·</span>
                <span>· Helium · Hivemapper · IoTeX · Weatherman · Render · DeWi Alliance ·</span>
                <span>· Helium · Hivemapper · IoTeX · Weatherman · Render · DeWi Alliance ·</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="max-w-6xl mx-auto px-6 py-20">
        <Reveal>
          <div className="max-w-2xl">
            <div className="text-xs uppercase tracking-[0.18em] text-ink-soft">How it works</div>
            <h2 className="mt-2 font-display text-3xl md:text-[34px] tracking-ultra">
              Three steps between a raw sensor and a reliable dataset.
            </h2>
          </div>
        </Reveal>

        <div className="mt-10 grid md:grid-cols-3 gap-5">
          {STEPS.map((step, idx) => (
            <Reveal key={step.n} delay={idx * 120}>
              <div className="panel panel-hover p-6 relative overflow-hidden h-full">
                <span
                  aria-hidden
                  className="absolute -top-10 -right-10 h-28 w-28 rounded-full opacity-50 blur-2xl"
                  style={{ background: idx === 0 ? 'rgba(45, 90, 39, 0.18)' : idx === 1 ? 'rgba(199, 146, 21, 0.18)' : 'rgba(180, 85, 44, 0.18)' }}
                />
                <span className={`chip ${step.accent}`}>{step.n}</span>
                <div className="relative mt-3 font-display text-lg">{step.title}</div>
                <p className="relative mt-2 text-ink-muted text-sm leading-relaxed">{step.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* TRUST RAIL */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <Reveal>
          <div className="panel p-8 md:p-10 relative overflow-hidden">
            <div
              aria-hidden
              className="absolute -top-24 -left-16 h-72 w-72 rounded-full blur-3xl opacity-60"
              style={{ background: 'rgba(45, 90, 39, 0.12)' }}
            />
            <div className="relative grid md:grid-cols-[1fr_1.2fr] gap-8 md:gap-10 items-start">
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-ink-soft">Why us</div>
                <h2 className="mt-2 font-display text-3xl tracking-ultra">
                  Verification, not vibes.
                </h2>
                <p className="mt-3 text-ink-muted leading-relaxed">
                  Every provider stakes SOL to list. A permissionless quality oracle scores
                  their feed every 30 minutes and pushes the result on-chain. Persistent
                  degradation triggers automatic slashing — the exchange can make providers
                  pay for bad data without a central arbiter.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                {TRUST_CARDS.map((card, idx) => (
                  <Reveal key={card.kicker} delay={idx * 120}>
                    <div className={`rounded-xl ${card.tone} px-4 py-3 transition-transform duration-300 hover:-translate-y-0.5 hover:shadow-card`}>
                      <div className="font-mono text-xs opacity-90">{card.kicker}</div>
                      <div className="mt-1 font-display">{card.title}</div>
                      <div className="mt-1 text-[11px] opacity-80 leading-relaxed">{card.body}</div>
                    </div>
                  </Reveal>
                ))}
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* AUDIENCE */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <Reveal>
          <div className="text-xs uppercase tracking-[0.18em] text-ink-soft">Built for</div>
        </Reveal>
        <div className="mt-3 grid md:grid-cols-3 gap-5">
          {AUDIENCE.map((item, idx) => (
            <Reveal key={item.title} delay={idx * 120}>
              <div className="relative border-l-2 border-earth-200 pl-5 transition-colors duration-300 hover:border-forest">
                <div className="font-display text-lg">{item.title}</div>
                <p className="mt-1 text-sm text-ink-muted leading-relaxed">{item.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-6xl mx-auto px-6 pb-24">
        <Reveal>
          <div className="panel p-10 bg-gradient-to-br from-ink to-[#2a2520] text-cream border-ink flex flex-col md:flex-row md:items-center md:justify-between gap-6 relative overflow-hidden">
            <div
              aria-hidden
              className="absolute -top-10 -right-10 h-72 w-72 rounded-full opacity-30 blur-3xl animate-drift"
              style={{ background: 'rgba(45, 90, 39, 0.5)' }}
            />
            <div className="relative">
              <div className="text-xs uppercase tracking-[0.18em] text-earth-200">Start now</div>
              <h2 className="mt-2 font-display text-3xl tracking-ultra">Six feeds live on devnet.</h2>
              <p className="mt-2 text-earth-200 max-w-lg">
                Connect Phantom or Solflare, grab the mock USDC from the faucet inside the app
                and subscribe in one click. No waitlist.
              </p>
            </div>
            <Link
              href="/marketplace"
              className="relative bg-cream text-ink px-5 py-2.5 rounded-lg font-medium text-sm hover:bg-parchment transition-all duration-200 hover:-translate-y-0.5 inline-flex items-center gap-2 group"
            >
              Enter marketplace
              <span className="transition-transform duration-300 group-hover:translate-x-1">→</span>
            </Link>
          </div>
        </Reveal>
      </section>
    </div>
  );
}
