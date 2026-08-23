import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import {
  createRuntimeIdentityInvocation,
  gitBlobSha1,
  HERMES_RUNTIME_002_PROFILE,
  parseHermesRuntime002Observation,
  validateHermesRuntime002Observation,
  verifyPinnedGitCheckout
} from '../src/lib/hermes-runtime-002-profile.mjs';

const SYNTHETIC_COMMIT = 'a'.repeat(40);
const SYNTHETIC_FILES = Object.freeze({
  'hermes_cli/build_info.py': 'print("synthetic build info")\n',
  'pyproject.toml': '[project]\nversion = "0.0.0-test"\n',
  'uv.lock': 'version = 1\n',
  LICENSE: 'Synthetic test fixture only.\n'
});

function syntheticProfile() {
  return {
    schema: 'axiom-runtime-source-inspection-profile.v0',
    profile_id: 'axiom.runtime.synthetic.code-identity.v0',
    runtime_id: 'synthetic-runtime',
    project_name: 'Synthetic Runtime',
    upstream_repository: 'https://example.invalid/synthetic-runtime',
    source_commit: SYNTHETIC_COMMIT,
    source_commit_signature_verified: false,
    project_version: '0.0.0-test',
    license_spdx: 'NOASSERTION',
    proposed_axiom_action: 'runtime.identity.inspect',
    action_authorized: false,
    capability_promoted: false,
    external_runtime_loaded: false,
    external_effect_performed: false,
    package_import_allowed: false,
    dependency_installation_allowed: false,
    lazy_installation_allowed: false,
    provider_credentials_allowed: false,
    network_required: false,
    direct_host_tool_access: false,
    build_identity_file_allowed: false,
    python: {
      minimum_version: '3.11',
      maximum_version_exclusive: '3.14',
      flags: ['-I', '-S', '-B']
    },
    probe: {
      module_path: 'hermes_cli/build_info.py',
      function: 'get_code_identity',
      expected_source: 'git',
      output_fields: ['sha', 'short_sha', 'source', 'version'],
      timeout_ms: 2000,
      maximum_stdout_bytes: 1024,
      maximum_stderr_bytes: 2048
    },
    required_files: Object.entries(SYNTHETIC_FILES).map(([path, content]) => ({
      path,
      git_blob_sha1: gitBlobSha1(content),
      execution_role: path === 'hermes_cli/build_info.py'
        ? 'executed-module'
        : path === 'pyproject.toml'
          ? 'read-by-module'
          : 'review-provenance-only'
    }))
  };
}

