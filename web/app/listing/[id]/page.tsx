'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

const LISTINGS: Record<string, { name: string; dataType: string; provider: string; pricePerQuery: number; subscriptionPrice: number; qualityScore: number; totalQueries: number; region: string; description: string; fields: string[] }> = {
  '1': { name: 'NYC GPS Fleet Data', dataType: 'GPS', provider: 'MetroFleet', pricePerQuery: 0.002, subscriptionPrice: 5.0, qualityScore: 94, totalQueries: 45200, region: 'New York, US', description: 'Real-time GPS coordinates from 500+ delivery vehicles across Manhattan and Brooklyn.', fields: ['latitude', 'longitude', 'speed_kmh', 'heading', 'vehicle_id', 'timestamp'] },
  '2': { name: 'Berlin Weather Stations', dataType: 'Weather', provider: 'WeatherNet DE', pricePerQuery: 0.001, subscriptionPrice: 3.0, qualityScore: 98, totalQueries: 128400, region: 'Berlin, DE', description: 'Temperature, humidity, pressure, and wind data from 23 IoT weather stations.', fields: ['temperature_c', 'humidity_pct', 'pressure_hpa', 'wind_speed_ms', 'station_id', 'timestamp'] },
};

export default function ListingDetailPage() {
  const params = useParams();
  const listing = LISTINGS[params.id as string];
  const [queryResult, setQueryResult] = useState('');

  if (!listing) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-16 text-center">
        <h1 className="text-xl font-bold mb-2">Listing Not Found</h1>
        <Link href="/" className="text-forest text-sm hover:underline">Back to marketplace</Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <Link href="/" className="text-sm text-earth-400 hover:text-earth-500 mb-4 inline-block">&larr; Back</Link>

      <div className="flex justify-between items-start mb-6">
        <div>
          <span className="text-xs font-medium bg-earth-100 text-earth-500 px-2 py-0.5 rounded mb-2 inline-block">{listing.dataType}</span>
          <h1 className="text-2xl font-bold">{listing.name}</h1>
          <p className="text-earth-400 mt-1">{listing.description}</p>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3 mb-8">
        <div className="bg-white border border-earth-200 rounded-lg p-4">
          <div className="text-xs text-earth-300 mb-1">Price per query</div>
          <div className="font-semibold">{listing.pricePerQuery} USDC</div>
        </div>
        <div className="bg-white border border-earth-200 rounded-lg p-4">
          <div className="text-xs text-earth-300 mb-1">Subscription</div>
          <div className="font-semibold">{listing.subscriptionPrice} USDC/mo</div>
        </div>
        <div className="bg-white border border-earth-200 rounded-lg p-4">
          <div className="text-xs text-earth-300 mb-1">Quality Score</div>
          <div className="font-semibold text-forest">{listing.qualityScore}%</div>
        </div>
        <div className="bg-white border border-earth-200 rounded-lg p-4">
          <div className="text-xs text-earth-300 mb-1">Total Queries</div>
          <div className="font-semibold">{listing.totalQueries.toLocaleString()}</div>
        </div>
      </div>

      <div className="bg-white border border-earth-200 rounded-xl p-6 mb-6">
        <h2 className="font-semibold text-lg mb-3">Data Schema</h2>
        <div className="flex flex-wrap gap-2">
          {listing.fields.map((f) => (
            <span key={f} className="font-mono text-sm bg-earth-100 px-3 py-1.5 rounded">{f}</span>
          ))}
        </div>
      </div>

      <div className="bg-white border border-earth-200 rounded-xl p-6 mb-6">
        <h2 className="font-semibold text-lg mb-3">Preview Data</h2>
        <button
          onClick={() => setQueryResult(JSON.stringify({ data: [{ [listing.fields[0]]: '40.7128', [listing.fields[1]]: '-74.0060', [listing.fields[listing.fields.length - 1]]: new Date().toISOString() }], count: 1, provider: listing.provider }, null, 2))}
          className="bg-forest text-white text-sm font-medium px-5 py-2.5 rounded-lg hover:bg-forest-light mb-4"
        >
          Query Sample (free)
        </button>
        {queryResult && (
          <pre className="font-mono text-sm bg-earth-100 rounded-lg p-4 overflow-x-auto">{queryResult}</pre>
        )}
      </div>

      <div className="flex gap-3">
        <button className="flex-1 bg-forest text-white font-medium py-3 rounded-lg hover:bg-forest-light text-sm">
          Subscribe ({listing.subscriptionPrice} USDC/mo)
        </button>
        <button className="flex-1 bg-white border border-earth-200 text-earth-500 font-medium py-3 rounded-lg hover:bg-earth-100 text-sm">
          Pay per Query ({listing.pricePerQuery} USDC)
        </button>
      </div>
    </div>
  );
}
