/**
 * DePIN Data Gateway
 *
 * Verifies on-chain subscription/payment, then delivers
 * requested data to the buyer. Supports query and stream endpoints.
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Connection, PublicKey } = require('@solana/web3.js');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.GATEWAY_PORT || 5000;
const RPC_URL = process.env.GATEWAY_RPC_URL || 'https://api.devnet.solana.com';
const PROGRAM_ID = process.env.PROGRAM_ID || '5mnqN7onSgqy9tBCTJ46N2mGr4Ty68fvCg4HqK5TsdTo';

const connection = new Connection(RPC_URL, 'confirmed');

// Replay protection — track used tx signatures
const usedTxSignatures = new Set();

// Sample datasets for demo
const SAMPLE_DATA = {
  GPS: [
    { lat: 37.7749, lng: -122.4194, timestamp: Date.now(), accuracy: 3.2, source: 'helium-hotspot-sf-01' },
    { lat: 37.7751, lng: -122.4183, timestamp: Date.now() - 60000, accuracy: 2.8, source: 'helium-hotspot-sf-01' },
    { lat: 37.7748, lng: -122.4201, timestamp: Date.now() - 120000, accuracy: 4.1, source: 'helium-hotspot-sf-02' },
  ],
  Weather: [
    { temp: 18.5, humidity: 72, pressure: 1013.2, wind_speed: 12.3, timestamp: Date.now(), station: 'wx-node-bay-01' },
    { temp: 17.8, humidity: 75, pressure: 1013.5, wind_speed: 11.1, timestamp: Date.now() - 300000, station: 'wx-node-bay-01' },
  ],
  Network: [
    { uptime: 99.7, latency_ms: 23, bandwidth_mbps: 450, peers: 42, timestamp: Date.now(), node: 'render-node-us-west' },
    { uptime: 99.9, latency_ms: 18, bandwidth_mbps: 520, peers: 38, timestamp: Date.now() - 600000, node: 'render-node-us-east' },
  ],
  Camera: [
    { frame_id: 'hm-sf-001-f1234', resolution: '4K', coverage_km: 0.8, timestamp: Date.now(), device: 'hivemapper-dashcam-01' },
  ],
};

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'depin-data-gateway' });
});

/**
 * POST /v1/query/:listingId
 *
 * Headers:
 *   x-buyer-pubkey: buyer wallet
 *   x-payment-tx: payment transaction signature
 *
 * Body: { dataType, params }
 */
app.post('/v1/query/:listingId', async (req, res) => {
  const { listingId } = req.params;
  const buyerPubkey = req.headers['x-buyer-pubkey'];
  const paymentTx = req.headers['x-payment-tx'];

  if (!buyerPubkey || !paymentTx) {
    return res.status(402).json({
      error: 'Payment Required',
      message: 'Include x-buyer-pubkey and x-payment-tx headers',
    });
  }

  // Replay protection — reject reused tx signatures
  if (usedTxSignatures.has(paymentTx)) {
    return res.status(402).json({ error: 'Transaction signature already used' });
  }

  // Verify payment transaction exists
  try {
    const txInfo = await connection.getTransaction(paymentTx, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });

    if (!txInfo || (txInfo.meta && txInfo.meta.err)) {
      return res.status(402).json({ error: 'Payment not verified' });
    }

    usedTxSignatures.add(paymentTx);
  } catch (err) {
    console.log(`[gateway] payment check failed: ${err.message}`);
    return res.status(402).json({ error: 'Payment verification failed' });
  }

  // Deliver data based on requested type
  const { dataType, params } = req.body;
  const data = SAMPLE_DATA[dataType] || SAMPLE_DATA['GPS'];

  // Apply basic filtering if params provided
  let filteredData = data;
  if (params && params.limit) {
    filteredData = data.slice(0, params.limit);
  }

  return res.json({
    listingId,
    dataType: dataType || 'GPS',
    records: filteredData,
    count: filteredData.length,
    deliveredAt: new Date().toISOString(),
  });
});

/**
 * GET /v1/preview/:listingId
 *
 * Returns a sample preview (no payment needed).
 */
app.get('/v1/preview/:listingId', (req, res) => {
  const { listingId } = req.params;
  const dataType = req.query.type || 'GPS';
  const sample = (SAMPLE_DATA[dataType] || SAMPLE_DATA['GPS']).slice(0, 1);

  return res.json({
    listingId,
    preview: true,
    dataType,
    sample,
    message: 'Subscribe or pay per query for full access',
  });
});

/**
 * GET /v1/listings
 *
 * List available data types and sample metadata.
 */
app.get('/v1/listings', (_req, res) => {
  const types = Object.keys(SAMPLE_DATA).map(type => ({
    dataType: type,
    sampleCount: SAMPLE_DATA[type].length,
    fields: Object.keys(SAMPLE_DATA[type][0] || {}),
  }));

  return res.json({ dataTypes: types });
});

app.listen(PORT, () => {
  console.log(`[gateway] DePIN Data Gateway on port ${PORT}`);
});
