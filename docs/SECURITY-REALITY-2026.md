# AXIOM-MESH Security Reality Check (March 2026)

This is the implementation-accurate security posture and production-readiness gradecard for AXIOM-MESH as of **March 18, 2026**.

It distinguishes:
1. Controls currently implemented in code.
2. Interconnect security posture between pillars.
3. Production hardening required before financial/critical deployment.

---

## 1) Executive Gradecard

| Domain | Grade | Rationale |
|---|---:|---|
| Gateway edge security | **B-** | API-key auth exists for protected routes/WS; public route has local rate limit; no external WAF/DDOS layer in-repo. |
| Hypervisor policy controls | **A-** | Authenticated `/process`, strict Universal Consent Protocol (UCP) policy gate checks, AST checks for `/exec`, structured audit trail fields with WORM event sink. |
| Sandbox isolation | **A-** | Strong container runtime restrictions (`--network=none`, seccomp, apparmor, no-new-privileges, limits); fully enforces mandatory service-to-service `SANDBOX_API_KEY` token. |
| Grid API security | **C** | Strong domain validation for zkML payloads and bond rules; no pervasive API auth/TLS boundary in current HTTP server. |
| Inter-service interconnects | **C-** | Calls are mostly internal plain HTTP; partial auth boundaries now present on Hypervisor→Sandbox path; no mTLS/service mesh. |
| Auditability & governance trail | **B-** | Safety decision trail and ledger events exist; immutable WORM-grade audit sink and compliance workflow not complete. |
| Production readiness overall | **B- (non-financial prod)** | Suitable for controlled production environments with perimeter controls; not yet financial-grade/regulated-ready by default. |

---

## 2) Implemented Security Controls (Verified)

### Gateway
- Protected REST routes use API-key auth middleware.
- WebSocket connections enforce API-key validation.
- Public intent route (`/api/v1/intent/process/public`) is intentionally unauthenticated but rate-limited.
- Basic content/metadata sanitization is present in ingress processing.

### Hypervisor
- `/process` enforces bearer API key via signature verification middleware.
- Policy gate strictly evaluates the Universal Consent Protocol (UCP), ensuring explicit `consent_scope` properties are validated.
- `/exec` path applies AST denylist checks before sandbox handoff.
- Response payload includes structured `audit_trail.safety_decisions` metadata which is logged append-only via a WORM event sink (`audit.log`).
- Hypervisor automatically provides the mandatory `SANDBOX_API_KEY` Bearer authentication on remote sandbox execution calls.

### Sandbox
- Docker execution uses restrictive runtime flags (`--network=none`, CPU/memory/pids limits, cap-drop, seccomp, apparmor, readonly rootfs, tmpfs writes).
- External/high-risk code paths require proof fields (`ase_proof`, `zk_proof`) to align with the Agent-as-Firewall policy.
- `/execute` strictly mandates cross-service validation via `SANDBOX_API_KEY`.

### Grid
- zkML endpoint validates required fields, model commitment format, and vector/artifact size bounds.
- Bond/stake logic enforces minimums and status checks.
- Ledger supports persistence snapshot save/load and event reconcile primitives.

---

## 3) Interconnect Security Grade (Pillar-to-Pillar)

| Interconnect | Current state | Grade | Required to reach A |
|---|---|---:|---|
| Client → Gateway | API key on protected routes + WS; public route rate-limited | **B-** | Add managed WAF, bot defense, geo/IP reputation, distributed rate-limit, SIEM alerts |
| Gateway → Hypervisor | Bearer API key on `/process`, retries/backpressure | **B** | mTLS, request signing, per-route scoped service identity |
| Hypervisor → Sandbox | Hardened sandbox + strict bearer auth (`SANDBOX_API_KEY`) | **B+** | Mandatory mTLS + nonce/replay protection |
| Gateway → Grid | Internal HTTP calls, no strong API auth boundary by default | **C-** | Service authn/authz for Grid APIs, mTLS, signed mutation requests |
| Hypervisor ↔ Grid | URL-config driven, mixed trust assumptions | **C** | Formal service accounts, signed events, anti-replay, consensus-finality aware event consumer |
| Grid ↔ Chain (optional client) | Optional on-chain mirror calls | **C** | Production listener/replay with reorg handling, key isolation (HSM/KMS), finality SLOs |

---

## 4) Production Gaps (Blocking for Financial-Grade)

1. **No mandatory service-to-service mTLS across pillars.**
2. **Grid mutation endpoints are not consistently protected by strong service auth in current server layer.**
3. **No repository-native WORM/immutable audit sink policy with retention and legal hold controls.**
4. **No full chain listener/replay/finality subsystem with tested reorg semantics.**
5. **No formal secrets rotation/attestation workflow across all services in this repo alone.**

---

## 5) Build-Out Plan to Production (Interconnect First)

### Phase P0 (Immediate hardening)
- Enforce `SANDBOX_API_KEY` in all non-dev deployments.
- Remove unrestricted public ingress in production profile or enforce strict upstream gateway/WAF policy.
- Add network policy to restrict east-west traffic to explicit service pairs only.

### Phase P1 (Service identity)
- Introduce mTLS between Gateway, Hypervisor, Sandbox, and Grid.
- Add signed service-to-service requests (timestamp + nonce + signature) for mutation endpoints.
- Add Grid API auth boundary for all non-read routes.

### Phase P2 (Audit and chain reliability)
- Ship immutable audit event sink (append-only object store or ledger-backed WORM policy).
- Implement chain event listener with replay cursor, confirmation depth policy, and reorg rollback handlers.

### Phase P3 (Operational maturity)
- Add alerting SLOs: auth failures, sandbox denial rates, zk verification latency/error budget, and policy gate rejects.
- Add incident response runbooks and automated key rotation drills.

---

## 6) Deployment Label Guidance

- **Allowed today:** internal production, controlled enterprise pilots, and security-supervised deployments with external perimeter controls.
- **Not allowed today (without additional controls):** financial-grade, high-compliance, or adversarial internet exposure without mTLS + Grid auth boundary + immutable audit sink.

In short: AXIOM-MESH is strong relative to prototype agent stacks, but still requires interconnect hardening and audit immutability completion to claim full production-grade trust posture.
