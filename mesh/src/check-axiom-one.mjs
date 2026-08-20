import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { canonicalJson, digestObject, sha256, ValidationError } from './lib/canonical.mjs';
import { MESH_ROOT } from './lib/config.mjs';
import { ACTIVE_GATEWAY_CLIENT_CONTRACT } from './lib/gateway-client-contract.mjs';
import { validateHumanContract } from '../../apps/axiom-one/presentation.mjs';

const REPOSITORY_ROOT = dirname(MESH_ROOT);
const APP_ROOT = join(REPOSITORY_ROOT, 'apps', 'axiom-one');
const EXPECTED_SURFACES = Object.freeze([
  'overview',
  'ask',
  'approvals',
  'vault',
  'social',
  'receipts',
  'share',
  'explore'
]);
const EXPECTED_ROUTES = Object.freeze([
  'status.get',
  'capabilities.list',
  'operations.get',
  'intents.submit',
  'approvals.list',
  'memory.list',
  'exports.get',
  'export_bundles.get',
  'social.get',
  'social_remote_review.get',
  'events.list',
  'nodes.list',
  'capsules.list',
  'imports.list',
  'backups.list',
  'audit.verify'
]);
const EXPECTED_ACTION_PREVIEWS = Object.freeze([
  'system.echo',
  'memory.put',
  'memory.link',
  'memory.tombstone',
  'export.create'
]);
const EXPECTED_NON_CLAIMS = Object.freeze([
  'supported-product',
  'production-promotion',
  'browser-session-security-complete',
  'external-ai-enabled',
  'sharing-enabled',
  'circles-enabled',
  'live-deployment'
]);
const EXPECTED_EVENT_KINDS = Object.freeze([
  'accounting.account.created',
  'accounting.journal.posted',
  'approval.consumed',
  'approval.granted',
  'backup.completed',
  'backup.requested',
  'backup.restored',
  'capsule.registered',
  'capsule.revoked',
  'consent.granted',
  'consent.revoked',
  'export.completed',
  'export.requested',
  'governance.activated',
  'governance.appeal.filed',
  'governance.emergency.activated',
  'governance.emergency.reviewed',
  'governance.finalized',
  'governance.proposed',
  'governance.rolled-back',
  'governance.verified',
  'governance.voted',
  'import.applied',
  'import.staged',
  'intent.accepted',
  'intent.completed',
  'intent.denied',
  'intent.failed',
  'memory.linked',
  'memory.put',
  'memory.tombstoned',
  'node.quarantined',
  'node.registered',
  'node.renewed',
  'node.schedule.requested',
  'storage.offered',
  'sync.bundle.applied'
]);

export async function checkAxiomOnePreview() {
  const [
    policy,
    humanContract,
    manifest,
    index,
    app,
    presentation,
    styles,
    worker,
    server,
    icon
  ] = await Promise.all([
    readJson('app-policy.json'),
    readJson('human-contract.json'),
    readJson('manifest.webmanifest'),
    readText('index.html'),
    readText('app.mjs'),
    readText('presentation.mjs'),
    readText('styles.css'),
    readText('sw.mjs'),
    readText('server.mjs'),
    readText('icon.svg')
  ]);
  validatePolicy(policy);
  validateExplanations(policy, humanContract);
  validateManifest(manifest);
  validateAssets({ index, app, presentation, styles, worker, server, icon });
  return {
    valid: true,
    schema: policy.schema,
    kernel_version: policy.kernel_version,
    status: policy.status,
    policy_digest: digestObject(policy),
    surfaces: policy.surfaces.length,
    gateway_routes: policy.gateway_routes.length,
    bind_host: policy.network.bind_host,
    gateway_target: policy.network.gateway_target,
    token_persistence: policy.security.token_persistence,
    secret_or_user_data_storage: policy.security.secret_or_user_data_storage,
    public_shell_cache: policy.security.public_shell_cache,
    api_cache: policy.security.api_cache,
    remote_origins_allowed: policy.network.remote_origins_allowed,
    human_contract_schema: humanContract.schema,
    human_contract_digest: digestObject(humanContract),
    explained_gateway_errors: Object.keys(humanContract.gateway_outcomes).length,
    explained_event_kinds: Object.keys(humanContract.event_kinds).length,
    explained_actions: Object.keys(humanContract.actions).length,
    memory_lifecycle_status: policy.memory_lifecycle.status,
    provenance_relations: policy.memory_lifecycle.provenance_relations.length,
    self_links: policy.memory_lifecycle.self_links,
    correction_replaces_original: policy.memory_lifecycle.correction_replaces_original,
    link_deletion: policy.memory_lifecycle.link_deletion,
    hard_delete: policy.memory_lifecycle.hard_delete,
    restore: policy.memory_lifecycle.restore,
    authoritative_pre_execution_kernel_plan:
      policy.human_explanations.authoritative_pre_execution_kernel_plan,
    assets_digest: digestObject({
      index: sha256(index),
      app: sha256(app),
      presentation: sha256(presentation),
      styles: sha256(styles),
      worker: sha256(worker),
      server: sha256(server),
      icon: sha256(icon),
      manifest: digestObject(manifest)
    })
  };
}

