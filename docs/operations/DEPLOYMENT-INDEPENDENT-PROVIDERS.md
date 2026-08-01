# Deployment-independent secret and policy providers

**Updated:** 2026-07-29

**Status:** implemented for the single-host production candidate

**Applies to:** AXIOM-MESH `0.12.0-dev.1` supported development build

**Scope:** signed one-shot retrieval of data protection, API principal, internal
transport, policy-stack, and capability-registry resources before the
production supervisor starts

## Purpose

AXIOM Mesh services deliberately consume ordinary absolute file paths. That
boundary is small, auditable, compatible with container secret mounts, and
does not force a cloud or vault SDK into the trusted kernel. The provider
runtime extends that boundary without changing the four services.

An operator may continue using the provisioned file-backed production path.
When `AXIOM_PROVIDER_CONFIG` is selected, a host-side broker obtains a complete
startup generation from two independently identified providers:

- the **secret provider** supplies the 32-byte data-protection key, API
  principal registry, internal transport manifest and certificates, and all
  five runtime transport private keys;
- the **policy provider** supplies one to eight ordered policy layers and the
  capability registry.

The broker validates the provider executables, configured artifacts, provider
signatures, response freshness, deployment and request binding, exact resource
inventory, media types, byte limits, and content digests. It then validates the
resources with the same kernel validators used during normal startup. Only
after every check passes does it launch the unchanged production supervisor.

This is a provider protocol, not a bundled vendor custody product. A
deployment-owned adapter can retrieve values from Vault, a cloud secret
manager, an HSM-mediated system, an orchestrator secret API, or an offline
custodian. The adapter must return the defined signed response and must meet
the conformance checks in this document.

## Trust and authority boundary

The provider runtime has four distinct trust roles.

1. The operator owns the private runtime configuration and pins the exact
   provider executable, supporting artifacts, resource identifiers, and
   provider public keys.
2. The secret provider controls only the secret and internal-transport
   resource identifiers addressed to it.
3. The policy provider controls only the ordered policy and capability
   identifiers addressed to it.
4. The existing AXIOM services validate and use the materialized generation.

Secret and policy provider IDs must differ. Their pinned Ed25519 key sets may
not overlap. This prevents a configuration error from silently collapsing both
authorities into one signing identity. Each provider may pin up to four public
keys for a reviewed identity transition.

The broker invokes an absolute executable directly with `shell: false`.
The executable SHA-256 digest is mandatory. Up to sixteen supporting files,
such as an adapter script and its private configuration, may also be
digest-pinned. On Unix, neither the executable nor pinned artifacts may be
group or other writable.

Provider processes receive an intentionally empty environment except for the
protocol version, Windows process bootstrap state when required, and a small
explicit allowlist of workload-identity or proxy variables. Arbitrary inherited
variables, `NODE_OPTIONS`, library-loader variables, direct AXIOM credentials,
and unreviewed environment names are rejected.

The reference file adapter is useful for an orchestrator or custodian that
already mounts files. It is not a claim that local files are a remote vault.
Its private configuration and signing key must be private. Secret source files
must be owner-only on Unix. Every source file, including policy and public
certificate material, must not be group or other writable.

## Request and response protocol

The broker writes one canonical JSON request to provider standard input. It
does not use a shell, command-line secret value, temporary request file, or
network callback.

The `axiom-provider-request.v1` request contains:

- the expected provider and deployment IDs;
- a unique request ID;
- a random 32-byte base64url nonce;
- canonical issue and expiry timestamps;
- the exact ordered resource requests;
- for every resource, a broker-controlled alias, provider resource ID,
  classification, media type, and maximum byte count.

The provider writes one bounded JSON response to standard output. Standard
error is discarded because backend diagnostics can contain sensitive
information. A non-zero exit, timeout, malformed JSON, oversized response, or
missing response fails startup.

The `axiom-provider-response.v1` response contains:

- the exact provider ID, deployment ID, request ID, and request digest;
- canonical issue and expiry timestamps;
- exactly one response for every requested alias and no extras;
- a resource version, media type, canonical base64url content, byte count, and
  SHA-256 digest;
- an Ed25519 signature over the complete unsigned response.

The response must be current within the fixed clock-skew window. It must expire
before the request and may live for no more than sixty seconds. The request
digest binds the nonce and full inventory, so a prior response cannot be
replayed into a new startup. Resource content is covered by both its explicit
digest and the provider signature.

Resource versions are operator-visible rotation metadata. The reference
adapter uses `sha256:<content-digest>`, so a changed source necessarily changes
the version. A vendor adapter may use an immutable vault or secret-manager
version, provided it matches the identifier grammar and changes according to
the deployment's rotation policy.

## Exact startup inventory

The broker accepts only this inventory:

