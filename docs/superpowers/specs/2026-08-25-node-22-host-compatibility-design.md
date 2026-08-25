# AXIOM-MESH Node 22 Host Compatibility Design

## Approved outcome

Add a narrowly pinned compatibility lane for the observed Rebel/Plesk runtime Node.js 22.23.2 with bundled npm 10.9.8. Preserve the existing Node.js 24.18.0 protected CI pin, Node.js 24.19.0 candidate production image pin, zero-dependency installation, and fail-closed authority boundary.

## Runtime profiles

The package engine is >=22.23.2 <23 || >=24.14.0 <25. Primary profile accepts Node.js >=24.14.0 <25 with npm >=11.0.0 <12. Compatibility profile accepts Node.js >=22.23.2 <23 with npm >=10.9.8 <11 or the unchanged primary npm 11 lane. Unsupported Node.js 20, 21, 23, and 25, outdated Node.js 22 patches, outdated npm 10 patches, and npm 10 on Node 24 must fail closed.

## Policy and production separation

Add explicit pinned compatibility fields to mesh/config/setup.json; reject missing, unknown, weakened, or drifted values. Preserve .node-version and the production Dockerfile byte-for-byte. Add an exported production-runtime guard and invoke it before launching the production supervisor so Node 22 cannot enter the production supervisor path.

## Verification

First add failing built-in Node tests for the real host tuple, patch-floor rejection, package-manager separation, production rejection, and unchanged protected pins. Update both package manifests, both zero-dependency lockfiles, policy, setup validation, doctor diagnostics, operations documentation, and a pinned GitHub Actions Node 22 job. Preserve and rerun all existing setup and workflow-policy tests.

