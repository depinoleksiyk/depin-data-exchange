'use client';

import { useState, useEffect, useCallback } from 'react';
import { useWallet, useConnection, useAnchorWallet } from '@solana/wallet-adapter-react';
import { SystemProgram } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import { getMarketplace, getExchangePDA, getProviderPDA, getListingPDA } from '../lib/useProgram';
import { PROGRAM_ID } from '../lib/constants';

export default function ProviderPage() {
  const { publicKey } = useWallet();
  const { connection } = useConnection();
  const anchorWallet = useAnchorWallet();
  const program = anchorWallet ? getMarketplace(connection, anchorWallet) : null;
  const readonlyProgram = getMarketplace(connection);

  const [providerRegistered, setProviderRegistered] = useState(false);
  const [providerName, setProviderName] = useState('');
  const [regName, setRegName] = useState('');

  const [name, setName] = useState('');
  const [dataType, setDataType] = useState('GPS');
  const [price, setPrice] = useState('0.002');
  const [description, setDescription] = useState('');

  const [txState, setTxState] = useState<'idle' | 'signing' | 'done' | 'error'>('idle');
  const [txMsg, setTxMsg] = useState('');
  const [myListings, setMyListings] = useState<any[]>([]);

  const checkProvider = useCallback(async () => {
    if (!publicKey || !readonlyProgram) return;
    try {
      const pda = getProviderPDA(publicKey);
      const acc = await (readonlyProgram.account as any).dataProvider.fetch(pda);
      setProviderRegistered(true);
      setProviderName(acc.name);
    } catch {
      setProviderRegistered(false);
    }
  }, [publicKey, readonlyProgram]);

  const fetchMyListings = useCallback(async () => {
    if (!publicKey || !readonlyProgram) return;
    try {
      const accounts = await connection.getProgramAccounts(PROGRAM_ID, {
        filters: [
          { memcmp: { offset: 8, bytes: publicKey.toBase58() } },
        ],
      });
      const parsed = [];
      for (const { pubkey, account } of accounts) {
        try {
          const d = (readonlyProgram.coder.accounts as any).decode('dataListing', account.data);
          parsed.push({ pubkey: pubkey.toBase58(), title: d.title, dataType: d.dataType, pricePerQuery: Number(d.pricePerQuery) / 1e6, totalQueries: Number(d.totalQueries) });
        } catch { /* not a listing */ }
      }
      setMyListings(parsed);
    } catch {}
  }, [publicKey, readonlyProgram, connection]);

  useEffect(() => { checkProvider(); fetchMyListings(); }, [checkProvider, fetchMyListings]);

  const handleRegister = async () => {
    if (!program || !publicKey || !regName) return;
    setTxState('signing');
    setTxMsg('');
    try {
      const tx = await (program.methods as any)
        .registerProvider(regName)
        .accountsPartial({
          exchange: getExchangePDA(),
          provider: getProviderPDA(publicKey),
          wallet: publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      setTxState('done');
      setTxMsg(`Registered! tx: ${tx.slice(0, 16)}...`);
      checkProvider();
    } catch (err: any) {
      setTxState('error');
      setTxMsg(err?.message?.includes('User rejected') ? 'Rejected' : (err?.message?.slice(0, 80) || 'Failed'));
    }
  };

  const handleCreateListing = async () => {
    if (!program || !publicKey || !name) return;
    setTxState('signing');
    setTxMsg('');
    try {
      const listingId = Date.now();
      const dtArg = dataType === 'GPS' ? { gps: {} } : dataType === 'Weather' ? { weather: {} } : dataType === 'Network' ? { network: {} } : { camera: {} };
      const priceVal = Math.floor(parseFloat(price) * 1_000_000);

      const tx = await (program.methods as any)
        .createListing(
          new BN(listingId),
          dtArg,
          name,
          description || `${dataType} data stream`,
          new BN(priceVal),
          new BN(priceVal * 500),
        )
        .accountsPartial({
          exchange: getExchangePDA(),
          listing: getListingPDA(publicKey, listingId),
          provider: getProviderPDA(publicKey),
          wallet: publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      setTxState('done');
      setTxMsg(`Listing created! tx: ${tx.slice(0, 16)}...`);
      setName('');
      setDescription('');
      fetchMyListings();
    } catch (err: any) {
      setTxState('error');
      setTxMsg(err?.message?.includes('User rejected') ? 'Rejected' : (err?.message?.slice(0, 80) || 'Failed'));
    }
  };

  if (!publicKey) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold mb-2">Provider Dashboard</h1>
        <p className="text-earth-400 text-sm">Connect wallet to manage your data listings.</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      <h1 className="text-2xl font-bold mb-2">Provider Dashboard</h1>
      <p className="text-earth-400 text-sm mb-8">
        {providerRegistered
          ? <>Registered as <span className="text-forest font-medium">{providerName}</span></>
          : 'Register as a data provider to start listing streams.'}
      </p>

      {!providerRegistered && (
        <div className="bg-white border border-earth-200 rounded-xl p-6 mb-6">
          <h2 className="font-semibold mb-4">Register as Provider</h2>
          <div className="flex gap-3">
            <input value={regName} onChange={(e) => setRegName(e.target.value)} placeholder="Your provider name" className="flex-1 bg-cream border border-earth-200 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-forest" />
            <button onClick={handleRegister} disabled={txState === 'signing'} className="bg-forest text-white font-medium px-6 py-2.5 rounded-lg hover:bg-forest-light text-sm disabled:opacity-40">
              {txState === 'signing' ? 'Signing...' : 'Register'}
            </button>
          </div>
        </div>
      )}

      {txMsg && (
        <div className={`text-sm rounded-lg p-3 mb-4 ${txState === 'done' ? 'bg-green-50 text-forest' : 'bg-red-50 text-red-600'}`}>
          {txMsg}
        </div>
      )}

      <div className="bg-white border border-earth-200 rounded-xl p-6 mb-6">
        <h2 className="font-semibold mb-4">Your Listings {myListings.length > 0 && `(${myListings.length})`}</h2>
        {myListings.length === 0 ? (
          <div className="text-sm text-earth-300 text-center py-8">No data streams listed yet.</div>
        ) : (
          <div className="space-y-3">
            {myListings.map((l) => (
              <div key={l.pubkey} className="flex items-center justify-between border border-earth-200 rounded-lg p-3">
                <div>
                  <span className="font-medium text-sm">{l.title}</span>
                  <span className="text-xs text-earth-300 ml-2">{l.pricePerQuery} USDC/q</span>
                </div>
                <span className="text-xs text-earth-300">{l.totalQueries} queries</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {providerRegistered && (
        <div className="bg-white border border-earth-200 rounded-xl p-6">
          <h2 className="font-semibold mb-4">Create Listing</h2>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-earth-500 mb-1 block">Stream Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="My IoT Data Stream" className="w-full bg-cream border border-earth-200 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-forest" />
            </div>
            <div>
              <label className="text-sm font-medium text-earth-500 mb-1 block">Description</label>
              <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Data stream description..." className="w-full bg-cream border border-earth-200 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-forest" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-earth-500 mb-1 block">Data Type</label>
                <select value={dataType} onChange={(e) => setDataType(e.target.value)} className="w-full bg-cream border border-earth-200 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-forest">
                  <option>GPS</option><option>Weather</option><option>Network</option><option>Camera</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-earth-500 mb-1 block">Price per Query (USDC)</label>
                <input value={price} onChange={(e) => setPrice(e.target.value)} type="number" step="0.001" className="w-full bg-cream border border-earth-200 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-forest" />
              </div>
            </div>
            <button onClick={handleCreateListing} disabled={txState === 'signing' || !name} className="w-full bg-forest text-white font-medium py-3 rounded-lg hover:bg-forest-light text-sm disabled:opacity-40">
              {txState === 'signing' ? 'Signing...' : 'Create Listing'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
