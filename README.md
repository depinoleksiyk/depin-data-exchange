# DePIN Data Exchange

A decentralized marketplace for buying and selling verified IoT and DePIN data streams on Solana.

## Use Cases

- **Fleet Management**: Purchase real-time GPS data from Hivemapper dashcams
- **Weather Monitoring**: Access temperature and humidity data from distributed sensors
- **Network Analytics**: Buy Helium network coverage and signal strength data
- **Air Quality**: Subscribe to pollution monitoring data from urban sensors

## Core Action

List a data stream → buyer discovers via search/map → purchases access with USDC → receives real-time data feed.

## Data Types

| Type | Source | Format | Typical Price |
|------|--------|--------|---------------|
| GPS Coordinates | Hivemapper | GeoJSON | 0.001 USDC/point |
| Temperature | IoT Sensors | JSON | 0.0001 USDC/reading |
| Signal Strength | Helium | Coverage Map | 0.01 USDC/hex |
| Air Quality | Urban Nodes | PM2.5 Index | 0.005 USDC/reading |

## Stack

- **Contracts**: Anchor — listing registry, subscription management, USDC payments
- **Frontend**: Next.js + Mapbox for geographic data visualization
- **Gateway**: Node.js — data stream proxy and access control
- **Font**: Sora

## Development

```bash
anchor build && anchor deploy
cd gateway && npm install && npm start
cd web && npm install && npm run dev
```

## License

MIT
