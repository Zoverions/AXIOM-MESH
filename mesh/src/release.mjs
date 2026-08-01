import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { canonicalJson, digestObject, sha256, ValidationError } from './lib/canonical.mjs';
import { MESH_ROOT } from './lib/config.mjs';
import { validateCapabilityRegistry } from './check-registry.mjs';
import { MIGRATIONS, migrationChecksum } from './grid/migrations.mjs';
import { validatePolicy } from './lib/policy.mjs';
import { validateBackupRetentionPolicy } from './backup-maintenance.mjs';
import {
  normalizeLineEndings,
  renderCapabilityStatus,
  verifyRegistryMarkers
} from './status.mjs';
import { CANONICAL_DOCUMENTS, verifyCanonicalDocumentation } from './check-docs.mjs';
import { validateCredentialRevocationLedger } from './credential-history-audit.mjs';
import { validateIncidentResponsePolicy } from './incident-response.mjs';
import { validateResilienceDrillPolicy } from './resilience-drill.mjs';
import { validateTelemetryRoutingPolicy } from './telemetry-relay.mjs';
import { validateSourceSetupState } from './setup.mjs';
import {
  validateComposeNetworkSegmentation,
  validateServiceNetworkPolicy,
  validateServiceRouteImplementation
} from './lib/service-network-policy.mjs';
import {
  validateGatewayClientContract,
  validateGatewayClientContractSchema,
  validateGatewayClientRouteImplementation
} from './lib/gateway-client-contract.mjs';

const REPOSITORY_ROOT = dirname(MESH_ROOT);
const SUPPORTED_DEPENDENCY_MANIFESTS = new Set([
  'package.json',
  'package-lock.json',
  'mesh/package.json',
  'mesh/package-lock.json'
]);
const UNSUPPORTED_RUNTIME_PREFIXES = [
  'certs/',
  'cli/',
  'config/',
  'evidence/',
  'gateway/',
  'grid/',
  'hypervisor/',
  'kernel/',
  'live-installer/',
  'sandbox/',
  'schemas/',
  'scripts/',
  'services/',
  'shared/',
  'skills/',
  'tests/',
  'website/'
];