function createSyntheticCheckout() {
  const root = mkdtempSync(join(tmpdir(), 'axiom-runtime-source-pin-'));
  mkdirSync(join(root, '.git'), { recursive: true });
  writeFileSync(join(root, '.git', 'HEAD'), `${SYNTHETIC_COMMIT}\n`);
  for (const [relativePath, content] of Object.entries(SYNTHETIC_FILES)) {
    const path = join(root, ...relativePath.split('/'));
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
  return root;
}

test('Hermes RUNTIME-002 profile stays source-pinned, no-secret, and non-authorizing', () => {
  assert.equal(HERMES_RUNTIME_002_PROFILE.source_commit,
    'b6bcb3e791c673e63974029bbab40cc9326803ff');
  assert.equal(HERMES_RUNTIME_002_PROFILE.project_version, '0.20.5');
  assert.equal(HERMES_RUNTIME_002_PROFILE.proposed_axiom_action, 'runtime.identity.inspect');
  assert.equal(HERMES_RUNTIME_002_PROFILE.action_authorized, false);
  assert.equal(HERMES_RUNTIME_002_PROFILE.capability_promoted, false);
  assert.equal(HERMES_RUNTIME_002_PROFILE.external_runtime_loaded, false);
  assert.equal(HERMES_RUNTIME_002_PROFILE.external_effect_performed, false);
  assert.equal(HERMES_RUNTIME_002_PROFILE.package_import_allowed, false);
  assert.equal(HERMES_RUNTIME_002_PROFILE.dependency_installation_allowed, false);
  assert.equal(HERMES_RUNTIME_002_PROFILE.lazy_installation_allowed, false);
  assert.equal(HERMES_RUNTIME_002_PROFILE.provider_credentials_allowed, false);
  assert.equal(HERMES_RUNTIME_002_PROFILE.network_required, false);
  assert.equal(HERMES_RUNTIME_002_PROFILE.direct_host_tool_access, false);
  assert.deepEqual(HERMES_RUNTIME_002_PROFILE.python.flags, ['-I', '-S', '-B']);

  const pins = Object.fromEntries(
    HERMES_RUNTIME_002_PROFILE.required_files.map(entry => [entry.path, entry.git_blob_sha1])
  );
  assert.deepEqual(pins, {
    'hermes_cli/build_info.py': 'e2ae06ba73e5ec5ae737c3c4691362c0f99d6fc8',
    'pyproject.toml': '863115484515e1f80495da54da20ff8912ede3e6',
    'uv.lock': '0b058b8e70aaaaee618b5e9e4529fac863b84c03',
    'tools/lazy_deps.py': '3887d3a2575c0fefb8226de89619cad0cf11a305',
    LICENSE: '75410e73319c72cd3e991a501c5455eb78f38375'
  });
  assert.equal(
    HERMES_RUNTIME_002_PROFILE.required_files.find(
      entry => entry.path === 'tools/lazy_deps.py'
    )?.execution_role,
    'review-provenance-only'
  );
});

test('Git blob identity uses Git canonical blob framing', () => {
  assert.equal(gitBlobSha1('hello\n'), 'ce013625030ba8dba906f756967f9e9ca394464a');
  assert.equal(
    gitBlobSha1('[project]\nversion = "0.20.5"\n'),
    '9ca6cd205cf98afba508b0b474f5bc0e2ed7daba'
  );
});

test('pinned checkout verification accepts only the exact selected file bytes and HEAD', t => {
  const root = createSyntheticCheckout();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const profile = syntheticProfile();

  const result = verifyPinnedGitCheckout({
    projectRoot: root,
    expectedCommit: profile.source_commit,
    requiredFiles: profile.required_files,
    rejectPaths: ['.hermes_build_sha']
  });

  assert.equal(result.valid, true);
  assert.equal(result.source_commit, SYNTHETIC_COMMIT);
  assert.equal(result.files.length, 4);
  assert.equal(result.complete_worktree_cleanliness_claimed, false);
  assert.equal(result.publisher_signature_verified, false);
  assert.equal(result.external_runtime_loaded, false);
  assert.equal(result.external_effect_performed, false);
});

test('pinned checkout verification fails on dirty selected files, wrong HEAD, or build identity ambiguity', t => {
  const profile = syntheticProfile();

  const dirty = createSyntheticCheckout();
  t.after(() => rmSync(dirty, { recursive: true, force: true }));
  writeFileSync(join(dirty, 'hermes_cli', 'build_info.py'), 'print("tampered")\n');
  assert.throws(() => verifyPinnedGitCheckout({
    projectRoot: dirty,
    expectedCommit: profile.source_commit,
    requiredFiles: profile.required_files,
    rejectPaths: ['.hermes_build_sha']
  }), /blob mismatch/);

  const wrongHead = createSyntheticCheckout();
  t.after(() => rmSync(wrongHead, { recursive: true, force: true }));
  writeFileSync(join(wrongHead, '.git', 'HEAD'), `${'b'.repeat(40)}\n`);
  assert.throws(() => verifyPinnedGitCheckout({
    projectRoot: wrongHead,
    expectedCommit: profile.source_commit,
    requiredFiles: profile.required_files,
    rejectPaths: ['.hermes_build_sha']
  }), /HEAD mismatch/);

  const ambiguous = createSyntheticCheckout();
  t.after(() => rmSync(ambiguous, { recursive: true, force: true }));
  writeFileSync(join(ambiguous, '.hermes_build_sha'), `${SYNTHETIC_COMMIT}\n`);
  assert.throws(() => verifyPinnedGitCheckout({
    projectRoot: ambiguous,
    expectedCommit: profile.source_commit,
    requiredFiles: profile.required_files,
    rejectPaths: ['.hermes_build_sha']
  }), /forbidden path/);
});

test('pinned checkout rejects selected files reached through a symlinked path component', t => {
  const root = createSyntheticCheckout();
  const external = mkdtempSync(join(tmpdir(), 'axiom-runtime-source-alias-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  t.after(() => rmSync(external, { recursive: true, force: true }));

  const externalHermes = join(external, 'hermes_cli');
  mkdirSync(externalHermes, { recursive: true });
  writeFileSync(
    join(externalHermes, 'build_info.py'),
    SYNTHETIC_FILES['hermes_cli/build_info.py']
  );

  rmSync(join(root, 'hermes_cli'), { recursive: true, force: true });
  symlinkSync(
    externalHermes,
    join(root, 'hermes_cli'),
    process.platform === 'win32' ? 'junction' : 'dir'
  );

  const profile = syntheticProfile();
  assert.throws(() => verifyPinnedGitCheckout({
    projectRoot: root,
    expectedCommit: profile.source_commit,
    requiredFiles: profile.required_files,
    rejectPaths: ['.hermes_build_sha']
  }), /direct regular file inside the pinned checkout/);
});

test('identity invocation bypasses Hermes package import and demands Sandbox deny-egress', t => {
  const root = createSyntheticCheckout();
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const invocation = createRuntimeIdentityInvocation({
    profile: syntheticProfile(),
    projectRoot: root,
    pythonExecutable: process.execPath
  });

  assert.equal(invocation.action_authorized, false);
  assert.equal(invocation.capability_promoted, false);
  assert.equal(invocation.external_runtime_loaded, false);
  assert.equal(invocation.external_effect_performed, false);
  assert.deepEqual(invocation.args.slice(0, 4), ['-I', '-S', '-B', '-c']);
  assert.match(invocation.args[4], /spec_from_file_location/);
  assert.doesNotMatch(invocation.args[4], /import\s+hermes_cli/);
  assert.equal(invocation.environment.inherit, false);
  assert.deepEqual(invocation.environment.variables, {});
  assert.equal(invocation.sandbox_requirements.sandbox_required, true);
  assert.equal(invocation.sandbox_requirements.filesystem_mode, 'read-only');
  assert.equal(invocation.sandbox_requirements.network_mode, 'deny');
  assert.equal(invocation.sandbox_requirements.provider_credentials_allowed, false);
  assert.equal(invocation.sandbox_requirements.dependency_installation_allowed, false);
  assert.equal(invocation.sandbox_requirements.package_import_allowed, false);
  assert.equal(invocation.bounds.maximum_attempts, 1);
});

test('Hermes identity observation accepts only the exact admitted source result', () => {
  const valid = {
    sha: HERMES_RUNTIME_002_PROFILE.source_commit,
    short_sha: HERMES_RUNTIME_002_PROFILE.source_commit.slice(0, 8),
    source: 'git',
    version: HERMES_RUNTIME_002_PROFILE.project_version
  };
  assert.equal(validateHermesRuntime002Observation(valid), true);

  assert.throws(
    () => validateHermesRuntime002Observation({ ...valid, extra: true }),
    /fields are invalid/
  );
  assert.throws(
    () => validateHermesRuntime002Observation({ ...valid, sha: 'b'.repeat(40) }),
    /does not match/
  );
  assert.throws(
    () => validateHermesRuntime002Observation({ ...valid, source: 'build-file' }),
    /does not match/
  );
  assert.throws(
    () => validateHermesRuntime002Observation({ ...valid, version: '0.20.6' }),
    /does not match/
  );

  const parsed = parseHermesRuntime002Observation(JSON.stringify(valid));
  assert.equal(parsed.valid, true);
  assert.deepEqual(parsed.observation, valid);
  assert.equal(parsed.capability_promoted, false);
  assert.equal(parsed.external_effect_performed, false);

  assert.throws(() => parseHermesRuntime002Observation('{not-json}'), /not valid JSON/);
  assert.throws(
    () => parseHermesRuntime002Observation(`${JSON.stringify(valid)}\n${JSON.stringify(valid)}`),
    /exactly one JSON record/
  );
  assert.throws(
    () => parseHermesRuntime002Observation('x'.repeat(1025)),
    /empty or exceeds/
  );
});
