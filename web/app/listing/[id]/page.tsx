'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { PublicKey, SystemProgram, Transaction, TransactionInstruction } from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import { useAnchorWallet, useConnection, useWallet } from '@solana/wallet-adapter-react';

import {
  DATA_TYPE_META,
  EXCHANGE_AUTHORITY,
  TREASURY_ATA,
  USDC_MINT,
} from '../../lib/constants';
import { marketplaceClient } from '../../lib/useProgram';
import {
  ensureUsdcAta,
  fetchExchange,
  fetchListing,
  fetchProvider,
  fetchSubscriptionView,
  accessKeyHashBytes,
  commissionPreview,
  randomAccessKey,
  type RawListing,
} from '../../lib/chain';
import { exchangePda, providerPda, subscriptionPda } from '../../lib/pdas';
import {
  formatUsdc,
  fromUsdcRaw,
  qualityLabel,
  shortAddress,
  relativeTime,
  bytesToHex,
} from '../../lib/format';
import { StatTile } from '../../components/StatTile';
import { Toast, type ToastMessage } from '../../components/Toast';
import { Reveal } from '../../components/Reveal';
import { CountUp } from '../../components/CountUp';
import { authedQuery, getListingSource, issueAccessKey, payWithSol, samplePreview, sampleProof } from '../../lib/gateway';
import { formatSol, usdcRawToLamports, useSolPrice } from '../../lib/sol-price';
import { clearAccessKey, loadAccessKey, saveAccessKey } from '../../lib/access-key-store';

const MONTH_OPTIONS = [1, 3, 6, 12];

