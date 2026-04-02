# Grid Scope Firewall

**AXIOM-MESH Security & Scope Constraints**

This document formalizes the "Grid Scope Firewall", defining the strict boundaries of the Grid component within the AXIOM-MESH ecosystem.

## Core Principle: The Scope Gravity Risk
As the decentralized ledger, attestation engine, and peer-to-peer transport layer, the Grid naturally attracts responsibilities. To prevent it from becoming a central point of failure or an overpowered execution bottleneck, we enforce strict actionable constraints.

**The Golden Rule:**
> Grid may verify, attest, and synchronize — it must never decide intent or execution policy.

## Enforced Actionable Constraints

To implement this firewall, the following rules are strictly enforced at the API, network, and validation layers of the Grid:

### 1. Grid Rejects Unsigned Manifests
All capability manifests and routing profiles broadcasted or submitted to the Grid must be cryptographically signed by the asserting node. The Grid enforces this signature requirement before accepting, gossiping, or storing any manifest. Unsigned assertions are dropped immediately at the firewall layer (`/manifest`, `/peers/manifests`).

### 2. Grid Cannot Initiate Execution
The Grid is a passive synchronization and routing layer. It does not possess the capability to spontaneously schedule, dispatch, or execute workloads. Execution is entirely driven by external intent (e.g., via the Hypervisor scheduling layer). The Grid API restricts endpoints related to scheduling (`/schedule`) from initiating tasks, ensuring that only authenticated, properly authorized execution managers can trigger compute.

### 3. Grid Only Accepts Proof-Carrying Artifacts
When processing computational results (such as zkML inferences or cryptographic attestations), the Grid does not perform raw execution to verify correctness. It only accepts and verifies *proof-carrying artifacts* (e.g., Groth16 proofs, execution hashes). If an artifact is submitted without a valid accompanying zero-knowledge proof or verifiable hash, it is rejected by the firewall (`/zkml/verify`).

---

**Implementation Reference:**
These constraints are programmatically enforced and tested. Refer to `grid/api/firewall_test.go` for the explicit test cases validating these boundaries.
