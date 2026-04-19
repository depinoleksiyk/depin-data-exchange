'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import { useAnchorWallet, useConnection, useWallet } from '@solana/wallet-adapter-react';

import { DATA_TYPES, type DataTypeName } from '../lib/constants';
import { marketplaceClient } from '../lib/useProgram';
import {
  fetchExchange,
  fetchListings,
  fetchProvider,
  type RawListing,
} from '../lib/chain';
import { exchangePda, listingPda, providerPda, stakeVaultPda } from '../lib/pdas';
import {
  formatUsdc,
  fromUsdcRaw,
  qualityLabel,
  relativeTime,
  shortAddress,
} from '../lib/format';
import { StatTile } from '../components/StatTile';
import { Toast, type ToastMessage } from '../components/Toast';
import { Reveal } from '../components/Reveal';
import { CountUp } from '../components/CountUp';

const DATA_TYPE_MAP: Record<DataTypeName, any> = {
  GPS: { gps: {} },
  Weather: { weather: {} },
  Network: { network: {} },
  Camera: { camera: {} },
};

export default function ProviderPage() {
  const { connection } = useConnection();
  const anchorWallet = useAnchorWallet();
  const { publicKey } = useWallet();

  const [provider, setProvider] = useState<Awaited<ReturnType<typeof fetchProvider>>>(null);
  const [exchange, setExchange] = useState<Awaited<ReturnType<typeof fetchExchange>>>(null);
  const [myListings, setMyListings] = useState<RawListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [txBusy, setTxBusy] = useState<null | 'register' | 'stake' | 'listing' | 'snapshot'>(null);

  const [regName, setRegName] = useState('');
  const [stakeAmount, setStakeAmount] = useState('0.15');
  const [lockHours, setLockHours] = useState('24');

  const [form, setForm] = useState({
    title: '',
    description: '',
    type: 'GPS' as DataTypeName,
    ppq: '0.003',
    sub: '5.0',
  });

  const refresh = useCallback(async () => {
    if (!publicKey) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const program = marketplaceClient(connection);
      const [prov, exch, all] = await Promise.all([
        fetchProvider(program, publicKey),
        fetchExchange(program),
        fetchListings(program),
      ]);
      setProvider(prov);
      setExchange(exch);
      setMyListings(all.filter((l) => l.provider.equals(publicKey)));
    } finally {
      setLoading(false);
    }
  }, [connection, publicKey]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleRegister = useCallback(async () => {
    if (!anchorWallet || !publicKey || !regName.trim()) return;
    setTxBusy('register');
    try {
      const program = marketplaceClient(connection, anchorWallet as any);
      const sig = await (program.methods as any)
        .registerProvider(regName.trim())
        .accountsPartial({
          provider: providerPda(publicKey),
          stakeVault: stakeVaultPda(publicKey),
          wallet: publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      setToast({
        tone: 'success',
        title: 'Provider registered',
        link: { href: `https://explorer.solana.com/tx/${sig}?cluster=devnet`, label: 'Explorer' },
      });
      refresh();
    } catch (err: any) {
      setToast({ tone: 'error', title: 'Register failed', body: err?.message });
    } finally {
      setTxBusy(null);
    }
  }, [anchorWallet, connection, publicKey, regName, refresh]);

  const handleStake = useCallback(async () => {
    if (!anchorWallet || !publicKey) return;
    const amountSol = Number(stakeAmount);
    const hours = Number(lockHours);
    if (!Number.isFinite(amountSol) || amountSol <= 0) {
      setToast({ tone: 'error', title: 'Invalid amount', body: 'Enter a positive SOL value.' });
      return;
    }
    if (!Number.isFinite(hours) || hours < 0) {
      setToast({ tone: 'error', title: 'Invalid lock duration', body: 'Hours must be a non-negative number.' });
      return;
    }
    setTxBusy('stake');
    try {
      const program = marketplaceClient(connection, anchorWallet as any);
      const sig = await (program.methods as any)
        .stakeProvider(new BN(Math.round(amountSol * LAMPORTS_PER_SOL)), new BN(Math.max(0, hours * 3600)))
        .accountsPartial({
          provider: providerPda(publicKey),
          stakeVault: stakeVaultPda(publicKey),
          providerWallet: publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      setToast({
        tone: 'success',
        title: 'Stake deposited',
        body: `${amountSol} SOL locked for ${hours}h.`,
        link: { href: `https://explorer.solana.com/tx/${sig}?cluster=devnet`, label: 'Explorer' },
      });
      refresh();
    } catch (err: any) {
      setToast({ tone: 'error', title: 'Stake failed', body: err?.message });
    } finally {
      setTxBusy(null);
    }
  }, [anchorWallet, connection, publicKey, stakeAmount, lockHours, refresh]);

  const handleCreateListing = useCallback(async () => {
    if (!anchorWallet || !publicKey || !provider) return;
    if (!form.title.trim()) {
      setToast({ tone: 'error', title: 'Title required' });
      return;
    }
    const ppq = parseFloat(form.ppq || '0');
    const sub = parseFloat(form.sub || '0');
    if (!Number.isFinite(ppq) || ppq < 0 || !Number.isFinite(sub) || sub < 0) {
      setToast({ tone: 'error', title: 'Invalid pricing', body: 'USDC values must be non-negative numbers.' });
      return;
    }
    setTxBusy('listing');
    try {
      const program = marketplaceClient(connection, anchorWallet as any);
      const listingId = provider.nextListingId;
      const ppqRaw = Math.round(ppq * 1_000_000);
      const subRaw = Math.round(sub * 1_000_000);
      const args = {
        dataType: DATA_TYPE_MAP[form.type],
        title: form.title.trim(),
        description: form.description.trim() || `${form.type} data feed`,
        pricePerQuery: new BN(ppqRaw),
        priceSubscriptionMonthly: new BN(subRaw),
      };
      const sig = await (program.methods as any)
        .createListing(args)
        .accountsPartial({
          exchange: exchangePda(),
          provider: providerPda(publicKey),
          listing: listingPda(publicKey, listingId),
          providerWallet: publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      setToast({
        tone: 'success',
        title: 'Listing published',
        body: `${form.title} is live on-chain.`,
        link: { href: `https://explorer.solana.com/tx/${sig}?cluster=devnet`, label: 'Explorer' },
      });
      setForm({ ...form, title: '', description: '' });
      refresh();
    } catch (err: any) {
      setToast({ tone: 'error', title: 'Create listing failed', body: err?.message });
    } finally {
      setTxBusy(null);
    }
  }, [anchorWallet, connection, publicKey, provider, form, refresh]);

  const handleSnapshot = useCallback(async (listing: RawListing) => {
    if (!anchorWallet || !publicKey) return;
    setTxBusy('snapshot');
    try {
      const program = marketplaceClient(connection, anchorWallet as any);
      const root = new Uint8Array(32);
      crypto.getRandomValues(root);
      const sig = await (program.methods as any)
        .commitSnapshot(Array.from(root))
        .accountsPartial({
          listing: listing.pubkey,
          providerWallet: publicKey,
        })
        .rpc();
      setToast({
        tone: 'success',
        title: 'Snapshot committed',
        link: { href: `https://explorer.solana.com/tx/${sig}?cluster=devnet`, label: 'Explorer' },
      });
      refresh();
    } catch (err: any) {
      setToast({ tone: 'error', title: 'Snapshot failed', body: err?.message });
    } finally {
      setTxBusy(null);
    }
  }, [anchorWallet, connection, publicKey, refresh]);

  const aggregate = useMemo(() => {
    if (myListings.length === 0) return { queries: 0, revenue: 0, avgQuality: 0 };
    const queries = myListings.reduce((s, l) => s + Number(l.totalQueries), 0);
    const revenue = myListings.reduce((s, l) => s + Number(l.totalRevenue), 0);
    const avgQuality = Math.round(myListings.reduce((s, l) => s + l.qualityScore, 0) / myListings.length);
    return { queries, revenue, avgQuality };
  }, [myListings]);

  if (!publicKey) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-20 animate-fadeUp">
        <div className="panel p-10 text-center relative overflow-hidden">
          <div
            aria-hidden
            className="absolute -top-24 -left-16 h-60 w-60 rounded-full blur-3xl opacity-60"
            style={{ background: 'rgba(45, 90, 39, 0.16)' }}
          />
          <div className="relative text-xs uppercase tracking-[0.16em] text-ink-soft">Providers</div>
          <h1 className="relative font-display text-[34px] mt-2 tracking-ultra">Monetise your sensors</h1>
          <p className="relative mt-3 text-ink-muted">
            Connect Phantom or Solflare to register as a provider and stake SOL. Your
            listings appear in the marketplace the moment the transaction confirms.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8 animate-fadeUp">
        <div>
          <div className="text-xs uppercase tracking-[0.16em] text-ink-soft">Provider console</div>
          <h1 className="mt-1 font-display text-3xl md:text-[38px] tracking-ultra">
            {provider ? provider.name : 'Become a provider'}
          </h1>
          <p className="mt-1 text-ink-muted text-sm">
            Wallet · <span className="font-mono">{shortAddress(publicKey.toBase58(), 5)}</span>
          </p>
        </div>
        <button onClick={refresh} className="btn-ghost border border-earth-200 text-xs" disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {!provider ? (
        <Reveal>
          <section className="panel p-6 max-w-lg relative overflow-hidden">
            <div
              aria-hidden
              className="absolute -top-16 -right-16 h-36 w-36 rounded-full blur-2xl opacity-40"
              style={{ background: 'rgba(45, 90, 39, 0.22)' }}
            />
            <div className="relative font-display text-lg">Register once, keep forever</div>
            <p className="relative mt-1 text-sm text-ink-muted">
              The register step creates your provider account plus a dedicated staking vault.
            </p>
            <label className="relative block mt-4 text-xs text-ink-soft uppercase tracking-wide">
              Provider name
            </label>
            <input
              value={regName}
              onChange={(e) => setRegName(e.target.value)}
              placeholder="e.g. Metro Fleet Labs"
              className="relative w-full mt-1 bg-parchment border border-earth-200 rounded-md px-3 py-2.5 text-sm outline-none focus:border-forest focus:shadow-glow transition-all"
            />
            <button
              onClick={handleRegister}
              disabled={txBusy !== null || !regName.trim()}
              className="btn-primary mt-4"
            >
              {txBusy === 'register' ? 'Registering…' : <>Register provider <span className="arrow">→</span></>}
            </button>
          </section>
        </Reveal>
      ) : (
        <>
          <div className="grid md:grid-cols-4 gap-3 mb-8 animate-fadeUp" style={{ animationDelay: '120ms' }}>
            <StatTile
              label="Staked"
              value={<><CountUp value={Number(provider.stakeAmount) / LAMPORTS_PER_SOL} decimals={3} /> SOL</>}
              hint={`min ${exchange ? (Number(exchange.minStakeLamports) / LAMPORTS_PER_SOL).toFixed(2) : '—'} SOL · lock ${relativeTime(provider.stakeLockedUntil)}`}
              tone="forest"
            />
            <StatTile
              label="Listings"
              value={<CountUp value={provider.totalListings} />}
              hint={`next id #${provider.nextListingId}`}
            />
            <StatTile
              label="Lifetime revenue"
              value={<><CountUp value={fromUsdcRaw(provider.totalRevenue)} decimals={2} /> USDC</>}
              tone="sunflower"
            />
            <StatTile
              label="Avg quality"
              value={provider.avgQualityScore > 0 ? <><CountUp value={provider.avgQualityScore} />%</> : '—'}
              hint={provider.slashCount > 0 ? `slashed ${provider.slashCount}×` : 'clean record'}
              tone={provider.slashCount > 0 ? 'clay' : 'forest'}
            />
          </div>

          <div className="grid md:grid-cols-2 gap-5 mb-10">
            <Reveal>
              <section className="panel p-6 h-full">
                <div className="font-display text-lg">Stake more SOL</div>
                <p className="mt-1 text-xs text-ink-soft leading-relaxed">
                  Stake is held in a PDA vault. A failing oracle score can slash it — meet the
                  threshold and you keep it all. Lock timers extend whenever you top up.
                </p>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-ink-soft">Amount (SOL)</label>
                    <input
                      value={stakeAmount}
                      onChange={(e) => setStakeAmount(e.target.value)}
                      className="w-full mt-1 bg-parchment border border-earth-200 rounded-md px-3 py-2 text-sm outline-none focus:border-forest transition-colors"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-ink-soft">Lock (hours)</label>
                    <input
                      value={lockHours}
                      onChange={(e) => setLockHours(e.target.value)}
                      className="w-full mt-1 bg-parchment border border-earth-200 rounded-md px-3 py-2 text-sm outline-none focus:border-forest transition-colors"
                    />
                  </div>
                </div>
                <button onClick={handleStake} disabled={txBusy !== null} className="btn-primary mt-4 w-full justify-center">
                  {txBusy === 'stake' ? 'Signing…' : <>Deposit stake <span className="arrow">→</span></>}
                </button>
              </section>
            </Reveal>

            <Reveal delay={120}>
              <section className="panel p-6 h-full">
                <div className="font-display text-lg">Publish a listing</div>
                <p className="mt-1 text-xs text-ink-soft leading-relaxed">
                  Listings inherit your stake. Keep pricing honest — buyers compare per-query
                  cost and quality score in the marketplace grid.
                </p>
                <div className="mt-4 space-y-3">
                  <input
                    placeholder="Stream title"
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    className="w-full bg-parchment border border-earth-200 rounded-md px-3 py-2 text-sm outline-none focus:border-forest transition-colors"
                  />
                  <input
                    placeholder="One-line description"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    className="w-full bg-parchment border border-earth-200 rounded-md px-3 py-2 text-sm outline-none focus:border-forest transition-colors"
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <select
                      value={form.type}
                      onChange={(e) => setForm({ ...form, type: e.target.value as DataTypeName })}
                      className="bg-parchment border border-earth-200 rounded-md px-2 py-2 text-sm focus:border-forest transition-colors"
                    >
                      {DATA_TYPES.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                    <input
                      placeholder="USDC/query"
                      value={form.ppq}
                      onChange={(e) => setForm({ ...form, ppq: e.target.value })}
                      className="bg-parchment border border-earth-200 rounded-md px-2 py-2 text-sm focus:border-forest transition-colors"
                    />
                    <input
                      placeholder="USDC/month"
                      value={form.sub}
                      onChange={(e) => setForm({ ...form, sub: e.target.value })}
                      className="bg-parchment border border-earth-200 rounded-md px-2 py-2 text-sm focus:border-forest transition-colors"
                    />
                  </div>
                  <button
                    onClick={handleCreateListing}
                    disabled={txBusy !== null || provider.stakeAmount < (exchange?.minStakeLamports || 0n)}
                    className="btn-primary w-full justify-center"
                  >
                    {txBusy === 'listing' ? 'Signing…' : <>Publish listing <span className="arrow">→</span></>}
                  </button>
                  {exchange && provider.stakeAmount < exchange.minStakeLamports && (
                    <p className="text-xs text-clay animate-fadeIn">
                      Stake is below the minimum — top up before creating listings.
                    </p>
                  )}
                </div>
              </section>
            </Reveal>
          </div>

          <Reveal>
            <section className="panel p-0 overflow-hidden">
              <div className="flex items-center justify-between p-5 border-b border-earth-100">
                <div>
                  <div className="text-xs uppercase tracking-[0.16em] text-ink-soft">Your listings</div>
                  <div className="font-display text-lg mt-1">
                    <CountUp value={myListings.length} /> live
                  </div>
                </div>
                <div className="text-xs text-ink-soft tabular">
                  <CountUp value={aggregate.queries} /> queries · avg quality{' '}
                  {aggregate.avgQuality || '—'}%
                </div>
              </div>

              {myListings.length === 0 ? (
                <div className="p-10 text-center text-ink-soft text-sm">
                  No listings yet — publish your first one above.
                </div>
              ) : (
                <div className="divide-y divide-earth-100">
                  {myListings.map((l, idx) => {
                    const q = qualityLabel(l.qualityScore);
                    return (
                      <div
                        key={l.pubkey.toBase58()}
                        className="grid md:grid-cols-[1.4fr_1fr_1fr_auto] gap-3 items-center p-4 hover:bg-parchment/40 transition-colors animate-fadeUp"
                        style={{ animationDelay: `${idx * 60}ms` }}
                      >
                        <div>
                          <Link href={`/listing/${l.pubkey.toBase58()}`} className="font-medium hover:text-forest transition-colors">
                            {l.title}
                          </Link>
                          <div className="text-[11px] text-ink-soft font-mono mt-0.5">
                            {shortAddress(l.pubkey.toBase58(), 6)} · id #{l.listingId.toString()}
                          </div>
                        </div>
                        <div className="text-sm font-mono text-ink-muted tabular">
                          {formatUsdc(fromUsdcRaw(l.priceSubscriptionMonthly))} USDC/mo
                        </div>
                        <div className="text-sm">
                          <span className={`font-mono tabular ${
                            q.tone === 'good' ? 'text-forest-dark' : q.tone === 'warn' ? 'text-sunflower' : 'text-danger'
                          }`}>
                            {l.qualityScore}%
                          </span>{' '}
                          <span className="text-ink-soft text-xs">{q.label}</span>
                        </div>
                        <button
                          onClick={() => handleSnapshot(l)}
                          disabled={txBusy !== null}
                          className="btn-secondary text-xs"
                        >
                          {txBusy === 'snapshot' ? '…' : 'Commit snapshot'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </Reveal>
        </>
      )}

      <Toast message={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