| Broker alias | Provider | Classification | Media type |
|---|---|---|---|
| `data_key` | secret | secret | `application/vnd.axiom.data-key` |
| `api_tokens` | secret | secret | `application/vnd.axiom.api-principals+json` |
| `transport.manifest` | secret | configuration | `application/vnd.axiom.transport-manifest+json` |
| `transport.ca_certificate` | secret | configuration | `application/x-pem-file` |
| `transport.<service>.certificate` | secret | configuration | `application/x-pem-file` |
| `transport.<service>.private_key` | secret | secret | `application/x-pem-file` |
| `policy.<index>` | policy | policy | `application/vnd.axiom.policy+json` |
| `capabilities` | policy | policy | `application/vnd.axiom.capabilities+json` |

`<service>` is exactly `gateway`, `grid`, `hypervisor`, `sandbox`, or
`supervisor`. One to eight policy layers are allowed. Resource IDs must be
globally unique, even across the two providers.

Before launch the broker proves:

- the data key is canonical base64url and decodes to exactly 32 bytes;
- the API principal registry is valid and non-empty;
- every policy layer passes the production policy validator;
- the capability registry passes its schema, required-capability, evidence,
  and status validator;
- every transport service has a matching active Ed25519 private key and
  certificate, a valid CA chain, the required SPIFFE identity, and the active
  manifest fingerprint.

There is no partial startup. One missing, extra, expired, oversized, malformed,
misclassified, wrongly signed, or semantically invalid resource rejects the
whole generation before the Grid, Sandbox, Hypervisor, or Gateway starts.

## Private generation lifecycle

The configured runtime directory must be absolute, private, and must not be a
filesystem root. Production should mount it as a size-bounded, owner-only
ephemeral filesystem such as a private `tmpfs`.

For each startup the broker:

1. verifies both provider command chains;
2. obtains and verifies both signed responses;
3. acquires an exclusive cross-process lease on the runtime root and rejects
   any stale or unexpected entry;
4. creates a unique `session-<uuid>` directory with mode `0700`;
5. writes every resource with mode `0600` into fixed broker-chosen paths;
6. runs all semantic validators;
7. writes a secret-free private receipt;
8. passes only the generated absolute paths to the ordinary supervisor;
9. forwards readiness, stop requests, and termination signals;
10. removes that exact session and releases the lease after shutdown or failed
    validation.

The runtime receipt contains provider IDs, provider-response digests, signing
key digests, aliases, versions, media types, byte counts, and content digests.
It does not contain resource IDs, values, provider standard error, adapter
backend messages, or private paths.

Normal shutdown and validation failure remove the generation. A host process
terminated with `SIGKILL` cannot run cleanup. The production runtime directory
therefore must be ephemeral and cleared by the process manager before a new
provider-supervised start. Do not place it on durable backup media. Do not
reuse a prior `session-*` directory.

## Configure the providers

Start from:

- [`mesh/config/provider-runtime.example.json`](../../mesh/config/provider-runtime.example.json);
- [`mesh/config/provider-secret-file-adapter.example.json`](../../mesh/config/provider-secret-file-adapter.example.json);
- [`mesh/config/provider-policy-file-adapter.example.json`](../../mesh/config/provider-policy-file-adapter.example.json).

The zero digests in the runtime example are placeholders and intentionally
cannot authorize a provider. Replace each with the SHA-256 digest of the exact
executable or artifact installed on the pilot host.

Create separate Ed25519 signing identities for the secret and policy
providers. Keep the private keys in the provider custody boundary. Place only
the public keys in the broker trust directory. Record public-key digests,
provider IDs, executable and artifact digests, resource identifiers, and the
deployment ID in the deployment trust inventory.

The runtime configuration itself must be owner-only on Unix. Use absolute
paths. Keep adapter configuration private. Never place secret values in the
runtime configuration, adapter arguments, inherited environment, provider
IDs, or resource IDs.

The built-in file adapter command is:

```text
node src/file-provider-adapter.mjs /absolute/path/to/adapter.json
```

It receives its request only on standard input. Invoking it without a broker
request is not a health check. A vendor adapter must implement the same
request/response schemas and signature rules.

## Start the production supervisor

Provider mode is intentionally mutually exclusive with direct source
variables. Set the ordinary non-secret production settings, then set:

```text
AXIOM_PROVIDER_CONFIG=/etc/axiom-provider/runtime.json
```

Leave all of these unset or empty:

```text
AXIOM_DATA_KEY
AXIOM_DATA_KEY_FILE
AXIOM_API_TOKENS
AXIOM_API_TOKENS_FILE
AXIOM_TRANSPORT_DIR
AXIOM_POLICY_PATH
AXIOM_POLICY_PATHS
AXIOM_CAPABILITIES_PATH
```

Start with:

```text
npm run provider:start
```

The provider supervisor emits a bounded preparation record containing only the
secret-free receipt fields. It then starts `src/supervisor.mjs`. The four AXIOM
services do not know which custody product supplied the files and do not gain
provider credentials or SDK authority.

If both provider mode and any direct credential or policy source are set, the
wrapper rejects the ambiguous startup. It does not pick one based on
precedence.

## Rotation and rollback

The provider protocol is one-shot at startup. It does not mutate live process
credentials and does not poll for changes.

For a controlled rotation:

1. stage the replacement in the external provider;
2. keep the prior version recoverable under the custodian's rollback policy;
3. update the provider version and content atomically;
4. stop the provider-supervised AXIOM host;
5. start a new provider generation;
6. verify the preparation receipt and service readiness;
7. prove the replacement credential or policy is active;
8. prove the retired credential or superseded policy is inactive;
9. retain the secret-free change record.

To rotate a provider signing identity, configure the current and replacement
public keys together for a bounded transition, deploy an adapter response
signed by the replacement, verify the observed signing-key digest, then remove
the retired public key in a second reviewed change. Secret and policy key sets
must remain disjoint.

Rollback is a new controlled startup that asks the provider for the approved
prior resource versions. Do not copy an old materialized session back into
place. The provider response must be fresh and bound to the new request.

## Failure response

Provider failures are deliberately low-detail at the AXIOM wrapper. Operators
receive a stable code such as:

- `provider_process_unavailable`;
- `provider_process_timeout`;
- `provider_process_failed`;
- `provider_response_too_large`;
- `provider_response_invalid`;
- `provider_response_expired`;
- `provider_signature_invalid`;
- `provider_resource_set_invalid`;
- `provider_resource_binding_invalid`;
- `provider_resource_digest_invalid`;
- `provider_executable_digest_invalid`;
- `provider_artifact_digest_invalid`;
- `provider_runtime_locked`;
- `provider_runtime_not_empty`.

Use the provider's protected operational logs inside its custody boundary for
backend diagnosis. Do not copy raw provider standard error into AXIOM logs or
incident chat.

On failure:

1. confirm that no AXIOM child service started;
2. confirm that the private runtime directory contains no active generation;
3. preserve the broker's stable error code and process-manager timestamps;
4. compare installed executable, artifact, and public-key digests with the
   approved trust inventory;
5. validate provider availability and response signing inside the provider
   boundary;
6. correct the provider or approve rollback;
7. perform a fresh startup rather than retrying a captured response.

A signature mismatch, unexpected resource version, artifact drift, or
unexplained policy change should be treated as a suspected custody or
supply-chain incident.

## Signed conformance drill

Run the disposable-host proof with an explicit empty workspace:

```text
npm run provider:drill -- /tmp/axiom-provider-conformance \
  > /tmp/axiom-provider-conformance-evidence.json
```

The drill provisions a real four-service production host, creates independent
secret and policy provider identities, and starts through the reference
adapter. It proves a baseline authenticated intent and captures both signed
provider receipts.

It then shuts down, confirms generation cleanup, rotates the API principal
registry, changes the policy to deny `system.echo`, and starts again. It proves
that the retired token is rejected, the replacement token is accepted, an
unchanged allowed action completes, the new deny rule is active, and the
resource versions changed with their content.

Finally it configures a mismatched policy-provider trust key. The wrapper
rejects startup before the four services become ready and leaves no runtime
generation. The Grid identity signs the resulting
`axiom-provider-conformance-evidence.v1` artifact. Protected CI uploads it for
ninety days and binds it into the incident tabletop as the
`provider_runtime` control.

The evidence contains provider IDs, public signing-key digests, response
digests, resource aliases, versions, media types, byte counts, and content
digests. It is scanned against the actual data key, both API tokens, and both
provider private keys before signing.

## Provider adapter conformance

A deployment adapter is conformant only when it can pass all of the following
with its real workload identity and custody backend:

- absolute digest-pinned executable with no shell;
- bounded completion within the configured timeout;
- no secret values in arguments, inherited environment, stderr, logs, IDs, or
  evidence;
- exact provider and deployment addressing;
- exact request digest and nonce binding;
- canonical timestamps and short response expiry;
- exact resource set with no omission, duplication, or addition;
- exact classification and media-type agreement;
- canonical base64url resource content;
- byte count and SHA-256 agreement;
- valid signature under an independently pinned Ed25519 key;
- immutable or auditable resource version;
- fail-closed behavior when the backend, signer, or resource is unavailable;
- successful private-generation cleanup after normal shutdown.

The pilot dossier should include the adapter version, executable and artifact
digests, backend authorization policy, workload-identity inventory, public-key
rotation procedure, timeout and availability targets, audit-log retention, and
evidence from at least two rotation and rollback exercises.

## Pilot repetition and non-claims

Repository evidence proves the protocol and the reference file adapter on
disposable hosts. It does not prove:

- that any particular Vault, cloud secret manager, HSM, KMS, CSI driver, or
  orchestrator adapter is correctly configured;
- live refresh without restart;
- automatic rollback;
- provider high availability or disaster recovery;
- secure deletion guarantees from a durable filesystem;
- protection against a compromised provider executable or authorized provider
  signer;
- independent custody, compliance, or penetration testing;
- multi-host rollout coordination;
- completion of SEC-002.

Before production promotion, repeat the drill using the pilot's actual provider
adapter, workload identity, network route, ephemeral runtime filesystem,
provider key custody, policy authority, rotation process, and incident roster.
Review the backend authorization policy independently and remediate every
critical or high finding.