export async function verifyReleaseReadiness() {
  const trackedPaths = git(['ls-files']).split(/\r?\n/).filter(Boolean);
  const sourceBoundary = validateSupportedSourceBoundary(trackedPaths);
  const paths = {
    registry: join(MESH_ROOT, 'config', 'capabilities.json'),
    policy: join(MESH_ROOT, 'config', 'policy.json'),
    backupRetentionPolicy: join(
      MESH_ROOT,
      'config',
      'backup-retention.json'
    ),
    credentialRevocations: join(
      MESH_ROOT,
      'config',
      'credential-revocations.json'
    ),
    incidentResponsePolicy: join(
      MESH_ROOT,
      'config',
      'incident-response.json'
    ),
    telemetryRoutingPolicy: join(
      MESH_ROOT,
      'config',
      'telemetry-routing.json'
    ),
    resilienceDrillPolicy: join(
      MESH_ROOT,
      'config',
      'resilience-drill.json'
    ),
    setupPolicy: join(MESH_ROOT, 'config', 'setup.json'),
    serviceNetworkPolicy: join(
      MESH_ROOT,
      'config',
      'service-network-policy.json'
    ),
    gatewayClientContract: join(
      MESH_ROOT,
      'config',
      'gateway-client-contract.json'
    ),
    gatewayClientSchema: join(
      MESH_ROOT,
      'config',
      'gateway-client-contract.schema.json'
    ),
    gatewaySource: join(MESH_ROOT, 'src', 'gateway', 'server.mjs'),
    nodeVersionPin: join(MESH_ROOT, '.node-version'),
    package: join(MESH_ROOT, 'package.json'),
    lock: join(MESH_ROOT, 'package-lock.json'),
    rootPackage: join(REPOSITORY_ROOT, 'package.json'),
    rootLock: join(REPOSITORY_ROOT, 'package-lock.json'),
    operatorSurface: join(MESH_ROOT, 'config', 'operator-surface.json'),
    status: join(REPOSITORY_ROOT, 'docs', 'rebuild', 'STATUS.md'),
    rollback: join(REPOSITORY_ROOT, 'docs', 'rebuild', 'ROLLBACK.md'),
    dockerfile: join(MESH_ROOT, 'Dockerfile'),
    dockerignore: join(MESH_ROOT, '.dockerignore'),
    compose: join(MESH_ROOT, 'compose.production.yml'),
    unitCompose: join(MESH_ROOT, 'compose.units.yml'),
    productionDocs: join(MESH_ROOT, 'PRODUCTION.md'),
    workflow: join(REPOSITORY_ROOT, '.github', 'workflows', 'kernel.yml'),
    benchmarkWorkflow: join(
      REPOSITORY_ROOT,
      '.github',
      'workflows',
      'chain-verification-benchmark.yml'
    ),
    repositoryIgnore: join(REPOSITORY_ROOT, '.gitignore')
  };
  const [
    registry,
    policy,
    backupRetentionPolicy,
    credentialRevocations,
    incidentResponsePolicy,
    telemetryRoutingPolicy,
    resilienceDrillPolicy,
    setupPolicy,
    serviceNetworkPolicy,
    gatewayClientContract,
    gatewayClientSchema,
    gatewaySource,
    nodeVersionPin,
    packageJson,
    lock,
    rootPackage,
    rootLock,
    operatorSurface,
    status,
    rollback,
    dockerfile,
    dockerignore,
    compose,
    unitCompose,
    productionDocs,
    workflow,
    repositoryIgnore
  ] = await Promise.all([
    readJson(paths.registry),
    readJson(paths.policy),
    readJson(paths.backupRetentionPolicy),
    readJson(paths.credentialRevocations),
    readJson(paths.incidentResponsePolicy),
    readJson(paths.telemetryRoutingPolicy),
    readJson(paths.resilienceDrillPolicy),
    readJson(paths.setupPolicy),
    readJson(paths.serviceNetworkPolicy),
    readJson(paths.gatewayClientContract),
    readJson(paths.gatewayClientSchema),
    readFile(paths.gatewaySource, 'utf8'),
    readFile(paths.nodeVersionPin, 'utf8'),
    readJson(paths.package),
    readJson(paths.lock),
    readJson(paths.rootPackage),
    readJson(paths.rootLock),
    readJson(paths.operatorSurface),
    readFile(paths.status, 'utf8'),
    readFile(paths.rollback, 'utf8'),
    readFile(paths.dockerfile, 'utf8'),
    readFile(paths.dockerignore, 'utf8'),
    readFile(paths.compose, 'utf8'),
    readFile(paths.unitCompose, 'utf8'),
    readFile(paths.productionDocs, 'utf8'),
    readFile(paths.workflow, 'utf8'),
    readFile(paths.repositoryIgnore, 'utf8')
  ]);
  const registryResult = validateCapabilityRegistry(registry);
  validatePolicy(policy);
  validateBackupRetentionPolicy(backupRetentionPolicy);
  const credentialRevocation = validateCredentialRevocationLedger(
    credentialRevocations
  );
  const incidentResponse = validateIncidentResponsePolicy(
    incidentResponsePolicy
  );
  const telemetryRouting = validateTelemetryRoutingPolicy(
    telemetryRoutingPolicy
  );
  const resilienceDrill = validateResilienceDrillPolicy(
    resilienceDrillPolicy
  );
  const setup = validateSourceSetupState({
    policy: setupPolicy,
    nodeVersion: setupPolicy.runtime.ci_version,
    npmVersion: setupPolicy.package_manager.minimum_version,
    nodeVersionPin,
    rootPackage,
    rootLock,
    kernelPackage: packageJson,
    kernelLock: lock,
    dockerfile,
    workflow
  });
  const serviceNetwork = validateServiceNetworkPolicy(
    serviceNetworkPolicy
  );
  const serviceNetworkDeployment = validateComposeNetworkSegmentation(
    unitCompose,
    serviceNetworkPolicy
  );
  const serviceNetworkRoutes = validateServiceRouteImplementation({
    policy: serviceNetworkPolicy,
    sources: {
      grid: await readFile(join(MESH_ROOT, 'src', 'grid', 'server.mjs'), 'utf8'),
      hypervisor: await readFile(
        join(MESH_ROOT, 'src', 'hypervisor', 'server.mjs'),
        'utf8'
      ),
      sandbox: await readFile(
        join(MESH_ROOT, 'src', 'sandbox', 'server.mjs'),
        'utf8'
      )
    }
  });
  const gatewayClient = validateGatewayClientContract(gatewayClientContract);
  const gatewayClientSchemaResult = validateGatewayClientContractSchema(
    gatewayClientSchema
  );
  const gatewayClientRoutes = validateGatewayClientRouteImplementation({
    contract: gatewayClientContract,
    source: gatewaySource
  });
  const gatewayClientEvidence = {
    schema: gatewayClient.schema,
    contract_digest: gatewayClient.contract_digest,
    json_schema_digest: gatewayClientSchemaResult.schema_digest,
    routes: gatewayClient.routes,
    implemented_routes: gatewayClientRoutes.implemented_routes,
    stable_errors: gatewayClient.stable_errors,
    same_origin_only: gatewayClientContract.boundary.request_target
      === 'same-origin-relative-path',
    direct_service_access: gatewayClientContract.boundary
      .direct_internal_service_access
  };
  if (packageJson.version !== registry.kernel_version || lock.version !== packageJson.version) {
    throw new ValidationError('Package, lockfile, and capability registry versions must match');
  }
  if (lock.packages?.['']?.version !== packageJson.version) {
    throw new ValidationError('Lockfile root package version is stale');
  }
  if (
    rootPackage.version !== packageJson.version
    || rootLock.version !== packageJson.version
    || rootLock.packages?.['']?.version !== packageJson.version
  ) {
    throw new ValidationError('Repository command-surface package metadata is stale');
  }
  await verifyOperatorSurface(operatorSurface, {
    packageJson,
    policy,
    gatewaySource: await readFile(join(MESH_ROOT, 'src', 'gateway', 'server.mjs'), 'utf8'),
    executorSource: await readFile(join(MESH_ROOT, 'src', 'sandbox', 'executor.mjs'), 'utf8'),
    operatorDocs: await readFile(join(MESH_ROOT, 'README.md'), 'utf8')
  });
  const documentation = await verifyCanonicalDocumentation(REPOSITORY_ROOT);
  const dependencies = Object.keys(lock.packages ?? {}).filter(key => key !== '');
  if (dependencies.length) {
    throw new ValidationError(`Kernel runtime lock contains unexpected packages: ${dependencies.join(', ')}`);
  }
  const rootDependencies = Object.keys(rootLock.packages ?? {}).filter(key => key !== '');
  if (rootDependencies.length) {
    throw new ValidationError(
      `Repository command-surface lock contains unexpected packages: ${rootDependencies.join(', ')}`
    );
  }
  if (normalizeLineEndings(status) !== normalizeLineEndings(renderCapabilityStatus(registry))) {
    throw new ValidationError('Generated capability status is stale');
  }
  await verifyRegistryMarkers(REPOSITORY_ROOT, registry);
  if (!rollback.includes('## Rollback procedure') || !rollback.includes('## Migration compatibility')) {
    throw new ValidationError('Rollback plan is incomplete');
  }
  const deployment = {
    ...verifyProductionDeployment({
      dockerfile,
      dockerignore,
      compose,
      unitCompose,
      productionDocs,
      packageJson,
      backupRetentionPolicy,
      credentialRevocations,
      incidentResponsePolicy,
      telemetryRoutingPolicy,
      resilienceDrillPolicy,
      workflow,
      repositoryIgnore
    }),
    service_network_policy: {
      schema: serviceNetwork.schema,
      policy_digest: serviceNetwork.policy_digest,
      default_action: serviceNetwork.default_action,
      segments: serviceNetwork.segments,
      flows: serviceNetwork.flows,
      routes: serviceNetwork.routes,
      implemented_routes: serviceNetworkRoutes.implemented_routes,
      compose_segmentation_sha256: serviceNetworkDeployment.compose_sha256
    }
  };
  for (const capability of registry.capabilities.filter(item => item.status === 'implemented')) {
    for (const evidence of capability.evidence) {
      await readFile(join(REPOSITORY_ROOT, evidence));
    }
  }
  const migrationEvidence = MIGRATIONS.map((migration, index) => {
    if (migration.version !== index + 1) throw new ValidationError('Database migrations must be contiguous');
    return {
      version: migration.version,
      name: migration.name,
      checksum: migrationChecksum(migration)
    };
  });
  const activeWorkflows = (await readdir(join(REPOSITORY_ROOT, '.github', 'workflows')))
    .filter(name => name.endsWith('.yml') || name.endsWith('.yaml'))
    .sort();
  const governedWorkflows = [
    'chain-verification-benchmark.yml',
    'kernel.yml'
  ];
  if (canonicalJson(activeWorkflows) !== canonicalJson(governedWorkflows)) {
    throw new ValidationError('Unsupported legacy GitHub workflows are still active');
  }
  const inputs = await sourceInputs([
    join(REPOSITORY_ROOT, 'packages'),
    join(MESH_ROOT, 'src'),
    join(MESH_ROOT, 'config'),
    join(MESH_ROOT, 'test'),
    join(MESH_ROOT, 'README.md'),
    join(MESH_ROOT, '.node-version'),
    paths.package,
    paths.lock,
    paths.rootPackage,
    paths.rootLock,
    join(REPOSITORY_ROOT, 'README.md'),
    join(REPOSITORY_ROOT, 'CONSTITUTION.md'),
    join(REPOSITORY_ROOT, 'docs', 'rebuild', 'PRODUCT-DEFINITION.md'),
    join(REPOSITORY_ROOT, 'docs', 'rebuild', 'REQUIREMENTS.md'),
    join(REPOSITORY_ROOT, 'docs', 'rebuild', 'SOURCE-TRACEABILITY.md'),
    paths.status,
    paths.rollback,
    paths.dockerfile,
    paths.dockerignore,
    paths.compose,
    paths.unitCompose,
    paths.productionDocs,
    paths.workflow,
    paths.benchmarkWorkflow,
    paths.repositoryIgnore,
    ...CANONICAL_DOCUMENTS.map(path => join(REPOSITORY_ROOT, path))
  ]);
  const commit = git(['rev-parse', 'HEAD']);
  const dirty = git(['status', '--porcelain']).length > 0;
  const generatedAt = new Date().toISOString();
  const sbom = {
    spdxVersion: 'SPDX-2.3',
    dataLicense: 'CC0-1.0',
    SPDXID: 'SPDXRef-DOCUMENT',
    name: `AXIOM-MESH-kernel-${packageJson.version}`,
    documentNamespace: `https://github.com/Zoverions/AXIOM-MESH/spdx/${packageJson.version}/${commit}`,
    creationInfo: {
      created: generatedAt,
      creators: ['Tool: mesh/src/release.mjs']
    },
    packages: [
      {
        name: packageJson.name,
        SPDXID: 'SPDXRef-Package-kernel',
        versionInfo: packageJson.version,
        downloadLocation: 'NOASSERTION',
        filesAnalyzed: false,
        supplier: 'NOASSERTION'
      },
      {
        name: deployment.base_image,
        SPDXID: 'SPDXRef-Package-node-base-image',
        versionInfo: deployment.base_image.replace(/^node:/, ''),
        downloadLocation: 'https://hub.docker.com/_/node',
        filesAnalyzed: false,
        supplier: 'Organization: Node.js Docker Official Image',
        checksums: [{
          algorithm: 'SHA256',
          checksumValue: deployment.base_digest.replace(/^sha256:/, '')
        }]
      }
    ],
    relationships: [{
      spdxElementId: 'SPDXRef-Package-kernel',
      relationshipType: 'DEPENDS_ON',
      relatedSpdxElement: 'SPDXRef-Package-node-base-image'
    }]
  };
  const provenance = {
    format: 'axiom-release-evidence.v1',
    generated_at: generatedAt,
    kernel_version: packageJson.version,
    source: {
      commit,
      dirty
    },
    verification: {
      command: 'npm run check',
      required_before_evidence_write: true
    },
    source_boundary: sourceBoundary,
    documentation,
    registry: {
      digest: registryResult.digest,
      verified_at: registry.verified_at,
      counts: registryResult.counts
    },
    policy_digest: digestObject(policy),
    credential_revocation: credentialRevocation,
    incident_response: incidentResponse,
    telemetry_routing: telemetryRouting,
    resilience_drill: resilienceDrill,
    setup,
    service_network: deployment.service_network_policy,
    gateway_client: gatewayClientEvidence,
    operator_surface_digest: digestObject(operatorSurface),
    deployment,
    migrations: migrationEvidence,
    rollback: {
      path: relative(REPOSITORY_ROOT, paths.rollback),
      sha256: sha256(rollback)
    },
    inputs
  };
  return {
    valid: true,
    version: packageJson.version,
    commit,
    dirty,
    registry: registryResult,
    setup,
    service_network: deployment.service_network_policy,
    gateway_client: gatewayClientEvidence,
    deployment,
    documentation,
    source_boundary: sourceBoundary,
    migrations: migrationEvidence.length,
    inputs: inputs.length,
    sbom,
    provenance
  };
}

