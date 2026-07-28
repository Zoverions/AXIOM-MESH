#!/usr/bin/env python3
import sys
import os

def check():
    print("Checking Hypervisor Placeholder Semantics...")

    server_file = "hypervisor/src/api/server.py"
    if not os.path.exists(server_file):
        print(f"Error: {server_file} not found.")
        sys.exit(1)

    with open(server_file, 'r') as f:
        content = f.read()
        if "Mock confidence" in content:
            print(f"Error: {server_file} contains mock confidence and provenance logic.")
            sys.exit(1)

    print("Hypervisor fallbacks verification passed.")

if __name__ == "__main__":
    check()
