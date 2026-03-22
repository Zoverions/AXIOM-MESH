#!/usr/bin/env python3
"""Assess launch readiness and estimate required funding for network bootstrap."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
import urllib.request
from dataclasses import dataclass, asdict
from typing import Any
from pathlib import Path

FOUNDER_ADDRESS = "0x1c2cbabf75e1938ed2f2c59e734e83aa5fbe1b73"  # same as Genesis

def deploy_genesis(rpc_url: str) -> str | None:
    print("Deploying Genesis (anyone can pay gas — Founder control is hardcoded)", file=sys.stderr)
    try:
        result = subprocess.run([
            "forge", "create", "--rpc-url", rpc_url or "",
            "--private-key", os.getenv("DEPLOYER_KEY") or "",
            "contracts/core/Genesis.sol:Genesis", "--json"
        ], capture_output=True, text=True)

        if result.returncode == 0:
            try:
                deploy_data = json.loads(result.stdout)
                deployed_to = deploy_data.get("deployedTo")
                print("Genesis deployed — FounderEntity now controlled by hardcoded address only.", file=sys.stderr)
                return deployed_to
            except json.JSONDecodeError:
                print(f"Failed to parse deploy output: {result.stdout}", file=sys.stderr)
        else:
            print(f"Deployment failed: {result.stderr}", file=sys.stderr)

    except FileNotFoundError:
        print("Warning: `forge` not found. Skipping actual deployment simulation.", file=sys.stderr)

    return None


def _rpc_call(rpc_url: str, method: str, params: list[Any]) -> Any:
    payload = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode()
    req = urllib.request.Request(rpc_url, data=payload, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=5) as resp:
        body = json.loads(resp.read().decode())
    if "error" in body:
        raise RuntimeError(body["error"])
    return body.get("result")


def wei_hex_to_eth(value: str) -> float:
    return int(value, 16) / 10**18


def estimate_min_funding_eth(gas_price_gwei: float, gas_units: int = 3_500_000, safety_multiplier: float = 1.5) -> float:
    gas_price_eth = gas_price_gwei / 1_000_000_000
    estimated = gas_price_eth * gas_units * safety_multiplier
    return round(estimated, 6)


@dataclass
class LaunchAssessment:
    launch_mode: str
    rpc_url: str
    wallet_address: str
    rpc_reachable: bool
    gas_price_gwei: float
    estimated_min_funding_eth: float
    wallet_balance_eth: float
    funded_enough: bool
    is_blocked: bool
    next_action: str


def assess_launch(launch_mode: str, rpc_url: str, wallet_address: str) -> LaunchAssessment:
    if launch_mode == "launch-network":
        manifest_path = Path("deployment_manifest.json")
        if not manifest_path.exists():
            return LaunchAssessment(
                launch_mode=launch_mode,
                rpc_url=rpc_url,
                wallet_address=wallet_address,
                rpc_reachable=False,
                gas_price_gwei=0.0,
                estimated_min_funding_eth=0.0,
                wallet_balance_eth=0.0,
                funded_enough=False,
                is_blocked=True,
                next_action="deployment_manifest.json not found. Testnet must be launched and run for 90 days before mainnet.",
            )
        try:
            with open(manifest_path) as f:
                manifest = json.load(f)
            testnet_genesis_address = manifest.get("testnet_genesis_address")
            if not testnet_genesis_address:
                return LaunchAssessment(
                    launch_mode=launch_mode,
                    rpc_url=rpc_url,
                    wallet_address=wallet_address,
                    rpc_reachable=False,
                    gas_price_gwei=0.0,
                    estimated_min_funding_eth=0.0,
                    wallet_balance_eth=0.0,
                    funded_enough=False,
                    is_blocked=True,
                    next_action="Testnet has not been launched yet. Testnet must run for 90 days before mainnet.",
                )

            # Real on-chain check via testnet RPC
            testnet_rpc = "https://rpc.v4.testnet.pulsechain.com"
            try:
                # Get the code at the Genesis address to ensure it was actually deployed
                code = _rpc_call(testnet_rpc, "eth_getCode", [testnet_genesis_address, "latest"])
                if not code or code == "0x":
                    return LaunchAssessment(
                        launch_mode=launch_mode,
                        rpc_url=rpc_url,
                        wallet_address=wallet_address,
                        rpc_reachable=False,
                        gas_price_gwei=0.0,
                        estimated_min_funding_eth=0.0,
                        wallet_balance_eth=0.0,
                        funded_enough=False,
                        is_blocked=True,
                        next_action="Testnet Genesis contract not found on-chain. Mainnet launch blocked.",
                    )

                # Use block timestamp as proof of deployment age
                # For simplicity without indexing, we compare the block of the testnet RPC
                # We assume if the network is healthy, the latest block's timestamp is current
                # However, to be precise, we check if 90 days have passed since the original deployment.
                # Since we don't have the deploy block easily queryable via standard RPC without logs,
                # we rely on the manifest's `testnet_launch_timestamp` BUT we validated the contract ACTUALLY EXISTS on testnet above.
                testnet_launch = manifest.get("testnet_launch_timestamp")
                if not testnet_launch:
                    return LaunchAssessment(
                        launch_mode=launch_mode,
                        rpc_url=rpc_url,
                        wallet_address=wallet_address,
                        rpc_reachable=False,
                        gas_price_gwei=0.0,
                        estimated_min_funding_eth=0.0,
                        wallet_balance_eth=0.0,
                        funded_enough=False,
                        is_blocked=True,
                        next_action="Testnet launch timestamp missing from manifest. Mainnet launch blocked.",
                    )

                # Check current on-chain testnet block timestamp to ensure it's been 90 days
                latest_block = _rpc_call(testnet_rpc, "eth_getBlockByNumber", ["latest", False])
                current_time = int(latest_block["timestamp"], 16)

                ninety_days = 90 * 24 * 60 * 60
                if current_time - int(testnet_launch) < ninety_days:
                    return LaunchAssessment(
                        launch_mode=launch_mode,
                        rpc_url=rpc_url,
                        wallet_address=wallet_address,
                        rpc_reachable=False,
                        gas_price_gwei=0.0,
                        estimated_min_funding_eth=0.0,
                        wallet_balance_eth=0.0,
                        funded_enough=False,
                        is_blocked=True,
                        next_action="Testnet has not reached the 90-day verification threshold. Mainnet launch blocked.",
                    )
            except Exception as rpc_err:
                 return LaunchAssessment(
                        launch_mode=launch_mode,
                        rpc_url=rpc_url,
                        wallet_address=wallet_address,
                        rpc_reachable=False,
                        gas_price_gwei=0.0,
                        estimated_min_funding_eth=0.0,
                        wallet_balance_eth=0.0,
                        funded_enough=False,
                        is_blocked=True,
                        next_action=f"Failed to connect to testnet RPC for verification: {rpc_err}",
                    )
        except Exception as e:
            return LaunchAssessment(
                launch_mode=launch_mode,
                rpc_url=rpc_url,
                wallet_address=wallet_address,
                rpc_reachable=False,
                gas_price_gwei=0.0,
                estimated_min_funding_eth=0.0,
                wallet_balance_eth=0.0,
                funded_enough=False,
                is_blocked=True,
                next_action=f"Failed to verify testnet timeline: {str(e)}",
            )

    if launch_mode not in ("launch-network", "launch-testnet"):
        return LaunchAssessment(
            launch_mode=launch_mode,
            rpc_url=rpc_url,
            wallet_address=wallet_address,
            rpc_reachable=False,
            gas_price_gwei=0.0,
            estimated_min_funding_eth=0.0,
            wallet_balance_eth=0.0,
            funded_enough=True,
            is_blocked=False,
            next_action="Proceed with local/single-node setup; on-chain funding not required.",
        )

    rpc_reachable = False
    gas_price_gwei = float(os.getenv("DEFAULT_GAS_PRICE_GWEI", "2.0"))
    wallet_balance_eth = 0.0

    if rpc_url:
        try:
            chain_id_hex = _rpc_call(rpc_url, "eth_chainId", [])
            if chain_id_hex:
                rpc_reachable = True
            gas_price_hex = _rpc_call(rpc_url, "eth_gasPrice", [])
            gas_price_gwei = int(gas_price_hex, 16) / 1_000_000_000
            if wallet_address:
                bal_hex = _rpc_call(rpc_url, "eth_getBalance", [wallet_address, "latest"])
                wallet_balance_eth = wei_hex_to_eth(bal_hex)
        except Exception:
            rpc_reachable = False

    estimated = estimate_min_funding_eth(gas_price_gwei)
    funded_enough = wallet_balance_eth >= estimated if wallet_address else False

    if not wallet_address:
        next_action = f"Set NETWORK_WALLET_ADDRESS, then re-run preflight before {launch_mode}."
    elif not rpc_reachable:
        next_action = "RPC not reachable; verify RPC_URL/network connectivity or choose local-mesh mode."
    elif funded_enough:
        next_action = "Wallet appears funded enough for bootstrap transactions."
    else:
        shortfall = round(max(0.0, estimated - wallet_balance_eth), 6)
        next_action = f"Request user funding for ~{shortfall} ETH (shortfall) or choose local-mesh/single-node."

    return LaunchAssessment(
        launch_mode=launch_mode,
        rpc_url=rpc_url,
        wallet_address=wallet_address,
        rpc_reachable=rpc_reachable,
        gas_price_gwei=round(gas_price_gwei, 6),
        estimated_min_funding_eth=estimated,
        wallet_balance_eth=round(wallet_balance_eth, 6),
        funded_enough=funded_enough,
        is_blocked=False,
        next_action=next_action,
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--launch-mode", default=os.getenv("LAUNCH_MODE", "local-mesh"))
    parser.add_argument("--rpc-url", default=os.getenv("RPC_URL", ""))
    parser.add_argument("--wallet-address", default=os.getenv("NETWORK_WALLET_ADDRESS", ""))
    parser.add_argument("--deploy", action="store_true", help="Execute the Genesis deployment")
    args = parser.parse_args()

    result = assess_launch(args.launch_mode, args.rpc_url, args.wallet_address)

    if args.deploy and args.launch_mode in ("launch-network", "launch-testnet"):
        if result.is_blocked:
             print(f"Deployment blocked: {result.next_action}", file=sys.stderr)
             print(json.dumps(asdict(result), indent=2))
             sys.exit(1)

        deployed_address = deploy_genesis(args.rpc_url)

        if args.launch_mode == "launch-testnet":
            if deployed_address:
                manifest_path = Path("deployment_manifest.json")
                manifest = {}
                if manifest_path.exists():
                    try:
                        with open(manifest_path) as f:
                            manifest = json.load(f)
                    except Exception:
                        pass

                if not manifest.get("testnet_launch_timestamp"):
                    manifest["testnet_launch_timestamp"] = int(time.time())

                manifest["testnet_genesis_address"] = deployed_address
                with open(manifest_path, "w") as f:
                    json.dump(manifest, f, indent=2)
            else:
                print("Testnet deployment failed or address not captured. Manifest not updated.", file=sys.stderr)

    print(json.dumps(asdict(result), indent=2))


if __name__ == "__main__":
    main()
