import sys
import re
from pathlib import Path

def main():
    api_dir = Path("grid/api")
    all_good = True

    if not api_dir.exists():
        print("grid/api directory not found")
        sys.exit(1)

    for f in api_dir.glob("*.go"):
        content = f.read_text()
        for match in re.finditer(r'mux\.HandleFunc\("([^"]+)",\s*(.*)', content):
            route = match.group(1)
            handler = match.group(2)
            if "verifySignatureMiddleware" not in handler and "ws" not in route: # websockets might have different auth
                print(f"Route {route} in {f.name} is NOT protected by verifySignatureMiddleware!")
                all_good = False

    if not all_good:
        sys.exit(1)

    print("Grid authz checks passed.")

if __name__ == "__main__":
    main()
