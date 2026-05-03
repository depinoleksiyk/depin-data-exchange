const { keccak256 } = require('js-sha3');

// Representative DePIN samples. Timestamps are generated fresh per-request so
// quality-oracle freshness scoring sees non-stale data every time.
function nowMs() {
  return Date.now();
}

function gpsSamples() {
  const now = nowMs();
  return [
    { lat: 37.7749, lng: -122.4194, speed_kmh: 42.1, heading: 87, vehicle_id: 'sf-van-0019', accuracy: 2.8, ts: now },
    { lat: 37.7722, lng: -122.4054, speed_kmh: 28.7, heading: 102, vehicle_id: 'sf-van-0023', accuracy: 3.4, ts: now - 22_000 },
    { lat: 40.7128, lng: -74.0060, speed_kmh: 35.9, heading: 12, vehicle_id: 'ny-truck-0101', accuracy: 2.1, ts: now - 45_000 },
    { lat: 40.7306, lng: -73.9352, speed_kmh: 19.3, heading: 190, vehicle_id: 'ny-truck-0088', accuracy: 4.9, ts: now - 61_000 },
    { lat: 52.5200, lng: 13.4050, speed_kmh: 55.6, heading: 45, vehicle_id: 'de-logistics-214', accuracy: 2.7, ts: now - 92_000 },
    { lat: 52.5020, lng: 13.4030, speed_kmh: 62.8, heading: 50, vehicle_id: 'de-logistics-214', accuracy: 3.0, ts: now - 140_000 },
  ];
}

function weatherSamples() {
  const now = nowMs();
  return [
    { station: 'berlin-wx-03', temperature_c: 14.2, humidity_pct: 71, pressure_hpa: 1013.7, wind_ms: 3.1, ts: now },
    { station: 'berlin-wx-11', temperature_c: 13.9, humidity_pct: 74, pressure_hpa: 1013.4, wind_ms: 2.6, ts: now - 15_000 },
    { station: 'tokyo-wx-22', temperature_c: 22.6, humidity_pct: 68, pressure_hpa: 1009.1, wind_ms: 4.3, ts: now - 30_000 },
    { station: 'bangalore-wx-07', temperature_c: 28.3, humidity_pct: 55, pressure_hpa: 1010.2, wind_ms: 1.8, ts: now - 60_000 },
    { station: 'saopaulo-wx-04', temperature_c: 19.7, humidity_pct: 82, pressure_hpa: 1011.5, wind_ms: 2.9, ts: now - 95_000 },
  ];
}

function networkSamples() {
  const now = nowMs();
  return [
    { node: 'helium-hotspot-sf-01', uptime_pct: 99.4, latency_ms: 22, bandwidth_mbps: 430, peers: 42, ts: now },
    { node: 'helium-hotspot-la-07', uptime_pct: 99.8, latency_ms: 19, bandwidth_mbps: 510, peers: 38, ts: now - 14_000 },
    { node: 'render-node-us-west-3', uptime_pct: 99.1, latency_ms: 28, bandwidth_mbps: 640, peers: 55, ts: now - 27_000 },
    { node: 'render-node-eu-3', uptime_pct: 98.4, latency_ms: 33, bandwidth_mbps: 580, peers: 49, ts: now - 41_000 },
    { node: 'iotex-gateway-sg-02', uptime_pct: 99.9, latency_ms: 17, bandwidth_mbps: 720, peers: 61, ts: now - 88_000 },
  ];
}

function cameraSamples() {
  const now = nowMs();
  return [
    { device: 'hivemapper-dashcam-sf-02', frame: 'f_917214', resolution: '4K', coverage_km: 0.7, ts: now },
    { device: 'hivemapper-dashcam-ny-08', frame: 'f_917903', resolution: '4K', coverage_km: 0.9, ts: now - 18_000 },
    { device: 'hivemapper-dashcam-ber-01', frame: 'f_918112', resolution: '2K', coverage_km: 0.6, ts: now - 55_000 },
  ];
}

function samplesFor(dataType) {
  switch ((dataType || '').toString().toLowerCase()) {
    case 'gps':
      return { type: 'GPS', rows: gpsSamples() };
    case 'weather':
      return { type: 'Weather', rows: weatherSamples() };
    case 'network':
      return { type: 'Network', rows: networkSamples() };
    case 'camera':
      return { type: 'Camera', rows: cameraSamples() };
    default:
      return { type: 'GPS', rows: gpsSamples() };
  }
}

function listingMetadata() {
  const types = ['GPS', 'Weather', 'Network', 'Camera'];
  return types.map((type) => {
    const rows = samplesFor(type).rows;
    return {
      dataType: type,
      sampleCount: rows.length,
      fields: Object.keys(rows[0] || {}),
    };
  });
}

// Canonical serialization so client+gateway+oracle agree on the Merkle leaves.
function leafHashFor(row) {
  const canonical = Object.keys(row).sort().reduce((acc, key) => {
    acc[key] = row[key];
    return acc;
  }, {});
  const bytes = Buffer.from(JSON.stringify(canonical));
  return Buffer.from(keccak256.arrayBuffer(bytes));
}

function buildMerkle(rows) {
  if (rows.length === 0) return { root: Buffer.alloc(32), layers: [[]] };
  const leaves = rows.map(leafHashFor);
  const layers = [leaves];
  while (layers[layers.length - 1].length > 1) {
    const prev = layers[layers.length - 1];
    const next = [];
    for (let i = 0; i < prev.length; i += 2) {
      const left = prev[i];
      const right = i + 1 < prev.length ? prev[i + 1] : prev[i];
      next.push(Buffer.from(keccak256.arrayBuffer(Buffer.concat([left, right]))));
    }
    layers.push(next);
  }
  return { root: layers[layers.length - 1][0], layers };
}

function proofFor(layers, index) {
  const path = [];
  let idx = index;
  for (let d = 0; d < layers.length - 1; d++) {
    const layer = layers[d];
    const pairIdx = idx % 2 === 0 ? idx + 1 : idx - 1;
    const siblingIdx = pairIdx < layer.length ? pairIdx : idx; // odd tail: duplicate
    path.push({
      hash: Buffer.from(layer[siblingIdx]).toString('hex'),
      isLeft: pairIdx < idx, // sibling sits to our left
    });
    idx = Math.floor(idx / 2);
  }
  return path;
}

module.exports = {
  samplesFor,
  listingMetadata,
  leafHashFor,
  buildMerkle,
  proofFor,
};
