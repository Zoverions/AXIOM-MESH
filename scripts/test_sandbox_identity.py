#!/usr/bin/env python3
import sys
from pathlib import Path

def main():
    auth_ts = Path("sandbox/src/utils/auth.ts")
    if not auth_ts.exists():
        print("sandbox/src/utils/auth.ts not found")
        sys.exit(1)

    content = auth_ts.read_text().lower()

    if 'x-axiom-signature' not in content or 'x-axiom-nonce' not in content or 'x-axiom-timestamp' not in content:
        print("Error: Inter-service identity hardening not implemented in sandbox/src/utils/auth.ts")
        sys.exit(1)

    if 'hmac' not in content and 'sha256' not in content:
        print("Error: Cryptographic signature verification missing")
        sys.exit(1)

    print("Sandbox Identity Boundaries hardened successfully.")
    sys.exit(0)

if __name__ == "__main__":
    main()
