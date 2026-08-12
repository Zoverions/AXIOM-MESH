import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { sha256 } from '../src/lib/canonical.mjs';
import {
  REPOSITORY_ADAPTER_SCHEMA,
  normalizeRepositoryAdapterDescriptor
} from '../src/lib/repository-adapter.mjs';
import {
  deriveLocalGitSourceState,
  inspectLocalGitSource,
  observeLocalGitReplica
} from '../src/repository-operator/local-git-source.mjs';

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { ...options, encoding: 'utf8' }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve(stdout);
    });
  });
}

async function repositoryFixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'axiom-local-git-'));
  const working = join(root, 'working');
  const bare = join(root, 'mirror.git');
  await mkdir(working);
  await run('git', ['init', '-b', 'main'], { cwd: working });
  await run('git', ['config', 'user.name', 'AXIOM Test'], { cwd: working });
  await run('git', ['config', 'user.email', 'axiom-test@example.invalid'], { cwd: working });
  await mkdir(join(working, 'docs'));
  await writeFile(join(working, 'README.md'), '# AXIOM local source\n');
  await writeFile(join(working, 'docs', 'continuity.md'), 'provider independent\n');
  await run('git', ['add', 'README.md', 'docs/continuity.md'], { cwd: working });
  await run('git', ['commit', '-m', 'Initial local source'], { cwd: working });
  await run('git', ['clone', '--bare', '--no-hardlinks', working, bare]);
  t.after(async () => rm(root, { recursive: true, force: true }));
  return { root, working, bare };
}

function buildBinding() {
  return {
    kernel_version: '0.12.0-dev.3',
    capability_registry_digest: sha256('local-git-registry'),
    capability_evidence_digest: sha256('local-git-evidence'),
    release_boundary_digest: sha256('local-git-release')
  };
}

function adapter({ id, transport, locator, objectFormat }) {
  return normalizeRepositoryAdapterDescriptor({
    schema: REPOSITORY_ADAPTER_SCHEMA,
    adapter_id: id,
    repository_id: 'axiom-mesh',
    transport,
    locator,
    vcs: 'git',
    object_format: objectFormat,
    operations: ['base.observe', 'file.observe', 'candidate.compare', 'mirror.fetch'],
    source_identity_authority: false,
    lineage_acceptance_authority: false,
    credentials_are_identity: false,
    provider_metadata_is_authority: false,
    operation_authority_required: true
  });
}

test('working and bare Git repositories independently derive the same source state without provider API access', async t => {
  const fixture = await repositoryFixture(t);
  const workingInspection = await inspectLocalGitSource({ repository_path: fixture.working });
  const bareInspection = await inspectLocalGitSource({ repository_path: fixture.bare });

  assert.equal(workingInspection.commit_oid, bareInspection.commit_oid);
  assert.equal(workingInspection.tree_oid, bareInspection.tree_oid);
  assert.equal(workingInspection.source_manifest_digest, bareInspection.source_manifest_digest);
  assert.equal(workingInspection.object_complete, true);
  assert.equal(bareInspection.object_complete, true);
  assert.equal(workingInspection.network_required, false);
  assert.equal(workingInspection.provider_api_required, false);
  assert.equal(workingInspection.repository_path_exposed, false);

  const workingState = await deriveLocalGitSourceState({
    repository_path: fixture.working,
    repository_id: 'axiom-mesh',
    build: buildBinding()
  });
  const bareState = await deriveLocalGitSourceState({
    repository_path: fixture.bare,
    repository_id: 'axiom-mesh',
    build: buildBinding()
  });
  assert.equal(workingState.state_digest, bareState.state_digest);
});

test('bare Git adapter verifies exact accepted source state without exposing filesystem path', async t => {
  const fixture = await repositoryFixture(t);
  const state = await deriveLocalGitSourceState({
    repository_path: fixture.working,
    repository_id: 'axiom-mesh',
    build: buildBinding()
  });
  const descriptor = adapter({
    id: 'mirror.local.bare',
    transport: 'bare_git',
    locator: 'local:axiom-offline-primary',
    objectFormat: state.object_format
  });
  const result = await observeLocalGitReplica({
    repository_path: fixture.bare,
    descriptor,
    source_state: state,
    observed_at: '2026-08-11T16:45:00.000Z'
  });

  assert.equal(result.observation.status, 'reachable');
  assert.equal(result.observation.digest_verified, true);
  assert.equal(result.observation.non_authoritative, true);
  assert.equal(result.observation.locator, 'local:axiom-offline-primary');
  assert.equal(JSON.stringify(result).includes(fixture.bare), false);
});

test('local source divergence is detected without changing the expected state', async t => {
  const fixture = await repositoryFixture(t);
  const expected = await deriveLocalGitSourceState({
    repository_path: fixture.working,
    repository_id: 'axiom-mesh',
    build: buildBinding()
  });

  await writeFile(join(fixture.working, 'README.md'), '# AXIOM changed locally\n');
  await run('git', ['add', 'README.md'], { cwd: fixture.working });
  await run('git', ['commit', '-m', 'Diverge working source'], { cwd: fixture.working });

  const changedInspection = await inspectLocalGitSource({ repository_path: fixture.working });
  assert.notEqual(changedInspection.commit_oid, expected.commit_oid);

  const descriptor = adapter({
    id: 'mirror.local.working',
    transport: 'local_git',
    locator: 'local:axiom-working-copy',
    objectFormat: expected.object_format
  });
  const result = await observeLocalGitReplica({
    repository_path: fixture.working,
    descriptor,
    source_state: expected,
    observed_at: '2026-08-11T16:46:00.000Z'
  });
  assert.equal(result.observation.status, 'divergent');
  assert.equal(result.observation.digest_verified, false);
  assert.equal(result.observation.source_state_digest, expected.state_digest);
});

test('local Git inspection rejects non-absolute paths and unsupported ref syntax before Git execution', async () => {
  await assert.rejects(
    inspectLocalGitSource({ repository_path: './relative-repository' }),
    /absolute path/
  );
  await assert.rejects(
    inspectLocalGitSource({ repository_path: '/tmp', ref: '--upload-pack=evil' }),
    /Git ref/
  );
});
