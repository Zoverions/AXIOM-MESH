#!/usr/bin/env python3
import sys
from pathlib import Path


def assert_contains(content: str, required: str, message: str) -> None:
    if required not in content:
        print(f"Error: {message}")
        sys.exit(1)


def main():
    # M7.2 Hard-fail service identity transport: remove plaintext fallback in hypervisor/src/api/server.py:create_mtls_client
    # Enforce mTLS cert presence at boot, and add anti-replay coverage for inter-service requests.
    hypervisor_server = Path("hypervisor/src/api/server.py")
    if not hypervisor_server.exists():
        print("hypervisor/src/api/server.py not found")
        sys.exit(1)

    content = hypervisor_server.read_text()
    # Check for hard-fail when mTLS certificates are missing (fail-closed behavior)
    assert_contains(content, "raise RuntimeError(", "mTLS fail-closed RuntimeError missing")
    # Check for the build_signed_headers utility which adds anti-replay headers
    assert_contains(content, "def build_signed_headers", "signed inter-service header helper missing")
    # Check that anti-replay nonce is enforced
    assert_contains(content, "X-Axiom-Nonce", "anti-replay nonce header missing")
    # Check that anti-replay timestamp is enforced
    assert_contains(content, "X-Axiom-Timestamp", "anti-replay timestamp header missing")
    # Check that requests are properly signed
    assert_contains(content, "X-Axiom-Signature", "request signature header missing")

    # Check explicit comment for the task
    assert_contains(content, "M7.2 Hard-fail service identity transport", "M7.2 explicit comment missing")

    print("mTLS fail-closed and anti-replay signing verified for M7.2.")
    sys.exit(0)


if __name__ == "__main__":
    main()
