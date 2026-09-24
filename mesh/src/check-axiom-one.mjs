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
  'social',
  'approvals',
  'vault',
  'receipts',
  'share',
  'explore'
]);
const EXPECTED_ROUTES = Object.freeze([
  'status.get',
  'capabilities.list',
  'operations.get',
  'intents.submit',
  'social.get',
  'approvals.list',
  'memory.list',
  'exports.get',
  'export_bundles.get',
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
  'export.create',
  'ai.local-organize',
  'social.actor.create',
  'social.persona.create',
  'social.publication.create'
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
    localOrganize,
    styles,
    worker,
    server,
    icon,
    icon192,
    icon512,
    iconMaskable192,
    iconMaskable512,
    screenshotWide,
    screenshotNarrow
  ] = await Promise.all([
    readJson('app-policy.json'),
    readJson('human-contract.json'),
    readJson('manifest.webmanifest'),
    readText('index.html'),
    readText('app.mjs'),
    readText('presentation.mjs'),
    readText('local-organize.mjs'),
    readText('styles.css'),
    readText('sw.mjs'),
    readText('server.mjs'),
    readText('icon.svg'),
    readBinary('icons/icon-192.png'),
    readBinary('icons/icon-512.png'),
    readBinary('icons/icon-maskable-192.png'),
    readBinary('icons/icon-maskable-512.png'),
    readBinary('screenshots/screenshot-wide.png'),
    readBinary('screenshots/screenshot-narrow.png')
  ]);
  validatePolicy(policy);
  validateExplanations(policy, humanContract);
  validateManifest(manifest);
  validateAssets({ index, app, presentation, localOrganize, styles, worker, server, icon });
  validatePng(icon192, 'icons/icon-192.png', 192, 192);
  validatePng(icon512, 'icons/icon-512.png', 512, 512);
  validatePng(iconMaskable192, 'icons/icon-maskable-192.png', 192, 192);
  validatePng(iconMaskable512, 'icons/icon-maskable-512.png', 512, 512);
  validatePng(screenshotWide, 'screenshots/screenshot-wide.png', 1280, 720);
  validatePng(screenshotNarrow, 'screenshots/screenshot-narrow.png', 390, 844);
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
      local_organize: sha256(localOrganize),
      styles: sha256(styles),
      worker: sha256(worker),
      server: sha256(server),
      icon: sha256(icon),
      icon_192_png: sha256(icon192),
      icon_512_png: sha256(icon512),
      icon_maskable_192_png: sha256(iconMaskable192),
      icon_maskable_512_png: sha256(iconMaskable512),
      screenshot_wide_png: sha256(screenshotWide),
      screenshot_narrow_png: sha256(screenshotNarrow),
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
    'capability_parity',
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
  exactObject(policy.capability_parity, 'AXIOM One capability parity policy', [
    'status',
    'capability_route',
    'runnable_claim_statuses',
    'principal_authority',
    'discovery_grants_authority',
    'browser_mutation'
  ]);
  if (
    policy.capability_parity.status !== 'experimental-read-only-projection'
    || policy.capability_parity.capability_route !== 'capabilities.list'
    || canonicalJson(policy.capability_parity.runnable_claim_statuses)
      !== canonicalJson(['implemented'])
    || policy.capability_parity.principal_authority !== 'not-inferred-from-discovery'
    || policy.capability_parity.discovery_grants_authority !== false
    || policy.capability_parity.browser_mutation !== false
  ) throw new ValidationError('AXIOM One capability parity boundary is weakened');
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
  const expectedIcons = [
    { purpose: 'any', sizes: '192x192', src: '/icons/icon-192.png', type: 'image/png' },
    { purpose: 'any', sizes: '512x512', src: '/icons/icon-512.png', type: 'image/png' },
    { purpose: 'maskable', sizes: '192x192', src: '/icons/icon-maskable-192.png', type: 'image/png' },
    { purpose: 'maskable', sizes: '512x512', src: '/icons/icon-maskable-512.png', type: 'image/png' },
    { purpose: 'any', sizes: 'any', src: '/icon.svg', type: 'image/svg+xml' }
  ];
  const expectedScreenshots = [
    {
      form_factor: 'wide',
      label: 'AXIOM One local preview (stylized mockup): Local Social and Vault sections.',
      sizes: '1280x720',
      src: '/screenshots/screenshot-wide.png',
      type: 'image/png'
    },
    {
      form_factor: 'narrow',
      label: 'AXIOM One local preview (stylized mockup): compact mobile layout.',
      sizes: '390x844',
      src: '/screenshots/screenshot-narrow.png',
      type: 'image/png'
    }
  ];
  const expectedShortcuts = [
    {
      description: 'Open the owner-scoped local social feed.',
      icons: [{ sizes: '192x192', src: '/icons/icon-192.png', type: 'image/png' }],
      name: 'Local Social',
      short_name: 'Social',
      url: '/#social'
    },
    {
      description: 'Open the partitioned local vault.',
      icons: [{ sizes: '192x192', src: '/icons/icon-192.png', type: 'image/png' }],
      name: 'Vault',
      short_name: 'Vault',
      url: '/#vault'
    }
  ];
  exactObject(manifest, 'AXIOM One web manifest', [
    'background_color',
    'categories',
    'description',
    'dir',
    'display',
    'display_override',
    'icons',
    'id',
    'lang',
    'name',
    'orientation',
    'scope',
    'screenshots',
    'short_name',
    'shortcuts',
    'start_url',
    'theme_color'
  ]);
  if (
    manifest.name !== 'AXIOM One Local Preview'
    || manifest.short_name !== 'AXIOM One'
    || manifest.description !== 'Experimental local interface for an AXIOM-MESH personal node. Owner-scoped; no external AI, sharing, or federation is claimed.'
    || manifest.id !== '/'
    || manifest.start_url !== '/'
    || manifest.scope !== '/'
    || manifest.display !== 'standalone'
    || manifest.dir !== 'ltr'
    || manifest.lang !== 'en'
    || manifest.orientation !== 'any'
    || manifest.background_color !== '#08111f'
    || manifest.theme_color !== '#0b1526'
    || canonicalJson(manifest.categories) !== canonicalJson(['productivity', 'utilities'])
    || canonicalJson(manifest.display_override) !== canonicalJson(['window-controls-overlay', 'standalone'])
    || canonicalJson(manifest.icons) !== canonicalJson(expectedIcons)
    || canonicalJson(manifest.screenshots) !== canonicalJson(expectedScreenshots)
    || canonicalJson(manifest.shortcuts) !== canonicalJson(expectedShortcuts)
  ) throw new ValidationError('AXIOM One web manifest is invalid');
}

