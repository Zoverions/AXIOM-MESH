#!/usr/bin/env python3
"""Validate transformer foundation PulseChain deployment evidence bundle."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from urllib import request

REQUIRED_CONTRACTS = [
    "AXM",
    "CognitiveFrictionVerifier",
    "PulseAdapter",
    "ProveXVerifierWrapper",
    "SkillCapsuleLauncher",
    "HEXStaker",
    "SwarmCoordinator",
    "UniversalConsentProtocol",
]


def _rpc_call(rpc_url: str, method: str, params: list[object]) -> object:
    payload = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode("utf-8")
    req = request.Request(rpc_url, data=payload, headers={"Content-Type": "application/json"})
    with request.urlopen(req, timeout=20) as resp:
        body = json.loads(resp.read().decode("utf-8"))
    if "error" in body:
        raise RuntimeError(f"rpc error: {body['error']}")
    return body["result"]


def validate_bundle(path: Path, check_chain: bool) -> int:
    if not path.exists():
        print(f"bundle not found: {path}", file=sys.stderr)
        return 1

    data = json.loads(path.read_text(encoding="utf-8"))

    errors: list[str] = []
    network = data.get("network", {})
    contracts = data.get("contracts", {})

    if network.get("chainId") != 943:
        errors.append(f"expected chainId 943, found {network.get('chainId')}")

    for name in REQUIRED_CONTRACTS:
        contract = contracts.get(name)
        if not contract:
            errors.append(f"missing contract entry: {name}")
            continue
        for field in ("address", "txHash", "blockNumber"):
            if field not in contract:
                errors.append(f"missing {field} for {name}")

    if check_chain and not errors:
        rpc_url = network.get("rpcUrl")
        if not rpc_url:
            errors.append("rpcUrl missing for on-chain checks")
        else:
            for name in REQUIRED_CONTRACTS:
                addr = contracts[name]["address"]
                code = _rpc_call(rpc_url, "eth_getCode", [addr, "latest"])
                if code in ("0x", "0x0", None):
                    errors.append(f"no runtime code at {name} ({addr})")

    if errors:
        print("transformer deployment evidence validation failed:", file=sys.stderr)
        for e in errors:
            print(f"- {e}", file=sys.stderr)
        return 1

    print(f"transformer deployment evidence validated: {path}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate transformer deployment evidence bundle")
    parser.add_argument("bundle", type=Path, help="Path to transformer-foundation-deployment.json")
    parser.add_argument("--check-chain", action="store_true", help="Verify deployed bytecode exists at addresses")
    args = parser.parse_args()
    return validate_bundle(args.bundle, args.check_chain)


if __name__ == "__main__":
    raise SystemExit(main())
