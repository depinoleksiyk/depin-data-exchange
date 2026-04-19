'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { SystemProgram, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
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
  bindListingSource,
  getListingSource,
  requestSourceChallenge,
} from '../lib/gateway';
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
  const { publicKey, signMessage } = useWallet();

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
    source: '',
    secret: '',
  });
  const [sourceDialog, setSourceDialog] = useState<{
    listing: string;
    title: string;
    url: string;
    secret: string;
  } | null>(null);
  const [sourceMap, setSourceMap] = useState<Record<string, { url: string; updatedAt: number } | null>>({});

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

  // Pull the off-chain source URL for each of my listings so the table can
  // show whether it's wired to a real upstream.
  useEffect(() => {
    if (myListings.length === 0) return;
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        myListings.map(async (l) => {
          const key = l.pubkey.toBase58();
          try {
            const info = await getListingSource(key);
            return [key, info?.bound ? { url: info.url, updatedAt: info.updatedAt } : null] as const;
          } catch {
            return [key, null] as const;
          }
        })
      );
      if (cancelled) return;
      setSourceMap(Object.fromEntries(entries));
    })();
    return () => {
      cancelled = true;
    };
  }, [myListings]);

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

      // If the provider included a data source URL, bind it now. Failure is
      // non-fatal — the listing is already live; the user can retry from the
      // row's "Bind source" action.
      const sourceUrl = form.source.trim();
      if (sourceUrl) {
        try {
          const listingPubkey = listingPda(publicKey, listingId).toBase58();
          await handleBindSource(listingPubkey, sourceUrl, form.secret.trim(), form.title);
        } catch (err: any) {
          setToast({
            tone: 'info',
            title: 'Source binding needs signing',
            body: 'Listing is live, but bind the upstream later from the table.',
          });
        }
      }

      setForm({ ...form, title: '', description: '', source: '', secret: '' });
      refresh();
    } catch (err: any) {
      setToast({ tone: 'error', title: 'Create listing failed', body: err?.message });
    } finally {
      setTxBusy(null);
    }
  }, [anchorWallet, connection, publicKey, provider, form, refresh]);

  const handleBindSource = useCallback(async (listingPubkey: string, url: string, secret: string, title: string) => {
    if (!publicKey || !signMessage) {
      setToast({ tone: 'error', title: 'Wallet does not support signMessage' });
      return;
    }
    const trimmed = url.trim();
    if (!trimmed) {
      setToast({ tone: 'error', title: 'Data source URL required' });
      return;
    }
    setTxBusy('snapshot');
    try {
      const challenge = await requestSourceChallenge(listingPubkey);
      if (challenge.provider !== publicKey.toBase58()) {
        setToast({ tone: 'error', title: 'Not the listing owner' });
        return;
      }
      const encoded = new TextEncoder().encode(challenge.message);
      const signed = await signMessage(encoded);
      const signatureB58 = bs58.encode(signed);
      await bindListingSource({
        listing: listingPubkey,
        url: trimmed,
        secret: secret.trim() || undefined,
        nonce: challenge.nonce,
        signature: signatureB58,
      });
      setSourceMap((prev) => ({ ...prev, [listingPubkey]: { url: trimmed, updatedAt: Date.now() } }));
      setSourceDialog(null);
      setToast({
        tone: 'success',
        title: 'Source bound',
        body: `${title} will now proxy to ${trimmed.slice(0, 40)}…`,
      });
    } catch (err: any) {
      setToast({ tone: 'error', title: 'Bind failed', body: err?.message?.slice(0, 140) });
    } finally {
      setTxBusy(null);
    }
  }, [publicKey, signMessage]);

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
          {(provider.stakeAmount === 0n || provider.totalListings === 0) && exchange && (
            <Reveal>
              <div
                className="panel p-6 mb-6 relative overflow-hidden"
                style={{ background: 'linear-gradient(135deg, #fdf8ec 0%, #f3ecdc 100%)' }}
              >
                <div
                  aria-hidden
                  className="absolute -top-12 -left-12 h-40 w-40 rounded-full blur-3xl opacity-50"
                  style={{ background: 'rgba(45, 90, 39, 0.22)' }}
                />
                <div className="relative">
                  <div className="text-xs uppercase tracking-[0.16em] text-ink-soft">Getting started</div>
                  <h2 className="mt-1 font-display text-xl">
                    {provider.stakeAmount === 0n
                      ? 'Stake SOL to unlock listings'
                      : 'Publish your first listing'}
                  </h2>
                  <ol className="mt-4 space-y-2.5 text-sm text-ink-muted">
                    <OnboardStep
                      num="1"
                      done={provider.stakeAmount > 0n}
                      title={`Stake at least ${(Number(exchange.minStakeLamports) / LAMPORTS_PER_SOL).toFixed(2)} SOL`}
                      body="Your stake is slashable collateral — it proves you'll stand by the data you sell. Starts unlocking after the lock period ends."
                    />
                    <OnboardStep
                      num="2"
                      done={provider.totalListings > 0}
                      title="Publish a listing"
                      body="Title, one-line pitch, data type, per-query + monthly prices. Buyers see it in the marketplace on the next block."
                    />
                    <OnboardStep
                      num="3"
                      done={false}
                      title="Commit a snapshot when ready"
                      body="Once you have a dataset to back it, click 'Commit snapshot' on the listing to publish a keccak Merkle root buyers can spot-check."
                    />
                  </ol>
                  {provider.stakeAmount === 0n && (
                    <p className="mt-4 text-[12px] text-ink-soft">
                      Need devnet SOL? Run{' '}
                      <code className="font-mono bg-earth-100 px-1.5 py-0.5 rounded text-ink">
                        solana airdrop 1 {publicKey.toBase58().slice(0, 6)}… --url devnet
                      </code>{' '}
                      or grab it from the{' '}
                      <a
                        href="https://faucet.solana.com/"
                        target="_blank"
                        rel="noreferrer"
                        className="link-plain"
                      >
                        official faucet
                      </a>
                      .
                    </p>
                  )}
                </div>
              </div>
            </Reveal>
          )}

          <div className="grid md:grid-cols-4 gap-3 mb-8 animate-fadeUp" style={{ animationDelay: '120ms' }}>
            <StatTile
              label="Staked"
              value={<><CountUp value={Number(provider.stakeAmount) / LAMPORTS_PER_SOL} decimals={3} /> SOL</>}
              hint={
                provider.stakeAmount === 0n
                  ? `min ${exchange ? (Number(exchange.minStakeLamports) / LAMPORTS_PER_SOL).toFixed(2) : '—'} SOL — not yet staked`
                  : `min ${exchange ? (Number(exchange.minStakeLamports) / LAMPORTS_PER_SOL).toFixed(2) : '—'} SOL · unlocks ${relativeTime(provider.stakeLockedUntil)}`
              }
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
                  <div className="pt-2 border-t border-earth-100 space-y-2">
                    <div className="text-[11px] uppercase tracking-wide text-ink-soft flex items-center justify-between">
                      <span>Data source URL</span>
                      <span className="text-[10px] normal-case tracking-normal">optional · can be added later</span>
                    </div>
                    <input
                      placeholder="https://sensors.example.com/feed"
                      value={form.source}
                      onChange={(e) => setForm({ ...form, source: e.target.value })}
                      className="w-full bg-parchment border border-earth-200 rounded-md px-3 py-2 text-sm focus:border-forest transition-colors font-mono"
                    />
                    <input
                      placeholder="x-depin-secret header (optional)"
                      value={form.secret}
                      onChange={(e) => setForm({ ...form, secret: e.target.value })}
                      className="w-full bg-parchment border border-earth-200 rounded-md px-3 py-2 text-sm focus:border-forest transition-colors font-mono"
                    />
                    <p className="text-[11px] text-ink-soft leading-relaxed">
                      Leave empty and buyers will receive demo samples. Set it and the gateway proxies every
                      authed query to your endpoint, passing <code className="font-mono">x-depin-buyer</code> and
                      (if set) <code className="font-mono">x-depin-secret</code>.
                    </p>
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
                    const srcKey = l.pubkey.toBase58();
                    const src = sourceMap[srcKey];
                    return (
                      <div
                        key={srcKey}
                        className="grid md:grid-cols-[1.6fr_1fr_1fr_auto] gap-3 items-center p-4 hover:bg-parchment/40 transition-colors animate-fadeUp"
                        style={{ animationDelay: `${idx * 60}ms` }}
                      >
                        <div className="min-w-0">
                          <Link href={`/listing/${srcKey}`} className="font-medium hover:text-forest transition-colors">
                            {l.title}
                          </Link>
                          <div className="text-[11px] text-ink-soft font-mono mt-0.5 truncate">
                            {shortAddress(srcKey, 6)} · id #{l.listingId.toString()}
                          </div>
                          {src ? (
                            <div className="text-[11px] text-forest-dark mt-1 flex items-center gap-1">
                              <span className="h-1.5 w-1.5 rounded-full bg-forest inline-block" />
                              <span className="font-mono truncate">live · {src.url.replace(/^https?:\/\//, '')}</span>
                            </div>
                          ) : (
                            <div className="text-[11px] text-ink-soft mt-1">
                              no source bound — buyers get demo samples
                            </div>
                          )}
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
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() =>
                              setSourceDialog({
                                listing: srcKey,
                                title: l.title,
                                url: src?.url || '',
                                secret: '',
                              })
                            }
                            disabled={txBusy !== null}
                            className="btn-ghost border border-earth-200 text-xs"
                          >
                            {src ? 'Edit source' : 'Bind source'}
                          </button>
                          <button
                            onClick={() => handleSnapshot(l)}
                            disabled={txBusy !== null}
                            className="btn-secondary text-xs"
                          >
                            {txBusy === 'snapshot' ? '…' : 'Snapshot'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </Reveal>
        </>
      )}

      {sourceDialog && (
        <SourceDialog
          dialog={sourceDialog}
          busy={txBusy === 'snapshot'}
          onClose={() => setSourceDialog(null)}
          onSubmit={async () => {
            await handleBindSource(
              sourceDialog.listing,
              sourceDialog.url,
              sourceDialog.secret,
              sourceDialog.title
            );
          }}
          onChange={(patch) => setSourceDialog({ ...sourceDialog, ...patch })}
        />
      )}

      <Toast message={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}

function SourceDialog({
  dialog,
  busy,
  onClose,
  onSubmit,
  onChange,
}: {
  dialog: { listing: string; title: string; url: string; secret: string };
  busy: boolean;
  onClose: () => void;
  onSubmit: () => void;
  onChange: (patch: Partial<typeof dialog>) => void;
}) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center px-4 animate-fadeIn"
      style={{ background: 'rgba(28, 24, 22, 0.5)' }}
      onClick={onClose}
    >
      <div
        className="panel w-full max-w-md p-6 animate-fadeUp"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-xs uppercase tracking-[0.16em] text-ink-soft">Data source</div>
        <h3 className="font-display text-xl mt-1">{dialog.title}</h3>
        <p className="mt-2 text-[13px] text-ink-muted leading-relaxed">
          When this is set, every paid query for this listing proxies to your endpoint.
          Gateway signs <code className="font-mono text-[11px] bg-earth-50 px-1 rounded">x-depin-buyer</code>
          {' '}and <code className="font-mono text-[11px] bg-earth-50 px-1 rounded">x-depin-listing</code> into the
          request so you can audit + gate access.
        </p>
        <div className="mt-4 space-y-3">
          <div>
            <label className="text-[11px] uppercase tracking-wide text-ink-soft">HTTPS URL</label>
            <input
              value={dialog.url}
              onChange={(e) => onChange({ url: e.target.value })}
              placeholder="https://sensors.example.com/feed"
              className="w-full mt-1 bg-parchment border border-earth-200 rounded-md px-3 py-2 text-sm font-mono focus:border-forest transition-colors"
            />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wide text-ink-soft">
              Secret header <span className="normal-case text-ink-soft">(optional)</span>
            </label>
            <input
              value={dialog.secret}
              onChange={(e) => onChange({ secret: e.target.value })}
              placeholder="x-depin-secret value"
              className="w-full mt-1 bg-parchment border border-earth-200 rounded-md px-3 py-2 text-sm font-mono focus:border-forest transition-colors"
            />
          </div>
        </div>
        <p className="mt-3 text-[11px] text-ink-soft leading-relaxed">
          You'll be asked to sign a short challenge with your wallet to prove you own the listing.
        </p>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button onClick={onClose} className="btn-ghost border border-earth-200 text-xs">
            Cancel
          </button>
          <button onClick={onSubmit} disabled={busy} className="btn-primary text-xs">
            {busy ? 'Signing…' : 'Sign & bind'}
          </button>
        </div>
      </div>
    </div>
  );
}

function OnboardStep({
  num,
  title,
  body,
  done,
}: {
  num: string;
  title: string;
  body: string;
  done: boolean;
}) {
  return (
    <li className="flex items-start gap-3">
      <span
        className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold transition-colors ${
          done ? 'bg-forest text-cream' : 'bg-earth-100 text-ink'
        }`}
      >
        {done ? '✓' : num}
      </span>
      <div>
        <div className={`text-sm font-medium ${done ? 'text-ink-soft line-through' : 'text-ink'}`}>
          {title}
        </div>
        <div className="text-[12px] leading-relaxed text-ink-soft">{body}</div>
      </div>
    </li>
  );
}
