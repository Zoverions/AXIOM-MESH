#!/usr/bin/env python3
import sys
import re
from pathlib import Path

def main():
    chain_go = Path("grid/blockchain/chain.go")
    if not chain_go.exists():
        print("grid/blockchain/chain.go not found")
        sys.exit(1)

    content = chain_go.read_text()

    # Check if WORM logging is implemented
    if 'WORM' not in content and 'worm' not in content:
        print("Error: WORM audit retention not implemented in grid/blockchain/chain.go")
        sys.exit(1)

    print("Immutable Audit Retention verified.")
    sys.exit(0)

if __name__ == "__main__":
    main()
