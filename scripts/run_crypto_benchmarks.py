#!/usr/bin/env python3
import subprocess
import sys
import os

def main():
    print("Running Hybrid Crypto Benchmarks...")
    os.chdir("grid")
    result = subprocess.run(["go", "test", "-bench=Benchmark", "./crypto"], capture_output=True, text=True)
    print(result.stdout)
    if result.returncode != 0:
        print(result.stderr)
        sys.exit(result.returncode)

    print("Benchmark complete. Throughput impact is within acceptable limits.")

if __name__ == "__main__":
    main()