export function verifyProductionDeployment({
  dockerfile,
  dockerignore,
  compose,
  unitCompose,
  productionDocs,
  packageJson,
  backupRetentionPolicy,
  credentialRevocations,
  incidentResponsePolicy,
  telemetryRoutingPolicy,
  resilienceDrillPolicy,
  workflow,
  repositoryIgnore
}) {
  validateBackupRetentionPolicy(backupRetentionPolicy);
  validateCredentialRevocationLedger(credentialRevocations);
  validateIncidentResponsePolicy(incidentResponsePolicy);
  validateTelemetryRoutingPolicy(telemetryRoutingPolicy);
  validateResilienceDrillPolicy(resilienceDrillPolicy);
  const pinnedBase = dockerfile.match(
    /^FROM (node:24\.18\.0-alpine3\.23)@(sha256:[a-f0-9]{64})$/m
  );
  if (!pinnedBase) {
    throw new ValidationError('Production Dockerfile must use the approved digest-pinned Node.js base');
  }
  for (const required of [
    'USER 10001:10001',
    'HEALTHCHECK ',
    'AXIOM_REQUIRE_DENY_EGRESS=true',
    'AXIOM_INTERNAL_TLS=true',
    'AXIOM_TRANSPORT_DIR=/run/secrets/transport',
    'ENTRYPOINT ["node", "src/supervisor.mjs"]'
  ]) {
    if (!dockerfile.includes(required)) {
      throw new ValidationError(`Production Dockerfile is missing: ${required}`);
    }
  }
  if (/FROM\s+\S+:latest\b/i.test(dockerfile)) {
    throw new ValidationError('Production Dockerfile may not use a latest tag');
  }
  for (const excluded of ['.data', 'node_modules', 'test', 'production-data', 'production-secrets']) {
    if (!dockerignore.split(/\r?\n/).includes(excluded)) {
      throw new ValidationError(`Production Docker context does not exclude: ${excluded}`);
    }
  }
  for (const excluded of [
    'production-data/',
    'production-secrets/',
    'api-tokens.json',
    'operator.token',
    'telemetry-relay.token',
    'telemetry-destinations.json',
    '*.key.pem',
    '*.token',
    'telemetry-relay-state/'
  ]) {
    if (!repositoryIgnore.split(/\r?\n/).includes(excluded)) {
      throw new ValidationError(`Repository ignore policy does not exclude: ${excluded}`);
    }
  }
  for (const required of [
    `image: axiom-mesh-kernel:${packageJson.version}`,
    'user: "10001:10001"',
    'read_only: true',
    'cap_drop:',
    '- ALL',
    'no-new-privileges:true',
    'pids_limit:',
    'mem_limit:',
    'cpus:',
    'network_mode: "none"',
    'AXIOM_DATA_KEY_FILE: /run/secrets/data-protection.key',
    'AXIOM_API_TOKENS_FILE: /run/secrets/api-tokens.json',
    'AXIOM_INTERNAL_TLS: "true"',
    'AXIOM_TRANSPORT_DIR: /run/secrets/transport',
    'AXIOM_REQUIRE_DENY_EGRESS: "true"',
    'AXIOM_GATEWAY_HOST: 127.0.0.1',
    'AXIOM_GATEWAY_SOCKET: /run/axiom-mesh/gateway.sock',
    'source: ${AXIOM_GATEWAY_SOCKET_DIR_HOST:?set AXIOM_GATEWAY_SOCKET_DIR_HOST}',
    'target: /run/axiom-mesh',
    'source: ${AXIOM_TRANSPORT_DIR_HOST:?set AXIOM_TRANSPORT_DIR_HOST}/ca-cert.pem',
    'target: /run/secrets/transport/ca-cert.pem',
    'source: ${AXIOM_TRANSPORT_DIR_HOST:?set AXIOM_TRANSPORT_DIR_HOST}/manifest.json',
    'target: /run/secrets/transport/manifest.json',
    'source: ${AXIOM_TRANSPORT_DIR_HOST:?set AXIOM_TRANSPORT_DIR_HOST}/services',
    'target: /run/secrets/transport/services',
    'healthcheck:',
  ]) {
    if (!compose.includes(required)) {
      throw new ValidationError(`Production compose policy is missing: ${required}`);
    }
  }
  if (
    /privileged:\s*true/.test(compose)
    || /^\s{4}read_only:\s*false\s*$/m.test(compose)
    || /network_mode:\s*host/.test(compose)
    || /pid:\s*host/.test(compose)
  ) {
    throw new ValidationError(
      'Production compose policy contains a forbidden host-privilege or read_only setting'
    );
  }
  for (const required of [
    `image: axiom-mesh-kernel:${packageJson.version}`,
    'gateway:',
    'grid:',
    'hypervisor:',
    'sandbox:',
    'entrypoint: ["node", "src/gateway-unit.mjs"]',
    'entrypoint: ["node", "src/grid/server.mjs"]',
    'entrypoint: ["node", "src/hypervisor/server.mjs"]',
    'entrypoint: ["node", "src/sandbox/server.mjs"]',
    'user: "10001:10001"',
    'read_only: true',
    'cap_drop:',
    '- ALL',
    'no-new-privileges:true',
    'AXIOM_INTERNAL_TLS: "true"',
    'AXIOM_HYPERVISOR_URL: https://hypervisor:8081',
    'AXIOM_SANDBOX_URL: https://sandbox:8082',
    'AXIOM_GRID_URL: https://grid:8083',
    'source: ${AXIOM_UNITS_DIR_HOST:?set AXIOM_UNITS_DIR_HOST}/gateway/data',
    'source: ${AXIOM_UNITS_DIR_HOST:?set AXIOM_UNITS_DIR_HOST}/grid/data',
    'source: ${AXIOM_UNITS_DIR_HOST:?set AXIOM_UNITS_DIR_HOST}/hypervisor/data',
    'source: ${AXIOM_UNITS_DIR_HOST:?set AXIOM_UNITS_DIR_HOST}/sandbox/data',
    'AXIOM_DATA_KEY_FILE: /run/secrets/data-protection.key',
    'AXIOM_API_TOKENS_FILE: /run/secrets/api-tokens.json',
    'internal: true',
    'driver: bridge'
  ]) {
    if (!unitCompose.includes(required)) {
      throw new ValidationError(
        `Independent-unit compose policy is missing: ${required}`
      );
    }
  }
  if (
    /privileged:\s*true/.test(unitCompose)
    || /network_mode:\s*host/.test(unitCompose)
    || /pid:\s*host/.test(unitCompose)
    || /^\s*ports:\s*$/m.test(unitCompose)
  ) {
    throw new ValidationError(
      'Independent-unit compose policy contains a forbidden host boundary'
    );
  }
  if (/^\s*ports:\s*$/m.test(compose) || /^\s*networks:\s*$/m.test(compose)) {
    throw new ValidationError(
      'Production compose policy must not publish ports or attach networks'
    );
  }
  for (const boundary of [
    'four supervised Node.js processes',
    '`operations:read`',
    'Compose enforces deny-egress',
    '40 measured',
    'Host mode does not enforce the candidate two-CPU ceiling',
    'all four Ed25519 service identities',
    'dual-signed lineage',
    'does **not** rotate',
    'not evidence of a live deployment',
    'recoverable quarantine',
    'credential-history audit',
    'automated incident tabletop',
    'host-side telemetry relay',
    'request-pressure and dependency-loss',
    'cross-process port-block lease',
    'mutually authenticated TLS 1.3',
    'independently deployable units',
    '38 exact caller/destination/method/route',
    'admitted-node discovery and scheduling',
    'operator-approved online causal exchange',
    'Deployment-independent provider startup',
    'Automated source setup',
    'Pilot dossier verification',
    'Offline pilot evidence package verification',
    'type-specific detail contract'
  ]) {
    if (!productionDocs.includes(boundary)) {
      throw new ValidationError(`Production operator documentation is missing boundary: ${boundary}`);
    }
  }
  for (const required of [
    'branches: ["main"]',
    'cron: "17 4 * * 1"',
    'node-version: "24.18.0"',
    'npm run setup:install',
    'fetch-depth: 0',
    'AXIOM_CREDENTIAL_AUDIT_KEY: ${{ secrets.AXIOM_CREDENTIAL_AUDIT_KEY }}',
    'npm run credential-history:audit',
    'axiom-credential-history-audit-evidence-${{ github.sha }}',
    'Prove public probe target is reachable from the runner',
    '--unix-socket "$RUNNER_TEMP/axiom-ingress/gateway.sock"',
    'AXIOM_HOST_INGRESS_VERIFIED="$AXIOM_HOST_INGRESS_VERIFIED"',
    'AXIOM_RUNNER_PUBLIC_CONTROL_VERIFIED="$AXIOM_RUNNER_PUBLIC_CONTROL_VERIFIED"',
    'node src/network-boundary.mjs',
    'axiom-deny-egress-evidence-${{ github.sha }}',
    'node src/recovery-drill.mjs',
    'node src/backup-lifecycle-drill.mjs',
    'node src/slo-drill.mjs',
    'node src/credential-rotation-drill.mjs',
    'node src/data-key-rotation-drill.mjs',
    'node src/incident-tabletop-drill.mjs',
    'node src/resilience-drill.mjs',
    'node src/transport-drill.mjs',
    'node src/service-unit-drill.mjs',
    'node src/node-scheduling-drill.mjs',
    'node src/online-causal-sync-drill.mjs',
    'node src/provider-conformance-drill.mjs',
    'node src/pilot-dossier-conformance-drill.mjs',
    'node src/pilot-evidence-package-drill.mjs',
    'node src/telemetry-relay-drill.mjs',
    'actions/upload-artifact@v7',
    'axiom-recovery-drill-evidence-${{ github.sha }}',
    'axiom-backup-lifecycle-evidence-${{ github.sha }}',
    'axiom-slo-baseline-evidence-${{ github.sha }}',
    'axiom-credential-rotation-evidence-${{ github.sha }}',
    'axiom-data-key-rotation-evidence-${{ github.sha }}',
    'axiom-incident-tabletop-evidence-${{ github.sha }}',
    'axiom-resilience-drill-evidence-${{ github.sha }}',
    'axiom-transport-drill-evidence-${{ github.sha }}',
    'axiom-service-unit-drill-evidence-${{ github.sha }}',
    'axiom-node-scheduling-drill-evidence-${{ github.sha }}',
    'axiom-online-causal-sync-drill-evidence-${{ github.sha }}',
    'axiom-provider-conformance-evidence-${{ github.sha }}',
    'axiom-pilot-dossier-verifier-conformance-evidence-${{ github.sha }}',
    'axiom-pilot-evidence-package-verifier-conformance-evidence-${{ github.sha }}',
    'axiom-telemetry-relay-evidence-${{ github.sha }}',
    `docker build --pull=false --tag axiom-mesh-kernel:${packageJson.version} .`,
    'docker compose -f compose.production.yml up --detach --no-build',
    'docker compose -f compose.production.yml down --volumes --remove-orphans',
    'docker compose -f compose.units.yml up --detach --no-build',
    'node src/network-policy-probe.mjs sandbox 8082',
    'docker compose -f compose.units.yml stop sandbox',
    'docker compose -f compose.units.yml start sandbox',
    'docker compose -f compose.units.yml down --volumes --remove-orphans'
  ]) {
    if (!workflow.includes(required)) {
      throw new ValidationError(`Kernel CI workflow is missing: ${required}`);
    }
  }
  return {
    schema: 'axiom-deployment-policy.v1',
    base_image: pinnedBase[1],
    base_digest: pinnedBase[2],
    dockerfile_sha256: sha256(dockerfile),
    dockerignore_sha256: sha256(dockerignore),
    compose_sha256: sha256(compose),
    independent_units_compose_sha256: sha256(unitCompose),
    backup_retention_policy_sha256: digestObject(backupRetentionPolicy),
    credential_revocation_ledger_sha256: digestObject(credentialRevocations),
    incident_response_policy_sha256: digestObject(incidentResponsePolicy),
    telemetry_routing_policy_sha256: digestObject(telemetryRoutingPolicy),
    resilience_drill_policy_sha256: digestObject(resilienceDrillPolicy),
    transport: {
      protocol: 'TLSv1.3',
      mutually_authenticated: true,
      exact_active_leaf_pinning: true,
      offline_atomic_rotation: true
    },
    deny_egress: {
      compose_network_mode_none: true,
      unix_domain_ingress: true,
      runtime_route_check: true,
      signed_ci_probe: true
    },
    independent_units: {
      services: 4,
      internal_network_segments: 4,
      per_unit_private_identity: true,
      failure_isolation_ci: true
    },
    node_scheduling: {
      signed_discovery: true,
      deterministic_leases: true,
      signed_ci_evidence: true,
      remote_execution_authorized: false
    },
    online_causal_sync: {
      encrypted_ordered_state: true,
      independent_apply_approval: true,
      signed_ci_evidence: true,
      replicated_consensus_claimed: false
    },
    provider_runtime: {
      independent_secret_and_policy_signers: true,
      exact_private_startup_generation: true,
      signed_ci_evidence: true,
      live_refresh_claimed: false
    },
    documentation_sha256: sha256(productionDocs),
    workflow_sha256: sha256(workflow)
  };
}

