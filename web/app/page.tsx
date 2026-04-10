'use client';

import { useState } from 'react';
import Link from 'next/link';

interface DataListing {
  id: string;
  name: string;
  dataType: string;
  provider: string;
  pricePerQuery: number;
  subscriptionPrice: number;
  qualityScore: number;
  totalQueries: number;
  region: string;
  description: string;
}

const LISTINGS: DataListing[] = [
  { id: '1', name: 'NYC GPS Fleet Data', dataType: 'GPS', provider: 'MetroFleet', pricePerQuery: 0.002, subscriptionPrice: 5.0, qualityScore: 94, totalQueries: 45200, region: 'New York, US', description: 'Real-time GPS coordinates from 500+ delivery vehicles across Manhattan and Brooklyn' },
  { id: '2', name: 'Berlin Weather Stations', dataType: 'Weather', provider: 'WeatherNet DE', pricePerQuery: 0.001, subscriptionPrice: 3.0, qualityScore: 98, totalQueries: 128400, region: 'Berlin, DE', description: 'Temperature, humidity, pressure, and wind data from 23 IoT weather stations' },
  { id: '3', name: 'Helium Hotspot Network', dataType: 'Network', provider: 'HeliumWatch', pricePerQuery: 0.003, subscriptionPrice: 8.0, qualityScore: 87, totalQueries: 12800, region: 'Global', description: 'Coverage maps, uptime stats, and reward data from 15K+ Helium hotspots' },
  { id: '4', name: 'Tokyo Air Quality', dataType: 'Weather', provider: 'AirJP', pricePerQuery: 0.002, subscriptionPrice: 4.0, qualityScore: 91, totalQueries: 67300, region: 'Tokyo, JP', description: 'PM2.5, PM10, NO2, and O3 readings from 40 monitoring stations across Tokyo metro' },
  { id: '5', name: 'Hivemapper Dashcam Feed', dataType: 'Camera', provider: 'MapDrive', pricePerQuery: 0.005, subscriptionPrice: 12.0, qualityScore: 82, totalQueries: 8900, region: 'US West Coast', description: 'Geo-tagged road imagery with lane markings, signage, and POI detection' },
  { id: '6', name: 'EU Logistics Tracking', dataType: 'GPS', provider: 'FreightLink', pricePerQuery: 0.004, subscriptionPrice: 10.0, qualityScore: 96, totalQueries: 34100, region: 'EU', description: 'Container tracking data from 200+ freight routes across European corridors' },
];

const DATA_TYPES = ['All', 'GPS', 'Weather', 'Network', 'Camera'];

export default function MarketplacePage() {
  const [typeFilter, setTypeFilter] = useState('All');
  const [search, setSearch] = useState('');

  const filtered = LISTINGS.filter((l) => {
    const matchType = typeFilter === 'All' || l.dataType === typeFilter;
    const matchSearch = !search || l.name.toLowerCase().includes(search.toLowerCase()) || l.description.toLowerCase().includes(search.toLowerCase());
    return matchType && matchSearch;
  });

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold mb-1">Data Marketplace</h1>
        <p className="text-earth-400 text-sm">Browse and subscribe to verified IoT and DePIN data streams</p>
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
        {filtered.map((listing) => (
          <Link
            key={listing.id}
            href={`/listing/${listing.id}`}
            className="bg-white border border-earth-200 rounded-xl p-5 hover:border-forest/30 hover:shadow-sm transition-all group"
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
              <span className="text-xs text-earth-300">{listing.region}</span>
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
