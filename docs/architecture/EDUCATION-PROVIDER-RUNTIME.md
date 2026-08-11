# Education Provider Runtime Seam

## Status

This runtime seam is **adapter-foundation only**. It does not change `domains.education` from `adapter_required`, configure a default provider, or wire education into Hypervisor/Gateway admission.

`mesh/src/domain/education-provider-runtime.mjs` exists to prove that one reviewed provider capability can be injected without making the rest of the education domain available.

## Current routing

`executeEducationAction(actionName, input, { learnerRecordProvider })` always validates the pinned `axiom.education` domain contract first.

After validation:

- `education.learner.event.append` and `education.learner.progress.read` may route through an explicitly injected `education.learner-record` provider;
- curriculum actions remain `capability_unavailable`;
- tutor actions remain `capability_unavailable`;
- an absent learner-record provider preserves the existing exact `capability_unavailable` result.

This means partial adapter availability cannot silently promote unrelated education capabilities.

## Readiness description

`describeEducationProviderRuntime(...)` reports configured and unconfigured provider capabilities while retaining:

`domain_status: adapter_required`

Even when a learner-record provider is injected, the runtime description does not claim domain promotion or Hypervisor/Gateway admission.

## Authority boundary

The runtime seam grants no authority. The learner-record provider itself still requires injected consent and governed memory-reference assertions before a mutation adapter can run.

The next promotion work must bind those assertions to existing AXIOM kernel/deployment primitives and then exercise the provider through real admission. Until that evidence exists, this seam remains an isolated executable foundation.