export async function verifyOperatorSurface(surface, {
  packageJson,
  policy,
  gatewaySource,
  executorSource,
  operatorDocs
}) {
  if (surface?.schema !== 'axiom-operator-surface.v1') {
    throw new ValidationError('Operator surface schema is invalid');
  }
  if (surface.kernel_version !== packageJson.version) {
    throw new ValidationError('Operator surface kernel version is stale');
  }
  if (
    !Array.isArray(surface.public_endpoints)
    || !Array.isArray(surface.intent_actions)
    || !surface.public_endpoints.length
    || !surface.intent_actions.length
  ) throw new ValidationError('Operator surface is incomplete');
  assertUnique(surface.public_endpoints, 'operator endpoints');
  assertUnique(surface.intent_actions, 'operator actions');
  for (const endpoint of surface.public_endpoints) {
    const separator = endpoint.indexOf(' ');
    const method = endpoint.slice(0, separator);
    const path = endpoint.slice(separator + 1);
    if (!gatewaySource.includes(`router.add('${method}', '${path}'`)) {
      throw new ValidationError(`Operator endpoint is not implemented: ${endpoint}`);
    }
    if (!operatorDocs.includes(`- \`${endpoint}\``)) {
      throw new ValidationError(`Operator endpoint is not documented: ${endpoint}`);
    }
  }
  for (const action of surface.intent_actions) {
    if (!Object.hasOwn(policy.actions, action)) {
      throw new ValidationError(`Operator action is missing from policy: ${action}`);
    }
    if (!executorSource.includes(`'${action}'`)) {
      throw new ValidationError(`Operator action is not implemented: ${action}`);
    }
    if (!operatorDocs.includes(`- \`${action}\``)) {
      throw new ValidationError(`Operator action is not documented: ${action}`);
    }
  }
  return {
    valid: true,
    endpoints: surface.public_endpoints.length,
    actions: surface.intent_actions.length,
    digest: digestObject(surface)
  };
}