function validateAssets({ index, app, presentation, localOrganize, styles, worker, server, icon }) {
  const requiredIndex = [
    '<meta name="viewport"',
    '<link rel="manifest" href="/manifest.webmanifest">',
    '<script type="module" src="/app.mjs"></script>',
    'class="skip-link"',
    'id="main-content"',
    'aria-live="polite"',
    'Experimental local preview',
    'data-route="social"'
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
    `${app}\n${presentation}\n${localOrganize}\n${index}\n${styles}`
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
  const organizeMarkers = [
    "action: 'ai.local-organize'",
    "from '/local-organize.mjs'",
    'buildBrowserOrganizeDraft',
    'Local organizer stub',
    'draft suggestion',
    "'/local-organize.mjs'"
  ];
  if (organizeMarkers.some(marker => !`${app}\n${localOrganize}\n${server}\n${worker}`.includes(marker))) {
    throw new ValidationError('AXIOM One local organize draft surface is incomplete');
  }
  if (
    !localOrganize.includes('deterministic')
    || !localOrganize.includes('LOCAL_ORGANIZE_PROVIDER_ID')
    || !localOrganize.includes('INTEGRITY_VS_TRUTH')
  ) {
    throw new ValidationError('AXIOM One local organize module boundary is incomplete');
  }
  const socialMarkers = [
    "state.client.call('social.get'",
    "response.network_effect === 'none'",
    "publication.status ?? 'unknown'",
    'Owner-local Social corpus',
    'No federation',
    "action: 'social.actor.create'",
    "action: 'social.persona.create'",
    "action: 'social.publication.create'",
    "purpose: 'local-social-identity'",
    "purpose: 'local-social-persona'",
    "purpose: 'social-publish'",
    "data_scopes: ['social:identity']",
    "data_scopes: ['publication-projection']",
    'if (activeActor && activePersona)',
    'actor_state_digest: activeActor.actor_state_digest',
    'protected_persona: activePersona.protected_persona',
    "media_type: 'text/plain'",
    "audience: { mode: 'public' }",
    "discoverability: 'listed'",
    "authorship_mode: 'human-authored'",
    'axiom-one:social:'
  ];
  if (socialMarkers.some(marker => !app.includes(marker))) {
    throw new ValidationError('AXIOM One owner-local Social surface is incomplete');
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
    || !server.includes("'/human-contract.json'")
    || !server.includes("'/local-organize.mjs'")
    || !worker.includes("'/presentation.mjs'")
    || !worker.includes("'/human-contract.json'")
    || !worker.includes("'/local-organize.mjs'")
  ) throw new ValidationError('AXIOM One public explanation assets are not exact');
  const pwaAssets = [
    '/icons/icon-192.png',
    '/icons/icon-512.png',
    '/icons/icon-maskable-192.png',
    '/icons/icon-maskable-512.png',
    '/screenshots/screenshot-wide.png',
    '/screenshots/screenshot-narrow.png'
  ];
  if (pwaAssets.some(assetPath => (
    !server.includes(`'${assetPath}'`)
    || !worker.includes(`'${assetPath}'`)
  ))) throw new ValidationError('AXIOM One installable shell asset inventory drifted');
  if (!styles.includes('@media (prefers-reduced-motion: reduce)')) {
    throw new ValidationError('AXIOM One reduced-motion behavior is missing');
  }
  if (!icon.includes('<svg') || /<script\b/i.test(icon)) {
    throw new ValidationError('AXIOM One icon is invalid');
  }
}

function validatePng(buffer, name, expectedWidth, expectedHeight) {
  if (
    !Buffer.isBuffer(buffer)
    || buffer.length < 24
    || buffer.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a'
    || buffer.subarray(12, 16).toString('ascii') !== 'IHDR'
    || buffer.readUInt32BE(16) !== expectedWidth
    || buffer.readUInt32BE(20) !== expectedHeight
  ) throw new ValidationError(`AXIOM One PNG asset is invalid: ${name}`);
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

function readBinary(name) {
  return readFile(join(APP_ROOT, name));
}

async function readJson(name) {
  return JSON.parse(await readText(name));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(`${JSON.stringify(await checkAxiomOnePreview(), null, 2)}\n`);
}