export function validateAxiomOnePolicy(policy) {
  validatePolicy(policy);
  return true;
}

function validatePolicy(policy) {
  exactObject(policy, 'AXIOM One policy', [
    'schema',
    'version',
    'kernel_version',
    'status',
    'network',
    'security',
    'human_explanations',
    'memory_lifecycle',
    'surfaces',
    'gateway_routes',
    'non_claims'
  ]);
  if (
    policy.schema !== 'axiom-one-preview.v1'
    || policy.version !== 1
    || policy.kernel_version !== '0.12.0-dev.3'
    || policy.status !== 'experimental-local-preview'
  ) throw new ValidationError('AXIOM One preview identity is invalid');
  exactObject(policy.network, 'AXIOM One network policy', [
    'bind_host',
    'default_port',
    'default_gateway_origin',
    'gateway_target',
    'remote_origins_allowed'
  ]);
  if (
    policy.network.bind_host !== '127.0.0.1'
    || policy.network.default_port !== 4173
    || policy.network.default_gateway_origin !== 'http://127.0.0.1:8080'
    || policy.network.gateway_target !== 'same-origin-relative-v1'
    || policy.network.remote_origins_allowed !== false
  ) throw new ValidationError('AXIOM One network boundary is weakened');
  exactObject(policy.security, 'AXIOM One security policy', [
    'token_persistence',
    'cookies_used',
    'secret_or_user_data_storage',
    'public_shell_cache',
    'third_party_assets',
    'analytics',
    'api_cache',
    'maximum_proxy_request_bytes',
    'maximum_proxy_response_bytes',
    'proxy_timeout_ms'
  ]);
  if (
    policy.security.token_persistence !== 'memory-only'
    || policy.security.cookies_used !== false
    || policy.security.secret_or_user_data_storage !== false
    || policy.security.public_shell_cache !== true
    || policy.security.third_party_assets !== false
    || policy.security.analytics !== false
    || policy.security.api_cache !== false
    || policy.security.maximum_proxy_request_bytes !== 1_048_576
    || policy.security.maximum_proxy_response_bytes !== 2_097_152
    || policy.security.proxy_timeout_ms !== 30_000
  ) throw new ValidationError('AXIOM One security boundary is weakened');
  exactObject(policy.human_explanations, 'AXIOM One human explanation policy', [
    'contract_schema',
    'status',
    'action_previews',
    'stable_gateway_errors',
    'event_kinds',
    'raw_evidence_always_available',
    'authoritative_pre_execution_kernel_plan'
  ]);
  if (
    policy.human_explanations.contract_schema !== 'axiom-one-human-contract.v1'
    || policy.human_explanations.status !== 'experimental-human-explanations'
    || canonicalJson(policy.human_explanations.action_previews)
      !== canonicalJson(EXPECTED_ACTION_PREVIEWS)
    || policy.human_explanations.stable_gateway_errors !== 20
    || policy.human_explanations.event_kinds !== EXPECTED_EVENT_KINDS.length
    || policy.human_explanations.raw_evidence_always_available !== true
    || policy.human_explanations.authoritative_pre_execution_kernel_plan !== false
  ) throw new ValidationError('AXIOM One human explanation boundary is weakened');
  exactObject(policy.memory_lifecycle, 'AXIOM One memory lifecycle policy', [
    'status',
    'actions',
    'read_route',
    'provenance_relations',
    'self_links',
    'correction_replaces_original',
    'link_deletion',
    'export_routes',
    'bundle_reveal',
    'persistent_browser_storage',
    'hard_delete',
    'restore',
    'sharing'
  ]);
  if (
    policy.memory_lifecycle.status !== 'experimental-bounded-lifecycle'
    || canonicalJson(policy.memory_lifecycle.actions)
      !== canonicalJson(['memory.put', 'memory.link', 'memory.tombstone', 'export.create'])
    || policy.memory_lifecycle.read_route !== 'memory.list'
    || canonicalJson(policy.memory_lifecycle.provenance_relations)
      !== canonicalJson(['derived-from', 'supports', 'corrects'])
    || policy.memory_lifecycle.self_links !== false
    || policy.memory_lifecycle.correction_replaces_original !== false
    || policy.memory_lifecycle.link_deletion !== false
    || canonicalJson(policy.memory_lifecycle.export_routes)
      !== canonicalJson(['exports.get', 'export_bundles.get'])
    || policy.memory_lifecycle.bundle_reveal !== 'explicit-user-action-only'
    || policy.memory_lifecycle.persistent_browser_storage !== false
    || policy.memory_lifecycle.hard_delete !== false
    || policy.memory_lifecycle.restore !== false
    || policy.memory_lifecycle.sharing !== false
  ) throw new ValidationError('AXIOM One memory lifecycle boundary is weakened');
  if (
    canonicalJson(policy.surfaces) !== canonicalJson(EXPECTED_SURFACES)
    || canonicalJson(policy.gateway_routes) !== canonicalJson(EXPECTED_ROUTES)
    || canonicalJson(policy.non_claims) !== canonicalJson(EXPECTED_NON_CLAIMS)
  ) throw new ValidationError('AXIOM One preview inventory drifted');
  const contractIds = new Set(ACTIVE_GATEWAY_CLIENT_CONTRACT.routes.map(route => route.id));
  if (policy.gateway_routes.some(route => !contractIds.has(route))) {
    throw new ValidationError('AXIOM One references a route outside the Gateway client contract');
  }
}