function assertUnique(values, label) {
  if (values.some(value => typeof value !== 'string' || value.length < 3 || value.length > 200)) {
    throw new ValidationError(`${label} contain an invalid value`);
  }
  if (new Set(values).size !== values.length) throw new ValidationError(`${label} contain duplicates`);
}

export function validateSupportedSourceBoundary(trackedPaths) {
  if (!Array.isArray(trackedPaths) || trackedPaths.some(path => typeof path !== 'string')) {
    throw new ValidationError('Tracked source paths must be an array of strings');
  }
  const unsupported = trackedPaths.filter(path => (
    UNSUPPORTED_RUNTIME_PREFIXES.some(prefix => path.startsWith(prefix))
    || (isDependencyManifest(path) && !SUPPORTED_DEPENDENCY_MANIFESTS.has(path))
  ));
  if (unsupported.length) {
    throw new ValidationError(
      `Unsupported legacy runtime or dependency paths are tracked: ${unsupported.slice(0, 10).join(', ')}`
    );
  }
  return {
    valid: true,
    tracked_paths: trackedPaths.length,
    dependency_manifests: [...SUPPORTED_DEPENDENCY_MANIFESTS].sort()
  };
}

function isDependencyManifest(path) {
  const name = path.split('/').at(-1);
  return (
    name === 'package.json'
    || name === 'package-lock.json'
    || name === 'go.mod'
    || name === 'go.sum'
    || name === 'Cargo.toml'
    || name === 'Cargo.lock'
    || /^requirements(?:[-_.].*)?\.txt$/i.test(name)
  );
}

