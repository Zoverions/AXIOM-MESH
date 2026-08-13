import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import { verifyCiCheckoutFreshness } from '../src/lib/ci-checkout-freshness.mjs';

function git(directory, args) {
  return execFileSync('git', ['-C', directory, ...args], {
    encoding: 'utf8',
    windowsHide: true,
    env: {
      ...process.env,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_TERMINAL_PROMPT: '0'
    }
  }).trim();
}

async function repository(t) {
  const directory = await mkdtemp(join(tmpdir(), 'axiom-ci-freshness-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  git(directory, ['init', '-b', 'main']);
  git(directory, ['config', 'user.name', 'AXIOM Test']);
  git(directory, ['config', 'user.email', 'axiom-test@example.invalid']);
  await mkdir(join(directory, '.github', 'workflows'), { recursive: true });
  await writeFile(
    join(directory, '.github', 'workflows', 'kernel.yml'),
    'name: Test Kernel\n'
  );
  await writeFile(join(directory, 'README.md'), 'base\n');
  git(directory, ['add', '.']);
  git(directory, ['commit', '-m', 'base']);
  const base = git(directory, ['rev-parse', 'HEAD']);

  git(directory, ['checkout', '-b', 'feature']);
  await writeFile(join(directory, 'README.md'), 'feature\n');
  git(directory, ['add', 'README.md']);
  git(directory, ['commit', '-m', 'feature']);
  const head = git(directory, ['rev-parse', 'HEAD']);

  git(directory, ['checkout', 'main']);
  git(directory, ['merge', '--no-ff', '--no-edit', 'feature']);
  const merge = git(directory, ['rev-parse', 'HEAD']);
  const parents = git(directory, ['show', '-s', '--format=%P', merge]).split(/\s+/);
  assert.deepEqual(parents, [base, head]);
  return { directory, base, head, merge };
}

test('pull request verifies the exact tested merge candidate and distinguishes it from proposal head', async t => {
  const repo = await repository(t);
  const evidence = await verifyCiCheckoutFreshness({
    repository_path: repo.directory,
    event_name: 'pull_request',
    event_revision: repo.merge,
    proposal_head_revision: repo.head,
    base_revision: repo.base,
    workflow_path: '.github/workflows/kernel.yml',
    observed_at: '2026-08-13T08:30:00.000Z'
  });

  assert.equal(evidence.checkout_relation, 'pull_request_merge_candidate');
  assert.equal(evidence.tested_revision, repo.merge);
  assert.equal(evidence.event_revision, repo.merge);
  assert.equal(evidence.proposal_head_revision, repo.head);
  assert.equal(evidence.base_revision, repo.base);
  assert.deepEqual(evidence.tested_parents, [repo.base, repo.head]);
  assert.equal(evidence.checkout_exact, true);
  assert.equal(evidence.commit_relationship_measured_locally, true);
  assert.equal(evidence.source_bytes_independently_verified, false);
  assert.equal(evidence.provider_event_is_source_identity, false);
  assert.equal(evidence.provider_run_is_identity, false);
  assert.equal(evidence.merge_authority_granted, false);
  assert.equal(evidence.release_promotion_granted, false);
  assert.equal(evidence.capability_promotion_granted, false);
  assert.equal(evidence.network_access_performed, false);
  assert.match(evidence.workflow.sha256, /^[a-f0-9]{64}$/);
  assert.match(evidence.evidence_digest, /^[a-f0-9]{64}$/);
});

test('stale event revision fails when checked out HEAD moved', async t => {
  const repo = await repository(t);
  await assert.rejects(
    () => verifyCiCheckoutFreshness({
      repository_path: repo.directory,
      event_name: 'pull_request',
      event_revision: repo.head,
      proposal_head_revision: repo.head,
      base_revision: repo.base,
      workflow_path: '.github/workflows/kernel.yml'
    }),
    /HEAD does not equal the event revision/
  );
});

test('moved proposal head or base fails parent binding', async t => {
  const repo = await repository(t);
  await assert.rejects(
    () => verifyCiCheckoutFreshness({
      repository_path: repo.directory,
      event_name: 'pull_request',
      event_revision: repo.merge,
      proposal_head_revision: repo.base,
      base_revision: repo.base,
      workflow_path: '.github/workflows/kernel.yml'
    }),
    /parents do not match/
  );

  await assert.rejects(
    () => verifyCiCheckoutFreshness({
      repository_path: repo.directory,
      event_name: 'pull_request',
      event_revision: repo.merge,
      proposal_head_revision: repo.head,
      base_revision: repo.head,
      workflow_path: '.github/workflows/kernel.yml'
    }),
    /parents do not match/
  );
});

test('pull request cannot be verified from proposal head alone', async t => {
  const repo = await repository(t);
  git(repo.directory, ['checkout', 'feature']);
  await assert.rejects(
    () => verifyCiCheckoutFreshness({
      repository_path: repo.directory,
      event_name: 'pull_request',
      event_revision: repo.head,
      proposal_head_revision: repo.head,
      base_revision: repo.base,
      workflow_path: '.github/workflows/kernel.yml'
    }),
    /exact two-parent merge candidate/
  );
});

test('pull request requires both locally available expected parent commits', async t => {
  const repo = await repository(t);
  await assert.rejects(
    () => verifyCiCheckoutFreshness({
      repository_path: repo.directory,
      event_name: 'pull_request',
      event_revision: repo.merge,
      proposal_head_revision: 'f'.repeat(40),
      base_revision: repo.base,
      workflow_path: '.github/workflows/kernel.yml'
    }),
    error => error?.code === 'ci_checkout_git_verification_failed'
  );
});

test('push, workflow dispatch and schedule require exact direct event revision', async t => {
  const repo = await repository(t);
  for (const eventName of ['push', 'workflow_dispatch', 'schedule']) {
    const evidence = await verifyCiCheckoutFreshness({
      repository_path: repo.directory,
      event_name: eventName,
      event_revision: repo.merge,
      workflow_path: '.github/workflows/kernel.yml',
      observed_at: '2026-08-13T08:30:00.000Z'
    });
    assert.equal(evidence.checkout_relation, 'direct_event_revision');
    assert.equal(evidence.tested_revision, repo.merge);
    assert.equal(evidence.proposal_head_revision, null);
    assert.equal(evidence.base_revision, null);
  }
});

test('non-PR events cannot smuggle pull-request parent assertions', async t => {
  const repo = await repository(t);
  await assert.rejects(
    () => verifyCiCheckoutFreshness({
      repository_path: repo.directory,
      event_name: 'push',
      event_revision: repo.merge,
      proposal_head_revision: repo.head,
      base_revision: repo.base,
      workflow_path: '.github/workflows/kernel.yml'
    }),
    /cannot carry pull-request head\/base revisions/
  );
});

test('workflow path is content-bound and constrained to governed workflow directory', async t => {
  const repo = await repository(t);
  const first = await verifyCiCheckoutFreshness({
    repository_path: repo.directory,
    event_name: 'push',
    event_revision: repo.merge,
    workflow_path: '.github/workflows/kernel.yml',
    observed_at: '2026-08-13T08:30:00.000Z'
  });
  await writeFile(
    join(repo.directory, '.github', 'workflows', 'kernel.yml'),
    'name: Changed Kernel\n'
  );
  const second = await verifyCiCheckoutFreshness({
    repository_path: repo.directory,
    event_name: 'push',
    event_revision: repo.merge,
    workflow_path: '.github/workflows/kernel.yml',
    observed_at: '2026-08-13T08:30:00.000Z'
  });
  assert.notEqual(first.workflow.sha256, second.workflow.sha256);
  assert.notEqual(first.evidence_digest, second.evidence_digest);

  await assert.rejects(
    () => verifyCiCheckoutFreshness({
      repository_path: repo.directory,
      event_name: 'push',
      event_revision: repo.merge,
      workflow_path: '../outside.yml'
    }),
    /workflow_path/
  );
});

test('unsupported event names fail closed', async t => {
  const repo = await repository(t);
  await assert.rejects(
    () => verifyCiCheckoutFreshness({
      repository_path: repo.directory,
      event_name: 'pull_request_target',
      event_revision: repo.merge,
      workflow_path: '.github/workflows/kernel.yml'
    }),
    /unsupported CI checkout event/
  );
});
