# AXIOM Verify how to run

Tracker: VERIFY-001. Status: experimental MVP scaffold only. Not a released product.

Package: packages/axiom-verify/. Scope: AXIOM-VERIFY-MVP-SCOPE.md.

## How to run

From repo root with supported Node:

- Run mesh/test/axiom-verify.test.mjs with the node test reporter.
- Invoke packages/axiom-verify/cli.mjs:
  - receipt mode: `receipt <receipt.json> <grid-public.pem>` (receipt path shorthand still accepted)
  - continuity mode: `continuity <anchor.json> <chain-segment.json> <grid-public.pem>`
  - export mode: `export <manifest.json> <bundle-file> <grid-public.pem>`

Exit 0 PASS, 1 FAIL, 2 usage. Covered by mesh check in CI.

## Covered

1. Valid machine-receipt fixture plus public key yields PASS.
2. Altered receipt bytes yield FAIL with human-readable reason.
3. Continuity-anchor records (`axiom-grid-continuity-anchor.v1`) verified against a provided chain segment from genesis through the retained head — PASS only when the segment matches PROJECT-STATUS retained-head rules (equals or extends the retained head); gap, broken link, truncation, or head mismatch FAIL with human explanation.
4. Selective export / evidence-bundle digest checks — PASS on matching package bytes; any file substitution FAIL with human explanation.
5. Unknown schema id / unknown export format fails closed with explanation.
6. Report always includes integrity-versus-truth, sanitizes untrusted fields, and avoids production-promotion language.


## AXIOM One local preview helper

From an authenticated AXIOM One local preview Receipts surface, the owner can run the same offline Verify path through loopback `POST /local/verify` on `apps/axiom-one/server.mjs`. The helper imports `packages/axiom-verify` on the Node preview process (browser cannot use Node crypto) and returns the report JSON. It never calls Gateway as an authority client. UX shows PASS/FAIL, human reasons, integrity-versus-truth, and the raw report. Experimental only; not a released Verify product; no Mesh production promotion.

## Still deferred / out of this slice

Full live Grid sqlite chain verification (mesh verify-grid-chain / store path), encrypted recipient-export decrypt path as a product surface, TPM/TEE/BFT, and any production-promotion claim. Mesh helpers remain inspiration only; Verify stays isolated in packages/axiom-verify/ with no kernel authority client.

## Integrity versus truth

PASS means bytes digests signatures and declared scopes match under supplied keys and schemas. Not external-world truth.

## Non-claims

No product release, Mesh production promotion, TPM/TEE/BFT, Gateway/Hypervisor authority-client behavior, Hermes pin acceptance, or SEC-002 completion. Experimental MVP scaffold only.
