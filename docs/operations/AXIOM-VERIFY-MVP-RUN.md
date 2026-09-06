# AXIOM Verify how to run

Tracker: VERIFY-001. Status: experimental MVP scaffold only. Not a released product.

Package: packages/axiom-verify/. Scope: AXIOM-VERIFY-MVP-SCOPE.md.

## How to run

From repo root with supported Node:

- Run mesh/test/axiom-verify.test.mjs with the node test reporter.
- Invoke packages/axiom-verify/cli.mjs with a receipt JSON path and a Grid public PEM path.

Exit 0 PASS, 1 FAIL, 2 usage. Covered by mesh check in CI.

## Covered

1. Valid fixture plus public key yields PASS.
2. Altered bytes yield FAIL with human-readable reason.
3. Unknown schema id fails closed with explanation.
4. Report always includes integrity-versus-truth and avoids production-promotion language.

## Deferred

Continuity anchors, export bundle substitution, full Grid chain verification.

## Integrity versus truth

PASS means bytes digests signatures and declared scopes match under supplied keys and schemas. Not external-world truth.

## Non-claims

No product release, Mesh production promotion, TPM/TEE/BFT, Gateway/Hypervisor authority-client behavior, Hermes pin acceptance, or SEC-002 completion.
