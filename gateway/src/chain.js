const fs = require('node:fs');
const {
  Connection,
  PublicKey,
} = require('@solana/web3.js');
const anchor = require('@coral-xyz/anchor');

const config = require('./config');
const logger = require('./logger');

let connection = null;
let program = null;
let eventParser = null;

function loadProgram() {
  if (program) return program;

  const idl = JSON.parse(fs.readFileSync(config.idlPath, 'utf8'));
  connection = new Connection(config.rpcUrl, {
    commitment: 'confirmed',
    wsEndpoint: config.wsRpcUrl,
  });

  // Read-only provider — gateway never signs, only reads and decodes logs.
  const stub = {
    publicKey: new PublicKey('11111111111111111111111111111111'),
    signTransaction: async (t) => t,
    signAllTransactions: async (txs) => txs,
  };
  const provider = new anchor.AnchorProvider(connection, stub, {
    commitment: 'confirmed',
  });

  program = new anchor.Program(idl, provider);
  eventParser = new anchor.EventParser(program.programId, program.coder);
  return program;
}

function getConnection() {
  if (!connection) loadProgram();
  return connection;
}

function getEventParser() {
  if (!eventParser) loadProgram();
  return eventParser;
}

function getProgram() {
  return loadProgram();
}

function getProgramId() {
  return new PublicKey(config.programId);
}

function findListingPda(providerPubkey, listingId) {
  const idBuf = Buffer.alloc(8);
  idBuf.writeBigUInt64LE(BigInt(listingId));
  return PublicKey.findProgramAddressSync(
    [Buffer.from('listing'), providerPubkey.toBuffer(), idBuf],
    getProgramId()
  )[0];
}

function findSubscriptionPda(listingPubkey, buyerPubkey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('subscription'), listingPubkey.toBuffer(), buyerPubkey.toBuffer()],
    getProgramId()
  )[0];
}

async function fetchTxEvents(signature) {
  const conn = getConnection();
  const tx = await conn.getTransaction(signature, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0,
  });
  if (!tx) return { ok: false, reason: 'tx_not_found' };
  if (tx.meta?.err) return { ok: false, reason: 'tx_failed' };

  const logs = tx.meta?.logMessages || [];
  const parser = getEventParser();
  const events = [];
  try {
    for (const event of parser.parseLogs(logs)) {
      events.push(event);
    }
  } catch (err) {
    logger.warn({ err: err.message, signature }, 'event parse error');
  }
  return { ok: true, events, logs, blockTime: tx.blockTime };
}

async function fetchSubscription(subscriptionPubkey) {
  const prog = getProgram();
  try {
    return await prog.account.dataSubscription.fetch(subscriptionPubkey);
  } catch (err) {
    logger.debug({ err: err.message, sub: subscriptionPubkey.toBase58() }, 'subscription fetch failed');
    return null;
  }
}

async function fetchListing(listingPubkey) {
  const prog = getProgram();
  try {
    return await prog.account.dataListing.fetch(listingPubkey);
  } catch {
    return null;
  }
}

function subscribeToProgramLogs(onEvent) {
  const conn = getConnection();
  const parser = getEventParser();
  return conn.onLogs(
    getProgramId(),
    (logInfo) => {
      if (logInfo.err) return;
      try {
        for (const event of parser.parseLogs(logInfo.logs)) {
          onEvent({
            name: event.name,
            data: event.data,
            signature: logInfo.signature,
          });
        }
      } catch (err) {
        logger.debug({ err: err.message }, 'log parse failure');
      }
    },
    'confirmed'
  );
}

module.exports = {
  getConnection,
  getProgram,
  getProgramId,
  fetchTxEvents,
  fetchSubscription,
  fetchListing,
  findListingPda,
  findSubscriptionPda,
  subscribeToProgramLogs,
};
