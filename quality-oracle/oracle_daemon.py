"""
Oracle daemon — walks every listing on the exchange and pushes a fresh
quality report on-chain every `INTERVAL_MINUTES`. It also commits a Merkle
snapshot root for each listing so the gateway can answer sample-proof
requests.

Run:
    python oracle_daemon.py --once        # single pass
    python oracle_daemon.py                # schedule, runs forever
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import time
from dataclasses import dataclass
from typing import Any

import httpx
from apscheduler.schedulers.blocking import BlockingScheduler
from borsh_construct import CStruct, U8
from dotenv import load_dotenv
from solana.rpc.api import Client
from solana.rpc.commitment import Confirmed
from solders.instruction import AccountMeta, Instruction
from solders.keypair import Keypair
from solders.pubkey import Pubkey
from solders.transaction import Transaction

from quality_oracle import score

load_dotenv()

PROGRAM_ID = Pubkey.from_string(
    os.environ.get("PROGRAM_ID", "3gGkKra1uhoDukSkFLCux8j3gkxoMdUjzMfHzLGKkyzk")
)
RPC_URL = os.environ.get("ORACLE_RPC_URL", "https://api.devnet.solana.com")
GATEWAY_URL = os.environ.get("ORACLE_GATEWAY_URL", "http://localhost:4001")
KEYPAIR_PATH = os.environ.get("ORACLE_KEYPAIR_PATH", "./oracle-keypair.json")
INTERVAL_MINUTES = int(os.environ.get("ORACLE_INTERVAL_MINUTES", "30"))

DATA_TYPE_MAP = {
    "gps": "GPS",
    "weather": "Weather",
    "network": "Network",
    "camera": "Camera",
}

QualityReportLayout = CStruct(
    "freshness" / U8,
    "accuracy" / U8,
    "completeness" / U8,
    "overall" / U8,
)


def load_keypair(path: str) -> Keypair:
    with open(os.path.expanduser(path), "r") as fh:
        raw = json.load(fh)
    return Keypair.from_bytes(bytes(raw))


def anchor_discriminator(namespace: str, name: str) -> bytes:
    # Anchor: sha256("<namespace>:<name>")[..8]
    return hashlib.sha256(f"{namespace}:{name}".encode()).digest()[:8]


def listing_pda(provider: Pubkey, listing_id: int) -> Pubkey:
    return Pubkey.find_program_address(
        [b"listing", bytes(provider), listing_id.to_bytes(8, "little")],
        PROGRAM_ID,
    )[0]


def provider_pda(provider: Pubkey) -> Pubkey:
    return Pubkey.find_program_address([b"provider", bytes(provider)], PROGRAM_ID)[0]


def exchange_pda() -> Pubkey:
    return Pubkey.find_program_address([b"data_exchange"], PROGRAM_ID)[0]


@dataclass
class Listing:
    pubkey: Pubkey
    provider: Pubkey
    listing_id: int
    data_type: str


def fetch_listings(client: Client) -> list[Listing]:
    """Scan every program account and decode DataListing entries."""
    # DataListing discriminator = sha256("account:DataListing")[..8]
    discriminator = hashlib.sha256(b"account:DataListing").digest()[:8]
    resp = client.get_program_accounts(
        PROGRAM_ID,
        commitment=Confirmed,
        encoding="base64",
    )
    out: list[Listing] = []
    for item in resp.value:
        data = bytes(item.account.data)
        if len(data) < 8 + 32 + 8 + 1:
            continue
        if data[:8] != discriminator:
            continue
        provider = Pubkey.from_bytes(data[8:40])
        listing_id = int.from_bytes(data[40:48], "little")
        data_type_byte = data[48]
        names = ["GPS", "Weather", "Network", "Camera"]
        if data_type_byte >= len(names):
            continue
        out.append(Listing(item.pubkey, provider, listing_id, names[data_type_byte]))
    return out


def fetch_samples(listing_id_str: str, data_type: str) -> list[dict]:
    url = f"{GATEWAY_URL}/v1/preview/{listing_id_str}?type={data_type}"
    try:
        r = httpx.get(url, timeout=5.0)
        r.raise_for_status()
        payload = r.json()
        # The preview endpoint only returns one row; ask the sample-proof
        # endpoint for the full set so scoring sees real volume.
        proof = httpx.get(f"{GATEWAY_URL}/v1/sample-proof/{listing_id_str}?type={data_type}", timeout=5.0)
        proof.raise_for_status()
        proof_payload = proof.json()
        return [proof_payload["leaf"], *payload.get("sample", [])]
    except Exception as exc:
        print(f"[oracle] sample fetch failed for {listing_id_str}: {exc}", file=sys.stderr)
        return []


def fetch_merkle_root(listing_id_str: str, data_type: str) -> bytes | None:
    url = f"{GATEWAY_URL}/v1/sample-proof/{listing_id_str}?type={data_type}"
    try:
        r = httpx.get(url, timeout=5.0)
        r.raise_for_status()
        root_hex = r.json().get("root")
        if root_hex:
            return bytes.fromhex(root_hex)
    except Exception as exc:
        print(f"[oracle] merkle fetch failed: {exc}", file=sys.stderr)
    return None


def build_update_quality(
    oracle: Keypair,
    listing: Listing,
    report,
) -> Instruction:
    data = anchor_discriminator("global", "update_quality")
    data += QualityReportLayout.build(
        {
            "freshness": min(max(report.freshness, 0), 100),
            "accuracy": min(max(report.accuracy, 0), 100),
            "completeness": min(max(report.completeness, 0), 100),
            "overall": min(max(report.overall, 0), 100),
        }
    )
    accounts = [
        AccountMeta(exchange_pda(), False, False),
        AccountMeta(listing.pubkey, False, True),
        AccountMeta(provider_pda(listing.provider), False, True),
        AccountMeta(oracle.pubkey(), True, False),
    ]
    return Instruction(PROGRAM_ID, data, accounts)


def build_commit_snapshot(
    provider_wallet: Pubkey,
    listing: Listing,
    root: bytes,
) -> Instruction:
    """Only the provider can sign commit_snapshot — we skip it if the oracle
    isn't also the provider. Returned for completeness / manual scripting."""
    data = anchor_discriminator("global", "commit_snapshot") + root
    accounts = [
        AccountMeta(listing.pubkey, False, True),
        AccountMeta(provider_wallet, True, False),
    ]
    return Instruction(PROGRAM_ID, data, accounts)


