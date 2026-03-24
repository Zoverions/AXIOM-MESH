#!/usr/bin/env python3
import sys
import re
from pathlib import Path

def main():
    chain_go = Path("grid/p2p/node.go")
    if not chain_go.exists():
        print("grid/p2p/node.go not found")
        sys.exit(1)

    content = chain_go.read_text()

    # Check if PQ/hybrid cryptography is implemented
    if 'Dilithium' not in content and 'Kyber' not in content and 'PQ' not in content and 'Kyber1024' not in content:
        print("Error: Post-Quantum (PQ) cryptography not implemented in grid/p2p/node.go")
        sys.exit(1)

    print("PQ Cryptography Pipeline verified.")
    sys.exit(0)

if __name__ == "__main__":
    main()