export default function ListingDetailPage() {
  const params = useParams();
  const pubkeyStr = Array.isArray(params.id) ? params.id[0] : (params.id as string);
  const { connection } = useConnection();
  const anchorWallet = useAnchorWallet();
  const { publicKey } = useWallet();

  const listingPubkey = useMemo(() => {
    try {
      return pubkeyStr ? new PublicKey(pubkeyStr) : null;
    } catch {
      return null;
    }
  }, [pubkeyStr]);

  const [listing, setListing] = useState<RawListing | null>(null);
  const [providerAccount, setProviderAccount] = useState<Awaited<ReturnType<typeof fetchProvider>>>(null);
  const [exchange, setExchange] = useState<Awaited<ReturnType<typeof fetchExchange>>>(null);
  const [subscription, setSubscription] = useState<Awaited<ReturnType<typeof fetchSubscriptionView>>>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [months, setMonths] = useState<number>(1);
  const [txBusy, setTxBusy] = useState<null | 'subscribe' | 'subscribeSol' | 'issueKey' | 'query'>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const { price: solPrice, refresh: refreshSolPrice } = useSolPrice();

  const [accessKey, _setAccessKey] = useState<string | null>(null);
  const setAccessKey = useCallback(
    (key: string | null) => {
      _setAccessKey(key);
      if (subscription) {
        const subKey = subscription.pubkey.toBase58();
        if (key) saveAccessKey(subKey, key);
        else clearAccessKey(subKey);
      }
    },
    [subscription]
  );
  const [queryType, setQueryType] = useState<string>('gps');
  const [queryResult, setQueryResult] = useState<any>(null);
  const [preview, setPreview] = useState<any>(null);
  const [proof, setProof] = useState<any>(null);
  const [sourceInfo, setSourceInfo] = useState<{ bound: boolean; url?: string; updatedAt?: number } | null>(null);

  const refresh = useCallback(async () => {
    if (!listingPubkey) return;
    setLoading(true);
    try {
      const program = marketplaceClient(connection);
      const row = await fetchListing(program, listingPubkey);
      if (!row) {
        setNotFound(true);
        return;
      }
      setListing(row);
      const [prov, exch] = await Promise.all([
        fetchProvider(program, row.provider),
        fetchExchange(program),
      ]);
      setProviderAccount(prov);
      setExchange(exch);
      if (publicKey) {
        const sub = await fetchSubscriptionView(program, listingPubkey, publicKey);
        setSubscription(sub);
        if (sub?.accessKeyActive) {
          const cached = loadAccessKey(sub.pubkey.toBase58());
          if (cached) _setAccessKey(cached);
        }
      } else {
        setSubscription(null);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [connection, listingPubkey, publicKey]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!listing) return;
    const pub = listing.pubkey.toBase58();
    samplePreview(pub, listing.dataType).then(setPreview).catch(() => setPreview(null));
    sampleProof(pub, listing.dataType).then(setProof).catch(() => setProof(null));
    getListingSource(pub).then(setSourceInfo).catch(() => setSourceInfo(null));
  }, [listing]);

  const meta = listing ? DATA_TYPE_META[listing.dataType] : null;
  const quality = listing ? qualityLabel(listing.qualityScore) : null;
  const pricing = useMemo(() => {
    if (!listing || !exchange) return null;
    return commissionPreview(listing.priceSubscriptionMonthly, exchange.commissionBps, months);
  }, [listing, exchange, months]);

  const handleSubscribe = useCallback(async () => {
    if (!anchorWallet || !listing || !publicKey) return;
    setTxBusy('subscribe');
    try {
      const program = marketplaceClient(connection, anchorWallet as any);

      // Pre-check: the provider must already have a USDC ATA — their share
      // of the subscription is paid straight into it. If it doesn't exist,
      // Anchor's constraint fires with a cryptic error; surface a clear
      // message instead so the buyer isn't stuck debugging.
      const providerAta = getAssociatedTokenAddressSync(USDC_MINT, listing.provider);
      const providerAtaInfo = await connection.getAccountInfo(providerAta);
      if (!providerAtaInfo) {
        setToast({
          tone: 'error',
          title: 'Provider has no USDC account yet',
          body: 'The provider needs to create their USDC associated token account before they can be paid. Ping them to run a one-time setup.',
        });
        return;
      }

      const preIxs: TransactionInstruction[] = [];
      const buyerAta = await ensureUsdcAta(connection, publicKey, publicKey, preIxs);

      // Quick balance sanity check — fail fast if the buyer has zero USDC,
      // rather than sending a tx that will revert inside the token program.
      try {
        const balance = await connection.getTokenAccountBalance(buyerAta);
        const required = Number(listing.priceSubscriptionMonthly) * months;
        const held = Number(balance?.value?.amount || 0);
        if (held < required) {
          setToast({
            tone: 'error',
            title: 'Not enough mock USDC',
            body: `Need ${(required / 1_000_000).toFixed(2)} USDC, wallet has ${(held / 1_000_000).toFixed(2)}. Ask the exchange authority for a hand-out.`,
          });
          return;
        }
      } catch {
        // Balance fetch failing (e.g. account brand-new) is fine — ATA was
        // just created in preIxs, so skip the check and let the chain decide.
      }

      const sig = await (program.methods as any)
        .subscribe(months)
        .accountsPartial({
          exchange: exchangePda(),
          listing: listing.pubkey,
          subscription: subscriptionPda(listing.pubkey, publicKey),
          buyerUsdc: buyerAta,
          providerUsdc: providerAta,
          treasuryUsdc: TREASURY_ATA,
          provider: providerPda(listing.provider),
          buyer: publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .preInstructions(preIxs)
        .rpc();
      await connection.confirmTransaction(sig, 'confirmed');

      setToast({
        tone: 'success',
        title: 'Subscription activated',
        body: `${listing.title} · ${months} month${months > 1 ? 's' : ''}`,
        link: { href: `https://explorer.solana.com/tx/${sig}?cluster=devnet`, label: 'View on Explorer' },
      });
      refresh();
    } catch (err: any) {
      console.error(err);
      setToast({
        tone: 'error',
        title: 'Subscribe failed',
        body: err?.message?.includes('insufficient') ? 'Not enough USDC in your wallet.' : err?.message || 'Unknown error',
      });
    } finally {
      setTxBusy(null);
    }
  }, [anchorWallet, listing, publicKey, connection, months, refresh]);

  const solQuote = useMemo(() => {
    if (!listing || !exchange || !solPrice) return null;
    const totalUsdc = listing.priceSubscriptionMonthly * BigInt(months);
    const lamports = usdcRawToLamports(totalUsdc, solPrice.usd, 100);
    return { totalUsdc, lamports, solPriceUsd: solPrice.usd, slippageBps: 100, updatedAt: solPrice.updatedAt, source: solPrice.source };
  }, [listing, exchange, solPrice, months]);

  const handleSubscribeWithSol = useCallback(async () => {
    if (!anchorWallet || !listing || !publicKey || !solQuote) return;
    setTxBusy('subscribeSol');
    try {
      // Provider ATA must exist — commission goes to treasury ATA which is
      // also known fixed.
      const providerAta = getAssociatedTokenAddressSync(USDC_MINT, listing.provider);
      const providerAtaInfo = await connection.getAccountInfo(providerAta);
      if (!providerAtaInfo) {
        setToast({
          tone: 'error',
          title: 'Provider has no USDC account yet',
          body: 'The provider needs to create their USDC associated token account before they can be paid.',
        });
        return;
      }

      // Build the composite tx. Gateway will sanity-check every ix then add
      // its mint-authority signature before submitting.
      const program = marketplaceClient(connection, anchorWallet as any);
      const buyerAta = getAssociatedTokenAddressSync(USDC_MINT, publicKey);
      const buyerAtaInfo = await connection.getAccountInfo(buyerAta);
      const ixs: TransactionInstruction[] = [];

      if (!buyerAtaInfo) {
        ixs.push(
          createAssociatedTokenAccountInstruction(publicKey, buyerAta, publicKey, USDC_MINT)
        );
      }

      ixs.push(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: EXCHANGE_AUTHORITY,
          lamports: Number(solQuote.lamports),
        })
      );
      ixs.push(
        createMintToInstruction(
          USDC_MINT,
          buyerAta,
          EXCHANGE_AUTHORITY,
          Number(solQuote.totalUsdc)
        )
      );

      const subscribeIx = await (program.methods as any)
        .subscribe(months)
        .accountsPartial({
          exchange: exchangePda(),
          listing: listing.pubkey,
          subscription: subscriptionPda(listing.pubkey, publicKey),
          buyerUsdc: buyerAta,
          providerUsdc: providerAta,
          treasuryUsdc: TREASURY_ATA,
          provider: providerPda(listing.provider),
          buyer: publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .instruction();
      ixs.push(subscribeIx);

      const tx = new Transaction();
      tx.add(...ixs);
      tx.feePayer = publicKey;
      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

      // Buyer signs first; gateway's partialSign fills in the mint authority
      // slot. requireAllSignatures:false keeps serialize happy while the
      // authority signature is still missing.
      const signed = await anchorWallet.signTransaction(tx);
      const serialized = signed.serialize({ requireAllSignatures: false }).toString('base64');

      const ack = await payWithSol({
        serializedTx: serialized,
        listing: listing.pubkey.toBase58(),
        buyer: publicKey.toBase58(),
        durationMonths: months,
        solLamports: solQuote.lamports.toString(),
        solPriceUsd: solQuote.solPriceUsd,
        slippageBps: solQuote.slippageBps,
      });

      setToast({
        tone: 'success',
        title: 'Paid in SOL',
        body: `${formatSol(solQuote.lamports)} SOL ≈ ${formatUsdc(fromUsdcRaw(solQuote.totalUsdc))} USDC at $${solQuote.solPriceUsd.toFixed(2)}/SOL.`,
        link: { href: `https://explorer.solana.com/tx/${ack.signature}?cluster=devnet`, label: 'View on Explorer' },
      });
      refresh();
    } catch (err: any) {
      console.error(err);
      setToast({
        tone: 'error',
        title: 'SOL payment failed',
        body: err?.message?.slice(0, 140) || 'Unknown error',
      });
    } finally {
      setTxBusy(null);
    }
  }, [anchorWallet, listing, publicKey, connection, months, solQuote, refresh]);

  const handleIssueKey = useCallback(async () => {
    if (!anchorWallet || !listing || !publicKey || !subscription) return;
    setTxBusy('issueKey');
    try {
      const program = marketplaceClient(connection, anchorWallet as any);
      const rawKey = randomAccessKey();
      const hashBytes = accessKeyHashBytes(rawKey);

      const sig = await (program.methods as any)
        .issueAccessKey(hashBytes)
        .accountsPartial({
          listing: listing.pubkey,
          subscription: subscription.pubkey,
          buyer: publicKey,
        })
        .rpc();
      await connection.confirmTransaction(sig, 'confirmed');

      // Retry gateway registration — tx may not have propagated to the gateway's
      // RPC yet. If all retries fail, the on-chain key is still valid; the user
      // can re-issue from the UI without another on-chain tx.
      let gatewayAck: any = null;
      let gatewayErr: any = null;
      for (let attempt = 0; attempt < 3 && !gatewayAck; attempt++) {
        try {
          if (attempt > 0) await new Promise((r) => setTimeout(r, 1200));
          gatewayAck = await issueAccessKey({
            subscription: subscription.pubkey.toBase58(),
            accessKey: rawKey,
            txSignature: sig,
          });
        } catch (err) {
          gatewayErr = err;
        }
      }

      setAccessKey(rawKey);
      if (gatewayAck) {
        setToast({
          tone: 'success',
          title: 'Access key issued',
          body: `${gatewayAck.queriesLimit} queries unlocked.`,
          link: { href: `https://explorer.solana.com/tx/${sig}?cluster=devnet`, label: 'View on Explorer' },
        });
      } else {
        setToast({
          tone: 'info',
          title: 'Key stored locally',
          body: `On-chain is fine, but the gateway didn't confirm yet: ${gatewayErr?.message?.slice(0, 80) || 'unknown'}. Retry from the sidebar.`,
          link: { href: `https://explorer.solana.com/tx/${sig}?cluster=devnet`, label: 'View on Explorer' },
        });
      }
      refresh();
    } catch (err: any) {
      console.error(err);
      setToast({ tone: 'error', title: 'Access key failed', body: err?.message || 'unknown' });
    } finally {
      setTxBusy(null);
    }
  }, [anchorWallet, listing, publicKey, subscription, connection, refresh]);

  const handleQuery = useCallback(async () => {
    if (!listing || !accessKey) return;
    setTxBusy('query');
    try {
      const result = await authedQuery(listing.pubkey.toBase58(), accessKey, queryType, 5);
      setQueryResult(result);
    } catch (err: any) {
      setToast({ tone: 'error', title: 'Query failed', body: err?.message });
    } finally {
      setTxBusy(null);
    }
  }, [listing, accessKey, queryType]);

  if (!listingPubkey) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-20 text-center">
        <h1 className="font-display text-2xl">Invalid listing address</h1>
        <Link href="/marketplace" className="link-plain text-sm mt-4 inline-block">← Back to marketplace</Link>
      </div>
    );
  }

  if (loading && !listing) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-12">
        <div className="panel h-28 overflow-hidden mb-6 relative"><div className="absolute inset-0 skeleton" /></div>
        <div className="grid md:grid-cols-4 gap-3 mb-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="panel h-20 overflow-hidden relative"><div className="absolute inset-0 skeleton" /></div>
          ))}
        </div>
      </div>
    );
  }

  if (notFound || !listing || !meta || !quality) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-20 text-center">
        <h1 className="font-display text-2xl">Listing not found</h1>
        <p className="mt-2 text-ink-muted">This address doesn't resolve to an active listing.</p>
        <Link href="/marketplace" className="link-plain text-sm mt-4 inline-block">← Back to marketplace</Link>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <Link href="/marketplace" className="text-xs text-ink-soft hover:text-ink transition-colors group inline-flex items-center gap-1">
        <span className="inline-block transition-transform duration-300 group-hover:-translate-x-1">←</span> Marketplace
      </Link>

      {/* Header */}
      <header className="mt-3 flex flex-col md:flex-row md:items-start md:justify-between gap-4 animate-fadeUp">
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`chip ${meta.tag}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`}></span>
              {meta.label}
            </span>
            {!listing.isActive && <span className="chip bg-danger/10 text-danger">paused</span>}
            {listing.qualityUpdatedAt > 0 && (
              <span className="chip bg-earth-100 text-ink-muted">
                oracle {relativeTime(listing.qualityUpdatedAt)}
              </span>
            )}
            {sourceInfo?.bound ? (
              <span className="chip bg-forest-soft text-forest-dark" title={sourceInfo.url}>
                <span className="h-1.5 w-1.5 rounded-full bg-forest" />
                live upstream
              </span>
            ) : sourceInfo !== null ? (
              <span className="chip bg-earth-100 text-ink-muted">demo samples</span>
            ) : null}
          </div>
          <h1 className="mt-3 font-display text-[32px] md:text-[40px] tracking-ultra leading-tight">
            {listing.title}
          </h1>
          <p className="mt-2 text-ink-muted max-w-2xl leading-relaxed">{listing.description}</p>
          <div className="mt-3 text-xs text-ink-soft font-mono">
            provider · {shortAddress(listing.provider.toBase58(), 6)} · {providerAccount?.name || 'unnamed'}
          </div>
        </div>

        <a
          href={`https://explorer.solana.com/address/${listing.pubkey.toBase58()}?cluster=devnet`}
          target="_blank"
          rel="noreferrer"
          className="btn-ghost border border-earth-200 text-xs hover:border-forest/30 inline-flex items-center gap-1 group"
        >
          On Explorer <span className="transition-transform duration-300 group-hover:translate-x-0.5">↗</span>
        </a>
      </header>

      {/* Stats */}
      <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-3 animate-fadeUp" style={{ animationDelay: '140ms' }}>
        <StatTile
          label="Subscription"
          value={<><CountUp value={fromUsdcRaw(listing.priceSubscriptionMonthly)} decimals={2} /> USDC</>}
          hint="per month"
          tone="forest"
        />
        <StatTile
          label="Per query"
          value={<><CountUp value={fromUsdcRaw(listing.pricePerQuery)} decimals={4} /> USDC</>}
          hint={`commission ${exchange ? (exchange.commissionBps / 100).toFixed(2) : '—'}%`}
        />
        <StatTile
          label="Quality"
          value={listing.qualityScore > 0 ? <><CountUp value={listing.qualityScore} />%</> : '—'}
          hint={quality.label}
          tone={quality.tone === 'good' ? 'forest' : quality.tone === 'warn' ? 'sunflower' : 'clay'}
        />
        <StatTile
          label="Queries served"
          value={<CountUp value={Number(listing.totalQueries)} />}
          hint={`snapshot #${listing.snapshotIndex}`}
        />
      </div>

      <div className="mt-10 grid md:grid-cols-[1.6fr_1fr] gap-6">
        <div className="space-y-6">
          <Reveal>
            <section className="panel p-6 relative overflow-hidden">
              <div
                aria-hidden
                className="absolute -top-12 -right-12 h-36 w-36 rounded-full blur-2xl opacity-40"
                style={{ background: meta.accent + '30' }}
              />
              <div className="relative flex items-center justify-between mb-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.16em] text-ink-soft">Preview row</div>
                  <div className="font-display text-lg mt-1">What you'll get</div>
                </div>
                <span className="text-[11px] text-ink-soft">free, no wallet needed</span>
              </div>
              {preview ? (
                <pre className="relative font-mono text-xs bg-parchment rounded-lg p-4 overflow-x-auto leading-relaxed">
                  {JSON.stringify(preview.sample?.[0] ?? preview, null, 2)}
                </pre>
              ) : (
                <div className="text-sm text-ink-soft">Preview unavailable — gateway offline?</div>
              )}
              {proof && (
                <div className="mt-4 text-[11px] text-ink-soft font-mono">
                  snapshot root · {proof.root?.slice(0, 20)}… · {proof.proof?.length || 0}-step Merkle proof ready for on-chain verify_sample.
                </div>
              )}
            </section>
          </Reveal>

          {accessKey && (
            <Reveal>
              <section className="panel p-6">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="text-xs uppercase tracking-[0.16em] text-ink-soft">Live data</div>
                    <div className="font-display text-lg mt-1">Call the gateway</div>
                  </div>
                  <div className="text-[11px] text-ink-soft font-mono truncate max-w-[160px]">
                    key · {accessKey.slice(0, 8)}…{accessKey.slice(-4)}
                  </div>
                </div>
                <div className="flex items-center gap-2 mb-3">
                  <select
                    value={queryType}
                    onChange={(e) => setQueryType(e.target.value)}
                    className="border border-earth-200 rounded-md px-3 py-1.5 text-sm bg-parchment/60 hover:border-forest/30 transition-colors"
                  >
                    <option value="gps">GPS</option>
                    <option value="weather">Weather</option>
                    <option value="network">Network</option>
                    <option value="camera">Camera</option>
                  </select>
                  <button onClick={handleQuery} disabled={txBusy !== null} className="btn-primary text-xs">
                    {txBusy === 'query' ? 'Fetching…' : <>Fetch 5 rows <span className="arrow">→</span></>}
                  </button>
                </div>
                {queryResult && (
                  <pre className="font-mono text-xs bg-parchment rounded-lg p-4 overflow-x-auto leading-relaxed max-h-[320px] animate-fadeUp">
                    {JSON.stringify(queryResult, null, 2)}
                  </pre>
                )}
              </section>
            </Reveal>
          )}

          {accessKey && listing && (
            <Reveal>
              <UsageSnippets
                listingPubkey={listing.pubkey.toBase58()}
                dataType={listing.dataType}
                accessKey={accessKey}
              />
            </Reveal>
          )}

          <Reveal>
            <section className="panel p-6">
              <div className="text-xs uppercase tracking-[0.16em] text-ink-soft">On-chain pointers</div>
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono">
                <RefRow label="Listing" value={listing.pubkey.toBase58()} />
                <RefRow label="Provider" value={listing.provider.toBase58()} />
                <RefRow label="Snapshot root" value={bytesToHex(listing.snapshotRoot)} />
                <RefRow
                  label="Last quality push"
                  value={listing.qualityUpdatedAt > 0
                    ? new Date(listing.qualityUpdatedAt * 1000).toISOString()
                    : 'never'}
                />
              </div>
            </section>
          </Reveal>
        </div>

        <aside className="space-y-4">
          <Reveal delay={80}>
            <section className="panel p-6 relative overflow-hidden">
              <div aria-hidden className="absolute inset-x-0 -top-10 h-28 bg-gradient-to-b from-forest/10 to-transparent blur-2xl" />
              {!publicKey ? (
                <>
                  <div className="relative font-display text-lg">Connect to subscribe</div>
                  <p className="relative mt-1 text-sm text-ink-muted">
                    Phantom or Solflare works. You'll need mock USDC on devnet to pay for the subscription.
                  </p>
                </>
              ) : subscription ? (
                <>
                  <div className="relative flex items-center justify-between">
                    <span className="pill bg-forest-soft text-forest-dark">
                      <span className="pulse-dot" />
                      Subscribed
                    </span>
                    <span className="text-[11px] text-ink-soft tabular">{relativeTime(subscription.expiresAt)}</span>
                  </div>
                  <div className="relative mt-4">
                    <div className="text-xs text-ink-soft uppercase tracking-wide">Queries used</div>
                    <div className="font-mono text-sm mt-1 tabular">
                      {subscription.queriesUsed.toLocaleString()} / {subscription.queriesLimit.toLocaleString()}
                    </div>
                    <div className="w-full mt-2 h-1.5 rounded-full bg-earth-100 overflow-hidden">
                      <div
                        className="h-full bg-forest progress-fill"
                        style={{
                          width: `${Math.min(100, (subscription.queriesUsed / Math.max(1, subscription.queriesLimit)) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                  <div className="relative mt-5 border-t border-earth-100 pt-4">
                    <div className="text-sm font-medium">Access key</div>
                    <p className="text-xs text-ink-muted mt-1 leading-relaxed">
                      Sign once, then call the gateway with a simple Bearer token. Your key is
                      hashed on-chain — never stored in plaintext server-side.
                    </p>
                    {subscription.accessKeyActive && !accessKey && (
                      <p className="mt-2 text-xs text-sunflower">
                        An access key is active on-chain but not loaded in this browser. Re-issue to resume.
                      </p>
                    )}
                    <button
                      onClick={handleIssueKey}
                      disabled={txBusy !== null}
                      className="btn-secondary text-xs mt-3 w-full justify-center"
                    >
                      {txBusy === 'issueKey'
                        ? 'Issuing…'
                        : subscription.accessKeyActive
                        ? 'Re-issue access key'
                        : 'Issue access key'}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="relative font-display text-lg">Subscribe</div>
                  <p className="relative mt-1 text-sm text-ink-muted">
                    Monthly USDC subscription. 1,000 queries included per month.
                  </p>

                  <div className="relative mt-4 grid grid-cols-4 gap-1">
                    {MONTH_OPTIONS.map((m) => (
                      <button
                        key={m}
                        onClick={() => setMonths(m)}
                        className={`py-2 text-sm rounded-md border transition-all duration-200 ${
                          months === m
                            ? 'bg-ink text-cream border-ink shadow-card -translate-y-0.5'
                            : 'bg-parchment border-earth-200 text-ink-muted hover:text-ink hover:-translate-y-0.5 hover:border-ink/30'
                        }`}
                      >
                        {m}mo
                      </button>
                    ))}
                  </div>

                  {pricing && (
                    <div className="relative mt-4 text-xs font-mono text-ink-muted space-y-1">
                      <div className="flex justify-between">
                        <span>total</span>
                        <span className="text-ink tabular">{formatUsdc(fromUsdcRaw(pricing.total))} USDC</span>
                      </div>
                      <div className="flex justify-between">
                        <span>provider</span>
                        <span className="tabular">{formatUsdc(fromUsdcRaw(pricing.providerShare))} USDC</span>
                      </div>
                      <div className="flex justify-between">
                        <span>commission</span>
                        <span className="tabular">{formatUsdc(fromUsdcRaw(pricing.commission))} USDC</span>
                      </div>
                    </div>
                  )}

                  <button
                    onClick={handleSubscribe}
                    disabled={txBusy !== null}
                    className="btn-primary w-full mt-4 justify-center"
                  >
                    {txBusy === 'subscribe' ? 'Signing…' : <>Pay & subscribe for {months}mo <span className="arrow">→</span></>}
                  </button>

                  {/* Pay-with-SOL alternative — gateway co-signs a tx that
                      bundles SystemTransfer(SOL) + MintTo(USDC) + subscribe,
                      so the buyer never needs to hold mock USDC. */}
                  <div className="relative mt-4 border-t border-earth-100 pt-4">
                    <div className="flex items-center justify-between text-[11px] text-ink-soft">
                      <span className="uppercase tracking-wide">Pay in SOL</span>
                      <button
                        type="button"
                        onClick={refreshSolPrice}
                        className="font-mono hover:text-ink transition-colors"
                        title="Refresh SOL/USD"
                      >
                        {solPrice ? `$${solPrice.usd.toFixed(2)}` : '…'} / SOL
                        {solPrice?.source === 'stale' && <span className="ml-1 text-clay">stale</span>}
                        {!solPrice && <span className="ml-1 text-clay">offline</span>}
                      </button>
                    </div>
                    {solQuote ? (
                      <div className="mt-1 flex items-baseline justify-between mono text-[12px]">
                        <span className="text-ink tabular">{formatSol(solQuote.lamports)} SOL</span>
                        <span className="text-ink-soft">≈ {formatUsdc(fromUsdcRaw(solQuote.totalUsdc))} USDC</span>
                      </div>
                    ) : (
                      <div className="mt-1 text-[12px] text-ink-soft">fetching live quote…</div>
                    )}
                    <button
                      onClick={handleSubscribeWithSol}
                      disabled={txBusy !== null || !solQuote}
                      className="btn-secondary w-full mt-3 justify-center"
                    >
                      {txBusy === 'subscribeSol' ? 'Paying in SOL…' : <>Pay {solQuote ? `${formatSol(solQuote.lamports, 4)} SOL` : '…'} <span className="arrow">◎</span></>}
                    </button>
                    <p className="mt-2 text-[10.5px] text-ink-soft leading-relaxed">
                      One click: signs a bundle of SOL transfer + USDC mint-to + subscribe. Rate from CoinGecko, 1% slippage buffer, gateway co-signs the mint step.
                    </p>
                  </div>

                  <p className="relative mt-3 text-[11px] text-ink-soft leading-relaxed">
                    Prefer USDC? Ask the exchange authority (
                    <a
                      className="link-plain"
                      href={`https://explorer.solana.com/address/${EXCHANGE_AUTHORITY.toBase58()}?cluster=devnet`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {shortAddress(EXCHANGE_AUTHORITY.toBase58(), 4)}
                    </a>
                    ) — the mint is mock, freely issued on request.
                  </p>
                </>
              )}
            </section>
          </Reveal>

          <Reveal delay={160}>
            <section className="panel p-6">
              <div className="text-xs uppercase tracking-[0.16em] text-ink-soft">Quality oracle</div>
              <div className="mt-2 font-display text-lg tabular">
                {listing.qualityScore > 0 ? <><CountUp value={listing.qualityScore} />%</> : '—'}
              </div>
              <div className="text-sm text-ink-muted">{quality.label}</div>
              <p className="mt-2 text-xs text-ink-soft leading-relaxed">
                Scored every 30 min by <span className="font-mono">{shortAddress(exchange?.qualityOracle?.toBase58(), 5)}</span>.
                Providers below {exchange?.slashThreshold ?? 30}% for over{' '}
                {exchange ? Math.floor(exchange.slashGracePeriod / 3600) : 168}h become slashable.
              </p>
              {providerAccount?.lowQualitySince && providerAccount.lowQualitySince > 0 && (
                <p className="mt-2 text-xs text-danger">
                  Provider is below threshold since {relativeTime(providerAccount.lowQualitySince)}.
                </p>
              )}
            </section>
          </Reveal>
        </aside>
      </div>

      <Toast message={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}

type SnippetLang = 'curl' | 'js' | 'python';

function UsageSnippets({
  listingPubkey,
  dataType,
  accessKey,
}: {
  listingPubkey: string;
  dataType: string;
  accessKey: string;
}) {
  const [lang, setLang] = useState<SnippetLang>('curl');
  const [copied, setCopied] = useState<string | null>(null);

  const gatewayBase =
    typeof window === 'undefined' ? 'http://localhost:4001' : `${window.location.origin}/api`;
  const dataTypeLower = dataType.toLowerCase();

  const snippets: Record<SnippetLang, string> = {
    curl: `curl -X POST ${gatewayBase}/v1/query/${listingPubkey} \\
  -H "Authorization: Bearer ${accessKey}" \\
  -H "Content-Type: application/json" \\
  -d '{"dataType":"${dataTypeLower}","limit":5}'`,
    js: `const r = await fetch(
  '${gatewayBase}/v1/query/${listingPubkey}',
  {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ${accessKey}',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ dataType: '${dataTypeLower}', limit: 5 }),
  },
);
const data = await r.json();
console.log(data.rows);`,
    python: `import httpx

r = httpx.post(
    "${gatewayBase}/v1/query/${listingPubkey}",
    headers={"Authorization": "Bearer ${accessKey}"},
    json={"dataType": "${dataTypeLower}", "limit": 5},
)
print(r.json()["rows"])`,
  };

  const copy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied((c) => (c === id ? null : c)), 1400);
    } catch {
      /* clipboard not available */
    }
  };

  return (
    <section className="panel p-6">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <div className="text-xs uppercase tracking-[0.16em] text-ink-soft">How to pull data</div>
          <div className="font-display text-lg mt-1">Drop in and go</div>
        </div>
        <div className="flex items-center gap-0.5 bg-parchment/70 rounded-md p-0.5">
          {(['curl', 'js', 'python'] as SnippetLang[]).map((l) => (
            <button
              key={l}
              onClick={() => setLang(l)}
              className={`px-2.5 py-1 text-[11px] font-medium rounded transition-all ${
                lang === l ? 'bg-ink text-cream' : 'text-ink-muted hover:text-ink'
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      <p className="text-[13px] text-ink-muted leading-relaxed mb-3">
        Your access key behaves like an API token. Send it as a{' '}
        <code className="font-mono text-[12px] bg-earth-50 px-1 py-0.5 rounded">Authorization: Bearer …</code>{' '}
        header and the gateway streams rows without another wallet signature.
      </p>

      <div className="relative group">
        <pre className="font-mono text-[12px] bg-ink text-cream rounded-lg p-4 pr-12 overflow-x-auto leading-relaxed whitespace-pre">
          {snippets[lang]}
        </pre>
        <button
          onClick={() => copy('snippet', snippets[lang])}
          className="absolute top-3 right-3 px-2 py-1 text-[10px] uppercase tracking-widest bg-cream/10 text-cream/80 hover:bg-cream hover:text-ink rounded transition-all"
        >
          {copied === 'snippet' ? 'copied' : 'copy'}
        </button>
      </div>

      <div className="mt-4 grid sm:grid-cols-2 gap-3 text-[12px]">
        <InfoRow
          label="Bearer token"
          value={accessKey}
          onCopy={() => copy('key', accessKey)}
          copied={copied === 'key'}
        />
        <InfoRow
          label="Listing id"
          value={listingPubkey}
          onCopy={() => copy('id', listingPubkey)}
          copied={copied === 'id'}
        />
      </div>

      <ul className="mt-4 space-y-1.5 text-[12px] text-ink-muted">
        <li>
          <span className="inline-block w-4 text-forest">•</span>
          <code className="font-mono text-[11px]">limit</code> accepts 1–5 rows per call.
        </li>
        <li>
          <span className="inline-block w-4 text-forest">•</span>
          1 000 queries/month are baked into each subscription.
        </li>
        <li>
          <span className="inline-block w-4 text-forest">•</span>
          Lost the key? Hit <em>Re-issue access key</em> on the right — only costs a signature.
        </li>
      </ul>
    </section>
  );
}

function InfoRow({
  label,
  value,
  onCopy,
  copied,
}: {
  label: string;
  value: string;
  onCopy: () => void;
  copied: boolean;
}) {
  return (
    <div className="bg-parchment rounded-md px-3 py-2 flex items-center justify-between gap-2">
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-ink-soft">{label}</div>
        <div className="font-mono text-[11px] text-ink truncate">{value}</div>
      </div>
      <button
        onClick={onCopy}
        className="text-[10px] uppercase tracking-wider text-ink-soft hover:text-forest transition-colors shrink-0"
      >
        {copied ? 'copied' : 'copy'}
      </button>
    </div>
  );
}

function RefRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 bg-parchment rounded-md px-3 py-2 hover:bg-parchment/80 transition-colors">
      <span className="text-ink-soft text-[10px] uppercase tracking-wider">{label}</span>
      <span className="text-ink truncate text-right">{value}</span>
    </div>
  );
}
