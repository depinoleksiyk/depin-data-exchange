// Generates a dedicated oracle keypair for signing update_quality /
// slash_provider transactions. Separate from the deploy keypair so the
// daemon can live on a machine without root deploy powers.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { Keypair } from '@solana/web3.js';

const TARGET = path.join(__dirname, '..', 'oracle-keypair.json');

if (fs.existsSync(TARGET)) {
  console.log('oracle-keypair.json already exists, leaving untouched');
  process.exit(0);
}

const kp = Keypair.generate();
fs.writeFileSync(TARGET, JSON.stringify(Array.from(kp.secretKey)));
fs.chmodSync(TARGET, 0o600);
console.log('oracle pubkey:', kp.publicKey.toBase58());
console.log('saved to:', TARGET);
console.log('\nNext: `solana transfer', kp.publicKey.toBase58(), '0.05 --url devnet --keypair ./deploy-keypair.json --allow-unfunded-recipient` to fund it.');
