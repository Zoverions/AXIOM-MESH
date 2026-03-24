#!/usr/bin/env python3
import os
import subprocess
import sys

def test_sandbox_broker():
    print("Testing Sandbox Broker for execution engine missing error...")

    # Run the jest tests for the broker
    os.chdir('sandbox')
    result = subprocess.run(['npm', 'test', '--', 'Broker.test.ts'], capture_output=True, text=True)

    if result.returncode != 0:
        print("Sandbox broker tests failed.")
        print(result.stdout)
        print(result.stderr)
        sys.exit(1)

    # verify that throw new Error("Execution engine missing: cannot fallback to mock."); is in the code
    with open('src/broker/Broker.ts', 'r') as f:
        content = f.read()
        if 'throw new Error("Execution engine missing: cannot fallback to mock.");' not in content:
            print("Broker.ts must throw error when execution engine is missing.")
            sys.exit(1)

    print("Sandbox broker verification passed.")

if __name__ == '__main__':
    test_sandbox_broker()
