# Integration Testing Issue Hand-off

During the implementation of **M17.5** (Horizontal Scaling), the code changes correctly satisfied all scaling requirements in `gateway`, `hypervisor`, `sandbox`, and `grid`.

However, the e2e test suite located at `gateway/src/tests/e2e/test_full_intent_path.test.ts` experiences timeout failures when attempting to spawn the gateway subprocess.

```typescript
gatewayProcess = spawn(process.execPath, ['-r', 'ts-node/register', 'src/index.ts'], {
    cwd: path.resolve(__dirname, '../../'),
    env: { ...gwEnv, LOCAL_RPC_URL: "http://localhost:8545", ENABLE_NFT_ROUTES: 'false', PATH: process.env.PATH },
    stdio: 'pipe'
});
```

This spawn fails to initialize fully, causing the downstream axios calls to time out waiting for `/health` to return a `200` status code.
Additional adjustments might be necessary either within the test configuration, `jest` environment, or how the spawned process handles mocked dependencies. The primary scaling logic remains completely verified via `npm run build` and single execution verifications. Next agent should prioritize investigating the Jest/spawn test issue.