function validateExplanations(policy, humanContract) {
  validateHumanContract(humanContract);
  if (
    humanContract.schema !== policy.human_explanations.contract_schema
    || humanContract.status !== policy.human_explanations.status
    || canonicalJson(Object.keys(humanContract.actions).sort())
      !== canonicalJson([...policy.human_explanations.action_previews].sort())
    || canonicalJson(Object.keys(humanContract.gateway_outcomes).sort())
      !== canonicalJson([...ACTIVE_GATEWAY_CLIENT_CONTRACT.error_contract.stable_codes].sort())
    || canonicalJson(Object.keys(humanContract.event_kinds).sort())
      !== canonicalJson([...EXPECTED_EVENT_KINDS].sort())
  ) throw new ValidationError('AXIOM One human explanation inventory drifted');
  const eventSource = humanContract.event_kinds;
  for (const kind of EXPECTED_EVENT_KINDS) {
    if (!eventSource[kind]) {
      throw new ValidationError(`AXIOM One event explanation is missing: ${kind}`);
    }
  }
}

function validateManifest(manifest) {
  if (
    manifest.name !== 'AXIOM One Local Preview'
    || manifest.id !== '/'
    || manifest.start_url !== '/'
    || manifest.scope !== '/'
    || manifest.display !== 'standalone'
    || manifest.icons?.length !== 1
    || manifest.icons[0].src !== '/icon.svg'
    || manifest.icons[0].type !== 'image/svg+xml'
  ) throw new ValidationError('AXIOM One web manifest is invalid');
}

