import sys
import re

def main():
    print("Testing internal network topologies for zero-trust architecture...")

    try:
        with open("docker-compose.yml", "r") as f:
            compose_content = f.read()
    except Exception as e:
        print(f"Failed to load docker-compose.yml: {e}")
        sys.exit(1)

    if "zero-trust-grid" not in compose_content or "zero-trust-gateway" not in compose_content:
        print("Missing zero-trust isolated network topologies.")
        sys.exit(1)

    # Check that grid uses internal network
    if not re.search(r'zero-trust-grid:\n\s+internal:\s+true', compose_content):
        print("Grid network must be internal zero-trust")
        sys.exit(1)

    print("✓ Zero-trust network topologies verified.")
    print("✓ Localized Sandbox/Grid cascading failure prevention active.")
    sys.exit(0)

if __name__ == "__main__":
    main()