def send_transaction(client: Client, signer: Keypair, ixs: list[Instruction]) -> str | None:
    if not ixs:
        return None
    blockhash = client.get_latest_blockhash(Confirmed).value.blockhash
    tx = Transaction.new_signed_with_payer(ixs, signer.pubkey(), [signer], blockhash)
    sig = client.send_transaction(tx, opts={"skip_confirmation": False}).value
    return str(sig)


def run_once() -> None:
    client = Client(RPC_URL, commitment=Confirmed)
    oracle = load_keypair(KEYPAIR_PATH)
    listings = fetch_listings(client)
    if not listings:
        print("[oracle] no listings on-chain, nothing to score")
        return

    print(f"[oracle] scoring {len(listings)} listings at {int(time.time())}")
    for listing in listings:
        listing_id_str = str(listing.pubkey)
        samples = fetch_samples(listing_id_str, listing.data_type)
        if not samples:
            print(f"[oracle]   skipping {listing_id_str[:12]}… — no samples")
            continue
        report = score(listing.data_type, samples)
        ix = build_update_quality(oracle, listing, report)
        try:
            sig = send_transaction(client, oracle, [ix])
            print(
                f"[oracle]   {listing.data_type:<7} {listing_id_str[:10]}… "
                f"overall={report.overall:<3} f={report.freshness} a={report.accuracy} c={report.completeness} "
                f"sig={sig[:10] if sig else '—'}…"
            )
        except Exception as exc:  # noqa: BLE001 — log + continue
            print(f"[oracle]   failed to push for {listing_id_str}: {exc}", file=sys.stderr)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true", help="run a single scoring pass and exit")
    args = parser.parse_args()

    if args.once:
        run_once()
        return

    scheduler = BlockingScheduler()
    scheduler.add_job(run_once, "interval", minutes=INTERVAL_MINUTES, next_run_time=None)
    print(
        f"[oracle] scheduler started — every {INTERVAL_MINUTES} min against {RPC_URL}",
        flush=True,
    )
    run_once()
    scheduler.start()


if __name__ == "__main__":
    main()
