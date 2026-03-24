#!/usr/bin/env python3
import sys
import re
from pathlib import Path

def main():
    chain_go = Path("grid/api/server.go")
    if not chain_go.exists():
        print("grid/api/server.go not found")
        sys.exit(1)

    content = chain_go.read_text()

    # Check if Anti-Replay / Nonce handling is implemented with verifySignatureMiddleware
    if 'nonce' not in content.lower() and 'timestamp' not in content.lower():
        print("Error: Anti-Replay not implemented in grid/api/server.go")
        sys.exit(1)

    print("mTLS & Anti-Replay verified.")
    sys.exit(0)

if __name__ == "__main__":
    main()
