'use client';

import { useState } from 'react';

export default function ProviderPage() {
  const [name, setName] = useState('');
  const [dataType, setDataType] = useState('GPS');
  const [price, setPrice] = useState('0.002');

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      <h1 className="text-2xl font-bold mb-2">Provider Dashboard</h1>
      <p className="text-earth-400 text-sm mb-8">List your IoT data streams and start earning USDC.</p>

      <div className="bg-white border border-earth-200 rounded-xl p-6 mb-6">
        <h2 className="font-semibold mb-4">Your Listings</h2>
        <div className="text-sm text-earth-300 text-center py-8">No data streams listed yet. Create your first listing below.</div>
      </div>

      <div className="bg-white border border-earth-200 rounded-xl p-6">
        <h2 className="font-semibold mb-4">Create Listing</h2>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-earth-500 mb-1 block">Stream Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="My IoT Data Stream" className="w-full bg-cream border border-earth-200 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-forest" />
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
          <button className="w-full bg-forest text-white font-medium py-3 rounded-lg hover:bg-forest-light text-sm">
            Create Listing
          </button>
        </div>
      </div>
    </div>
  );
}
