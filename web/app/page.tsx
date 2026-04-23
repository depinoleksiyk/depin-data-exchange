'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useConnection, useAnchorWallet } from '@solana/wallet-adapter-react';
import { getMarketplace } from './lib/useProgram';
import { PROGRAM_ID } from './lib/constants';

interface DataListing {
  id: string;
  pubkey: string;
  name: string;
  dataType: string;
  provider: string;
  providerPubkey: string;
  pricePerQuery: number;
  subscriptionPrice: number;
  qualityScore: number;
  totalQueries: number;
  description: string;
  isActive: boolean;
  fromChain: boolean;
}

const DATA_TYPE_MAP: Record<number, string> = { 0: 'GPS', 1: 'Weather', 2: 'Network', 3: 'Camera' };

const DEMO_LISTINGS: DataListing[] = [
  { id: '1', pubkey: '', name: 'NYC GPS Fleet Data', dataType: 'GPS', provider: 'MetroFleet', providerPubkey: '', pricePerQuery: 0.002, subscriptionPrice: 5.0, qualityScore: 94, totalQueries: 45200, description: 'Real-time GPS from 500+ delivery vehicles across Manhattan and Brooklyn', isActive: true, fromChain: false },
  { id: '2', pubkey: '', name: 'Berlin Weather Stations', dataType: 'Weather', provider: 'WeatherNet DE', providerPubkey: '', pricePerQuery: 0.001, subscriptionPrice: 3.0, qualityScore: 98, totalQueries: 128400, description: 'Temperature, humidity, pressure from 23 IoT weather stations', isActive: true, fromChain: false },
  { id: '3', pubkey: '', name: 'Helium Hotspot Network', dataType: 'Network', provider: 'HeliumWatch', providerPubkey: '', pricePerQuery: 0.003, subscriptionPrice: 8.0, qualityScore: 87, totalQueries: 12800, description: 'Coverage maps and uptime stats from 15K+ Helium hotspots', isActive: true, fromChain: false },
  { id: '4', pubkey: '', name: 'Tokyo Air Quality', dataType: 'Weather', provider: 'AirJP', providerPubkey: '', pricePerQuery: 0.002, subscriptionPrice: 4.0, qualityScore: 91, totalQueries: 67300, description: 'PM2.5, PM10, NO2 readings from 40 monitoring stations', isActive: true, fromChain: false },
  { id: '5', pubkey: '', name: 'Hivemapper Dashcam Feed', dataType: 'Camera', provider: 'MapDrive', providerPubkey: '', pricePerQuery: 0.005, subscriptionPrice: 12.0, qualityScore: 82, totalQueries: 8900, description: 'Geo-tagged road imagery with lane markings and signage', isActive: true, fromChain: false },
  { id: '6', pubkey: '', name: 'EU Logistics Tracking', dataType: 'GPS', provider: 'FreightLink', providerPubkey: '', pricePerQuery: 0.004, subscriptionPrice: 10.0, qualityScore: 96, totalQueries: 34100, description: 'Container tracking from 200+ freight routes across EU', isActive: true, fromChain: false },
];

const DATA_TYPES = ['All', 'GPS', 'Weather', 'Network', 'Camera'];

export default function MarketplacePage() {
  const { connection } = useConnection();
  const anchorWallet = useAnchorWallet();
  const program = getMarketplace(connection);
  const [listings, setListings] = useState<DataListing[]>(DEMO_LISTINGS);
  const [typeFilter, setTypeFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [chainLoaded, setChainLoaded] = useState(false);

  const fetchListings = useCallback(async () => {
    if (!program) return;
    try {
      const accounts = await connection.getProgramAccounts(PROGRAM_ID);

      if (accounts.length === 0) return;

      const chainListings: DataListing[] = [];
      for (const { pubkey, account } of accounts) {
        try {
          const decoded = (program.coder.accounts as any).decode('dataListing', account.data);
          const dtIdx = decoded.dataType.gps ? 0 : decoded.dataType.weather ? 1 : decoded.dataType.network ? 2 : 3;
          chainListings.push({
            id: decoded.listingId.toString(),
            pubkey: pubkey.toBase58(),
            name: decoded.title,
            dataType: DATA_TYPE_MAP[dtIdx] || 'GPS',
            provider: decoded.provider.toBase58().slice(0, 8) + '...',
            providerPubkey: decoded.provider.toBase58(),
            pricePerQuery: Number(decoded.pricePerQuery) / 1_000_000,
            subscriptionPrice: Number(decoded.priceSubscriptionMonthly) / 1_000_000,
            qualityScore: decoded.qualityScore,
            totalQueries: Number(decoded.totalQueries),
            description: decoded.description,
            isActive: decoded.isActive,
            fromChain: true,
          });
        } catch { /* skip malformed */ }
      }

      if (chainListings.length > 0) {
        setListings([...chainListings, ...DEMO_LISTINGS]);
        setChainLoaded(true);
      }
    } catch (err) {
      console.error(err);
    }
  }, [program, connection]);

  useEffect(() => { fetchListings(); }, [fetchListings]);

  const filtered = listings.filter((l) => {
    const matchType = typeFilter === 'All' || l.dataType === typeFilter;
    const matchSearch = !search || l.name.toLowerCase().includes(search.toLowerCase()) || l.description.toLowerCase().includes(search.toLowerCase());
    return matchType && matchSearch;
  });

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold mb-1">Data Marketplace</h1>
        <p className="text-earth-400 text-sm">
          Browse and subscribe to verified IoT and DePIN data streams
          {chainLoaded && <span className="ml-2 text-forest text-xs font-medium">LIVE</span>}
        </p>
      </div>

      <div className="flex gap-4 mb-6">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search data streams..."
          className="flex-1 bg-white border border-earth-200 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-forest"
        />
        <div className="flex gap-1">
          {DATA_TYPES.map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`px-3 py-2 text-sm rounded-lg transition-colors ${
                typeFilter === t ? 'bg-forest text-white' : 'bg-white text-earth-400 hover:bg-earth-100 border border-earth-200'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((listing, idx) => (
          <Link
            key={listing.pubkey || idx}
            href={`/listing/${listing.id}`}
            className="bg-white border border-earth-200 rounded-xl p-5 hover:border-forest/30 hover:shadow-sm transition-all group block"
          >
            <div className="flex items-start justify-between mb-3">
              <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                listing.dataType === 'GPS' ? 'bg-blue-50 text-blue-600' :
                listing.dataType === 'Weather' ? 'bg-amber-50 text-amber-600' :
                listing.dataType === 'Network' ? 'bg-purple-50 text-purple-600' :
                'bg-green-50 text-green-600'
              }`}>
                {listing.dataType}
              </span>
              <div className="flex items-center gap-1">
                {listing.fromChain && <span className="text-[10px] text-forest bg-green-50 px-1.5 py-0.5 rounded">on-chain</span>}
              </div>
            </div>
            <h3 className="font-semibold mb-1 group-hover:text-forest transition-colors">{listing.name}</h3>
            <p className="text-sm text-earth-400 leading-relaxed mb-4">{listing.description}</p>
            <div className="flex items-center justify-between text-xs text-earth-300">
              <span>{listing.pricePerQuery} USDC/query</span>
              <span className="flex items-center gap-1">
                Quality: <span className={`font-semibold ${listing.qualityScore >= 90 ? 'text-forest' : 'text-amber-600'}`}>{listing.qualityScore}%</span>
              </span>
            </div>
            <div className="mt-2 text-xs text-earth-300">
              {listing.totalQueries.toLocaleString()} queries &middot; by {listing.provider}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
