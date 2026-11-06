import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  replaceFileWithWindowsRetry,
  writeFileAtomically
} from '../src/lib/windows-atomic-file.mjs';

const fixtures = new Set();

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'axiom-windows-atomic-file-'));
  fixtures.add(root);
  return root;
}

test.afterEach(async () => {
  await Promise.all([...fixtures].map((root) => rm(root, { recursive: true, force: true })));
  fixtures.clear();
});

test('atomic writer replaces a regular file and leaves no temporary sibling', async () => {
  const root = await fixture();
  const target = join(root, 'state.json');
  await writeFile(target, 'old');

  await writeFileAtomically(target, 'new', 0o600);

  assert.equal(await readFile(target, 'utf8'), 'new');
  assert.deepEqual(await readdir(root), ['state.json']);
});

test('atomic writer rejects a directory target and removes incomplete temporary state', async () => {
  const root = await fixture();
  const target = join(root, 'state.json');
  await mkdir(target);

  await assert.rejects(writeFileAtomically(target, 'new', 0o600), { code: 'EISDIR' });

  assert.deepEqual(await readdir(root), ['state.json']);
});

test('atomic writer rejects a symlink target and removes incomplete temporary state', async (t) => {
  const root = await fixture();
  const real = join(root, 'real.json');
  const target = join(root, 'state.json');
  await writeFile(real, 'old');
  try {
    await symlink(real, target, 'file');
  } catch (error) {
    if (process.platform === 'win32' && error?.code === 'EPERM') {
      t.skip('Windows runner does not permit symlink creation');
      return;
    }
    throw error;
  }

  await assert.rejects(writeFileAtomically(target, 'new', 0o600), { code: 'ELOOP' });

  assert.equal(await readFile(real, 'utf8'), 'old');
  assert.deepEqual((await readdir(root)).sort(), ['real.json', 'state.json']);
});

test('Windows rename waits for a transient exclusive target lock, then commits once', { skip: process.platform !== 'win32', timeout: 15_000 }, async () => {
  const { spawn } = await import('node:child_process');
  const root = await fixture();
  const source = join(root, 'source.json');
  const target = join(root, 'target.json');
  await writeFile(source, 'new');
  await writeFile(target, 'old');
  const holder = spawn('pwsh.exe', [
    '-NoProfile', '-NonInteractive', '-Command',
    "$held = [IO.File]::Open($env:AXIOM_HELD_FILE, 'Open', 'Read', 'None'); [Console]::Out.WriteLine('held'); Start-Sleep -Milliseconds 1200; $held.Close()"
  ], { env: { ...process.env, AXIOM_HELD_FILE: target } });
  const released = new Promise((resolve) => holder.once('exit', resolve));
  await new Promise((resolve) => holder.stdout.once('data', resolve));

  await replaceFileWithWindowsRetry(source, target);

  assert.equal(await readFile(target, 'utf8'), 'new');
  await released;
});

test('Windows rename that never releases fails by deadline without committing', { skip: process.platform !== 'win32', timeout: 15_000 }, async () => {
  const { spawn } = await import('node:child_process');
  const root = await fixture();
  const source = join(root, 'source.json');
  const target = join(root, 'target.json');
  await writeFile(source, 'new');
  await writeFile(target, 'old');
  const holder = spawn('pwsh.exe', [
    '-NoProfile', '-NonInteractive', '-Command',
    "$held = [IO.File]::Open($env:AXIOM_HELD_FILE, 'Open', 'Read', 'None'); [Console]::Out.WriteLine('held'); Start-Sleep -Milliseconds 1500; $held.Close()"
  ], { env: { ...process.env, AXIOM_HELD_FILE: target } });
  const released = new Promise((resolve) => holder.once('exit', resolve));
  await new Promise((resolve) => holder.stdout.once('data', resolve));

  await assert.rejects(
    replaceFileWithWindowsRetry(source, target, { deadlineMs: 200 }),
    (error) => ['EPERM', 'EACCES', 'EBUSY'].includes(error?.code)
  );

  assert.equal(await readFile(source, 'utf8'), 'new');
  await released;
  assert.equal(await readFile(target, 'utf8'), 'old');
});