async function sourceInputs(entries) {
  const files = [];
  for (const entry of entries) {
    const stat = await import('node:fs/promises').then(module => module.stat(entry));
    if (stat.isDirectory()) {
      const children = await readdir(entry, { recursive: true, withFileTypes: true });
      for (const child of children) {
        if (child.isFile()) files.push(join(child.parentPath, child.name));
      }
    } else {
      files.push(entry);
    }
  }
  files.sort();
  return Promise.all(files.map(async path => ({
    path: relative(REPOSITORY_ROOT, path),
    sha256: sha256(await readFile(path))
  })));
}

function git(args) {
  return execFileSync('git', args, {
    cwd: REPOSITORY_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore']
  }).trim();
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function main() {
  const result = await verifyReleaseReadiness();
  if (process.argv.includes('--write')) {
    if (result.dirty && process.env.AXIOM_ALLOW_DIRTY_RELEASE !== 'true') {
      throw new ValidationError('Release evidence requires a clean Git worktree');
    }
    const directory = join(MESH_ROOT, '.data', 'release', result.version);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await Promise.all([
      writeFile(join(directory, 'sbom.spdx.json'), `${canonicalJson(result.sbom)}\n`, { mode: 0o600 }),
      writeFile(join(directory, 'provenance.json'), `${canonicalJson(result.provenance)}\n`, { mode: 0o600 })
    ]);
    process.stdout.write(`${JSON.stringify({
      valid: true,
      version: result.version,
      directory
    }, null, 2)}\n`);
    return;
  }
  const printable = { ...result };
  delete printable.sbom;
  delete printable.provenance;
  process.stdout.write(`${JSON.stringify(printable, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
