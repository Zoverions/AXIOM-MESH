import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import test from 'node:test';

import { inspectLocalGitSource } from '../src/repository-operator/local-git-source.mjs';

function inspector(archiveBytes, { submodule = false } = {}) {
  return (command, args, options, callback) => {
    const operation = args[2];
    if (command !== 'git') {
      callback(new Error('unexpected command'), Buffer.alloc(0), Buffer.alloc(0));
      return;
    }
    if (operation === 'rev-parse' && args.includes('--show-object-format')) {
      callback(null, Buffer.from('sha1\n'), Buffer.alloc(0));
      return;
    }
    if (operation === 'rev-parse' && args.includes('--verify')) {
      callback(null, Buffer.from(`${'a'.repeat(40)}\n`), Buffer.alloc(0));
      return;
    }
    if (operation === 'show') {
      callback(null, Buffer.from(`${'b'.repeat(40)}\n`), Buffer.alloc(0));
      return;
    }
    if (operation === 'ls-tree') {
      const type = submodule ? 'commit' : 'blob';
      const mode = submodule ? '160000' : '100644';
      callback(
        null,
        Buffer.from(`${mode} ${type} ${'c'.repeat(40)}\tREADME.md\0`),
        Buffer.alloc(0)
      );
      return;
    }
    if (operation === 'fsck') {
      callback(null, Buffer.alloc(0), Buffer.alloc(0));
      return;
    }
    if (operation === 'archive') {
      callback(null, Buffer.from(archiveBytes), Buffer.alloc(0));
      return;
    }
    callback(new Error('unexpected Git operation'), Buffer.alloc(0), Buffer.alloc(0));
  };
}

test('AXIOM source manifest changes when archived source bytes change even if Git SHA-1 ids are identical', async () => {
  const first = await inspectLocalGitSource({
    repository_path: tmpdir(),
    execFileImpl: inspector('first source bytes')
  });
  const second = await inspectLocalGitSource({
    repository_path: tmpdir(),
    execFileImpl: inspector('second source bytes')
  });

  assert.equal(first.object_format, 'sha1');
  assert.equal(second.object_format, 'sha1');
  assert.equal(first.commit_oid, second.commit_oid);
  assert.equal(first.tree_oid, second.tree_oid);
  assert.notEqual(first.source_archive_sha256, second.source_archive_sha256);
  assert.notEqual(first.source_manifest_digest, second.source_manifest_digest);
  assert.equal(first.source_bytes_independently_committed, true);
  assert.equal(second.source_bytes_independently_committed, true);
});

test('submodule commit entries fail closed until their source content can be independently committed', async () => {
  await assert.rejects(
    inspectLocalGitSource({
      repository_path: tmpdir(),
      execFileImpl: inspector('archive bytes', { submodule: true })
    }),
    /does not support submodule commit entries/
  );
});
