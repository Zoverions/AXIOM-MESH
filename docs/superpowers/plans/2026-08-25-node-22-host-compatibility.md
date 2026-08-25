# AXIOM-MESH Node 22 Host Compatibility Implementation Plan

> **For agentic workers:** Execute task-by-task with a failing-test-first cycle and keep protected production controls fail-closed.

**Goal:** Accept the exact deployed Node.js 22.23.2/npm 10.9.8 host tuple without widening the protected production lane.

**Architecture:** Extend the existing exact-schema source setup policy with a separately pinned compatibility profile. Classify runtime/package-manager combinations while leaving Node 24 production pins and Docker image unchanged.

**Tech Stack:** Node.js ESM, Node built-in test runner, JSON manifests/lockfiles, GitHub Actions.

**Spec:** docs/superpowers/specs/2026-08-25-node-22-host-compatibility-design.md

## Global Constraints

- Compatibility floor: Node.js 22.23.2 and npm 10.9.8.
- Primary floor: Node.js 24.14.0 and npm 11.0.0.
- Protected CI pin: Node.js 24.18.0.
- Candidate production image pin: Node.js 24.19.0.
- Zero third-party runtime dependencies; deny-by-default; no new authority path.

---

### Task 1: Fail-closed runtime compatibility

**Files:**
- Modify: mesh/test/setup.test.mjs
- Modify: mesh/config/setup.json
- Modify: mesh/src/setup.mjs
- Modify: package.json
- Modify: package-lock.json
- Modify: mesh/package.json
- Modify: mesh/package-lock.json

**Interfaces:**
- Consumes: validateSourceSetupPolicy(policy) and validateSourceSetupState(inputs).
- Produces: runtime.profile and assertProductionRuntime(nodeVersion).

- [ ] Add real-host, outdated-patch, Node-20, npm-10-on-24, production-rejection, and drift tests.
- [ ] Run node --test mesh/test/setup.test.mjs and observe expected new failures.
- [ ] Add exact pinned policy fields and profile-aware version validation.
- [ ] Update both package engine declarations and both lockfile engine declarations.
- [ ] Rerun setup tests and verify all old and new cases pass.

### Task 2: Production guard and documentation

**Files:**
- Modify: mesh/src/supervisor.mjs
- Modify: mesh/src/doctor.mjs
- Modify: .github/workflows/kernel.yml
- Modify: README.md
- Modify: docs/operations/AUTOMATED-SOURCE-SETUP.md

**Interfaces:**
- Consumes: assertProductionRuntime(nodeVersion) and the compatibility profile.
- Produces: protected supervisor refusal, accurate operator diagnostics, and a pinned Node 22 GitHub Actions lane.

- [ ] Call assertProductionRuntime before production-side effects.
- [ ] Update doctor diagnostics for both supported Node/npm tracks.
- [ ] Add a pinned Node 22.23.2 Actions compatibility job while preserving existing Node 24 protected jobs.
- [ ] Document the host profile and unchanged protected production boundary.
- [ ] Run setup tests, workflow-policy tests, JSON consistency checks, production-guard checks, and syntax validation.

