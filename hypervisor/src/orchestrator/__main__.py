import argparse
import asyncio
from .network_agent_orchestrator import NetworkAgentOrchestrator

async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", default="public-pool")
    parser.add_argument("--spawn", help="Agent type to spawn")
    parser.add_argument("--pool", help="Pool to use (e.g. founder)")
    args = parser.parse_args()
    print(f"Starting orchestrator in mode {args.mode}")

    if args.spawn:
        # Mock global injections for CLI execution
        import builtins

        class MockFounderEntity:
            async def claimResources(self, quota):
                print(f"Mocked claimResources with quota {quota}")

        class MockSandbox:
            async def register_capsule(self, type, quota):
                print(f"Mocked register_capsule with type {type} and quota {quota}")
                class Capsule:
                    id = 'mock_id'
                return Capsule()

        class MockGrid:
            async def record_poer_registration(self, cid, purpose):
                print(f"Mocked record_poer_registration with cid {cid} and purpose {purpose}")

        builtins.founder_entity = MockFounderEntity() # type: ignore
        builtins.sandbox = MockSandbox() # type: ignore
        builtins.grid = MockGrid() # type: ignore

        orchestrator = NetworkAgentOrchestrator()
        is_founder = (args.pool == "founder")
        await orchestrator.spawn_agent(args.spawn, "substrate-stability research", is_founder)

    # keep alive logic if mode is public-pool
    if args.mode == "public-pool":
        print("Running continuous agent loop for public pool...")
        # Infinite loop for daemon
        import sys
        if not args.spawn:
            while True:
                await asyncio.sleep(3600)
        else:
            sys.exit(0)

if __name__ == "__main__":
    asyncio.run(main())
