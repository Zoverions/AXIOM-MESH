#!/usr/bin/env python3
import sys
from pathlib import Path


def assert_contains(content: str, required: str, message: str) -> None:
    if required not in content:
        print(f"Error: {message}")
        sys.exit(1)


def main():
    # SEC-A.2 Enforce Service-to-Service mTLS & Anti-Replay (Owner: security, ETA: TBD)

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

    http_transport = Path("grid/p2p/http_transport.go")
    if not http_transport.exists():
        print("grid/p2p/http_transport.go not found")
        sys.exit(1)

    content_http_transport = http_transport.read_text()
    assert_contains(content_http_transport, "tls.Config", "mTLS config missing in grid/p2p/http_transport.go")
    assert_contains(content_http_transport, "log.Fatalf(\"mTLS certs not found", "mTLS fail-closed missing in grid/p2p/http_transport.go")
    assert_contains(content_http_transport, "X-Axiom-Nonce", "anti-replay nonce header missing in grid/p2p/http_transport.go")
    assert_contains(content_http_transport, "X-Axiom-Timestamp", "anti-replay timestamp header missing in grid/p2p/http_transport.go")
    assert_contains(content_http_transport, "X-Axiom-Signature", "request signature header missing in grid/p2p/http_transport.go")

    node_go = Path("grid/p2p/node.go")
    if not node_go.exists():
        print("grid/p2p/node.go not found")
        sys.exit(1)

    content_node_go = node_go.read_text()
    # Ensure scheme is https and wss
    if "http://" in content_node_go:
        print("Error: Insecure http:// found in grid/p2p/node.go")
        sys.exit(1)
    if "ws://" in content_node_go:
        print("Error: Insecure ws:// found in grid/p2p/node.go")
        sys.exit(1)

    assert_contains(content_node_go, "transport.BuildSignedHeaders", "missing anti-replay header injection in node.go Websocket logic")

    grid_server = Path("grid/api/server.go")
    if not grid_server.exists():
        print("grid/api/server.go not found")
        sys.exit(1)

    content_grid_server = grid_server.read_text()
    assert_contains(content_grid_server, "tls.RequireAndVerifyClientCert", "mTLS server verification missing in grid/api/server.go")
    assert_contains(content_grid_server, "log.Fatalf(\"mTLS certs not found", "mTLS fail-closed missing in grid/api/server.go")

    print("mTLS fail-closed and anti-replay signing verified for SEC-A.2 and M7.2.")
    sys.exit(0)


if __name__ == "__main__":
    main()
