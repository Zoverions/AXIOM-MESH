#!/usr/bin/env python3
import sys
from pathlib import Path


def assert_contains(content: str, required: str, message: str) -> None:
    if required not in content:
        print(f"Error: {message}")
        sys.exit(1)


def main():
    hypervisor_server = Path("hypervisor/src/api/server.py")
    if not hypervisor_server.exists():
        print("hypervisor/src/api/server.py not found")
        sys.exit(1)

    content = hypervisor_server.read_text()
    assert_contains(content, "raise RuntimeError(", "mTLS fail-closed RuntimeError missing")
    assert_contains(content, "build_signed_headers(", "signed inter-service header helper missing")
    assert_contains(content, "X-Axiom-Nonce", "anti-replay nonce header missing")
    assert_contains(content, "X-Axiom-Timestamp", "anti-replay timestamp header missing")
    assert_contains(content, "X-Axiom-Signature", "request signature header missing")

    print("mTLS fail-closed and anti-replay signing verified.")
    sys.exit(0)


if __name__ == "__main__":
    main()