function validateAssets({ index, app, presentation, styles, worker, server, icon }) {
  const requiredIndex = [
    '<meta name="viewport"',
    '<link rel="manifest" href="/manifest.webmanifest">',
    '<script type="module" src="/app.mjs"></script>',
    'class="skip-link"',
    'id="main-content"',
    'aria-live="polite"',
    'data-route="social"',
    'Experimental local preview'
  ];
  if (requiredIndex.some(marker => !index.includes(marker))) {
    throw new ValidationError('AXIOM One document semantics are incomplete');
  }
  if (/<script(?![^>]*\bsrc=)|<style\b/i.test(index)) {
    throw new ValidationError('AXIOM One document contains inline executable content');
  }
  const forbiddenBrowserPatterns = [
    /localStorage/,
    /sessionStorage/,
    /indexedDB/,
    /document\.cookie/,
    /innerHTML/,
    /outerHTML/,
    /insertAdjacentHTML/,
    /https?:\/\//
  ];
  if (forbiddenBrowserPatterns.some(pattern => pattern.test(
    `${app}\n${presentation}\n${index}\n${styles}`
  ))) {
    throw new ValidationError('AXIOM One browser assets cross a storage, injection, or remote-origin boundary');
  }
  for (const route of EXPECTED_ROUTES) {
    if (!app.includes(`'${route}'`)) {
      throw new ValidationError(`AXIOM One browser route is missing: ${route}`);
    }
  }
  const explanationMarkers = [
    "'/human-contract.json'",
    'createHumanPresenter',
    'requestPreview',
    'intentSuccess',
    'intentFailure',
    'retrySameRequest',
    'Raw result and evidence'
  ];
  if (explanationMarkers.some(marker => !`${app}\n${presentation}`.includes(marker))) {
    throw new ValidationError('AXIOM One human explanation surface is incomplete');
  }
  const lifecycleMarkers = [
    "action: 'memory.put'",
    "action: 'memory.link'",
    "action: 'memory.tombstone'",
    "action: 'export.create'",
    "state.client.call('exports.get'",
    "state.client.call('export_bundles.get'",
    'Reveal bundle in this page',
    "'derived-from'",
    "'corrects'",
    'sourceObject.value === targetObject.value'
  ];
  if (lifecycleMarkers.some(marker => !app.includes(marker))) {
    throw new ValidationError('AXIOM One memory lifecycle surface is incomplete');
  }
  const socialMarkers = [
    "from '/social-presentation.mjs'",
    'presentAxiomOneSocial',
    'social: renderSocial',
    "state.client.call('social.get'",
    "state.client.call('social_remote_review.get'",
    'Owner-local corpus',
    'Remote observation'
  ];
  if (socialMarkers.some(marker => !app.includes(marker))) {
    throw new ValidationError('AXIOM One Social read-only surface is incomplete');
  }
  if (
    !worker.includes("url.pathname.startsWith('/v1/')")
    || !worker.includes('!SHELL_ASSETS.includes(url.pathname)')
  ) throw new ValidationError('AXIOM One service worker may cache API data');
  const serverMarkers = [
    "host !== LOOPBACK_HOST",
    "url.pathname.startsWith('/v1/')",
    'Cross-origin preview request denied',
    'gatewayContract.limits.maximum_query_values',
    "frame-ancestors 'none'",
    "connect-src 'self'",
    "script-src 'self'",
    "style-src 'self'"
  ];
  if (serverMarkers.some(marker => !server.includes(marker))) {
    throw new ValidationError('AXIOM One preview server boundary is incomplete');
  }
  if (
    !server.includes("'/presentation.mjs'")
    || !server.includes("'/social-presentation.mjs'")
    || !server.includes("packages', 'axiom-one-social-presentation', 'index.mjs'")
    || !server.includes("'/human-contract.json'")
    || !worker.includes("'/presentation.mjs'")
    || !worker.includes("'/social-presentation.mjs'")
    || !worker.includes("'/human-contract.json'")
  ) throw new ValidationError('AXIOM One public presentation assets are not exact');
  if (!styles.includes('@media (prefers-reduced-motion: reduce)')) {
    throw new ValidationError('AXIOM One reduced-motion behavior is missing');
  }
  if (!icon.includes('<svg') || /<script\b/i.test(icon)) {
    throw new ValidationError('AXIOM One icon is invalid');
  }
}

function exactObject(value, name, keys) {
  if (
    !value
    || typeof value !== 'object'
    || Array.isArray(value)
    || canonicalJson(Object.keys(value).sort()) !== canonicalJson([...keys].sort())
  ) throw new ValidationError(`${name} fields are invalid`);
}

function readText(name) {
  return readFile(join(APP_ROOT, name), 'utf8');
}

async function readJson(name) {
  return JSON.parse(await readText(name));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(`${JSON.stringify(await checkAxiomOnePreview(), null, 2)}\n`);
}
