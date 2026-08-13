import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import {
  HOST_LAB_MKOSI_URL,
  HOST_LAB_POLICY_URL,
  HOST_LAB_TOOLS_URL,
  HOST_LAB_ESP_REPART_URL,
  HOST_LAB_ROOT_REPART_URL,
  HOST_LAB_SNAPSHOT_URL,
  HOST_LAB_VERSION_URL,
  normalizeSnapshotLock,
  parseMkosiConfiguration,
  verifyAxiomHostLabConfiguration
} from '../src/check-axiom-host-lab.mjs';
import {
  laboratoryEnvironment,
  parseAxiomHostToolObservations
} from '../src/axiom-host-lab.mjs';

const [
  POLICY_TEXT,
  MKOSI_TEXT,
  TOOLS_TEXT,
  ESP_REPART_TEXT,
  ROOT_REPART_TEXT,
  VERSION_TEXT,
  SNAPSHOT_TEXT
] = await Promise.all([
  readFile(HOST_LAB_POLICY_URL, 'utf8'),
  readFile(HOST_LAB_MKOSI_URL, 'utf8'),
  readFile(HOST_LAB_TOOLS_URL, 'utf8'),
  readFile(HOST_LAB_ESP_REPART_URL, 'utf8'),
  readFile(HOST_LAB_ROOT_REPART_URL, 'utf8'),
  readFile(HOST_LAB_VERSION_URL, 'utf8'),
  readFile(HOST_LAB_SNAPSHOT_URL, 'utf8')
]);

test('AXIOM Host H0 laboratory configuration is valid, snapshot-locked, and non-promoting', async () => {
  const result = await verifyAxiomHostLabConfiguration();
  assert.equal(result.valid, true);
  assert.equal(result.schema, 'axiom-host-lab-policy.v1');
  assert.equal(result.stage, 'H0');
  assert.equal(result.builder_minimum_version, '26');
  assert.equal(result.target, 'fedora-rawhide-x86-64');
  assert.equal(result.tools_tree, 'fedora-rawhide');
  assert.equal(result.tools_tree_snapshot_locked, true);
  assert.equal(result.production_base_selected, false);
  assert.equal(result.snapshot_locked, true);
  assert.equal(result.snapshot, SNAPSHOT_TEXT.trim());
  assert.equal(result.image_id, 'axiom-host-lab');
  assert.equal(result.output_directory, 'mkosi.output');
  assert.equal(result.image_version, '0.1.0-h0');
  assert.equal(result.repart_layout, 'vfat-512M,ext4-2G');
  assert.equal(result.root_filesystem, 'ext4');
  assert.equal(result.bootloader, 'systemd-boot');
  assert.equal(result.network, 'none');
  assert.equal(result.virtual_tpm, false);
  assert.equal(result.production_promoted, false);
});

test('mkosi parser preserves package continuations without accepting duplicate keys', () => {
  const parsed = parseMkosiConfiguration('[Content]\nPackages=a\n         b\nWithDocs=no\n');
  assert.equal(parsed.get('Content').get('Packages'), 'a b');
  assert.throws(
    () => parseMkosiConfiguration('[Content]\nPackages=a\nPackages=b\n'),
    /repeats \[Content] Packages/
  );
});

test('Rawhide snapshot lock is exact and cannot silently use latest packages', async () => {
  const snapshot = '20260812.n.0';
  const lockedMkosi = MKOSI_TEXT.replace(/^Snapshot=.*$/m, `Snapshot=${snapshot}`);
  const lockedTools = TOOLS_TEXT.replace(/^Snapshot=.*$/m, `Snapshot=${snapshot}`);
  await withFixture({
    snapshot: `${snapshot}\n`,
    mkosi: lockedMkosi,
    tools: lockedTools
  }, async urls => {
    const result = await verifyAxiomHostLabConfiguration(urls);
    assert.equal(result.snapshot_locked, true);
    assert.equal(result.snapshot, snapshot);
  });

  const withoutSnapshot = MKOSI_TEXT.replace(/^Snapshot=.*\n/m, '');
  await withFixture({
    snapshot: `${snapshot}\n`,
    mkosi: withoutSnapshot,
    tools: lockedTools
  }, async urls => {
    await assert.rejects(
      verifyAxiomHostLabConfiguration(urls),
      /missing \[Distribution] Snapshot/
    );
  });

  await withFixture({
    snapshot: 'UNRESOLVED\n',
    mkosi: lockedMkosi
  }, async urls => {
    await assert.rejects(
      verifyAxiomHostLabConfiguration(urls),
      /must not declare Snapshot while the snapshot lock is UNRESOLVED/
    );
  });

  assert.throws(
    () => normalizeSnapshotLock('Fedora-Rawhide-20260812.n.0'),
    /without Fedora-Rawhide- prefix/
  );
});

test('H0 verifier rejects remote access, secret-bearing settings, builder downgrade, and authority promotion', async () => {
  await withFixture({
    mkosi: MKOSI_TEXT.replace('Autologin=no', 'Autologin=yes')
  }, async urls => {
    await assert.rejects(
      verifyAxiomHostLabConfiguration(urls),
      /Autologin must equal no/
    );
  });

  await withFixture({
    mkosi: `${MKOSI_TEXT}\n[Secrets]\nSecureBootKey=/tmp/lab.key\n`
  }, async urls => {
    await assert.rejects(
      verifyAxiomHostLabConfiguration(urls),
      /must not contain secret-bearing or remote-access setting SecureBootKey/
    );
  });

  await withFixture({
    mkosi: MKOSI_TEXT.replace('MinimumVersion=26', 'MinimumVersion=25')
  }, async urls => {
    await assert.rejects(
      verifyAxiomHostLabConfiguration(urls),
      /MinimumVersion must equal 26/
    );
  });

  const promoted = JSON.parse(POLICY_TEXT);
  promoted.authority.production_policy_changed = true;
  await withFixture({
    policy: `${JSON.stringify(promoted, null, 2)}\n`
  }, async urls => {
    await assert.rejects(
      verifyAxiomHostLabConfiguration(urls),
      /production_policy_changed must be false/
    );
  });
});

test('H0 verifier rejects moving tools, implicit filesystem layout, and filesystem sizing drift', async () => {
  await withFixture({
    tools: TOOLS_TEXT.replace(/^Snapshot=.*$/m, 'Snapshot=20260814.n.0')
  }, async urls => {
    await assert.rejects(
      verifyAxiomHostLabConfiguration(urls),
      /tools-tree invariant drifted.*Snapshot/
    );
  });

  await withFixture({
    rootRepart: ROOT_REPART_TEXT.replace('Format=ext4', 'Format=btrfs')
  }, async urls => {
    await assert.rejects(
      verifyAxiomHostLabConfiguration(urls),
      /10-root.conf Format must equal ext4/
    );
  });

  await withFixture({
    rootRepart: `${ROOT_REPART_TEXT}Minimize=guess\n`
  }, async urls => {
    await assert.rejects(
      verifyAxiomHostLabConfiguration(urls),
      /must not use filesystem-dependent Minimize sizing/
    );
  });
});

test('laboratory environment does not forward arbitrary host secrets', () => {
  const environment = laboratoryEnvironment(1_786_500_000, {
    PATH: '/usr/bin',
    HOME: '/tmp/axiom-host-test',
    LANG: 'C.UTF-8',
    AWS_SECRET_ACCESS_KEY: 'must-not-pass',
    OPENAI_API_KEY: 'must-not-pass',
    GITHUB_TOKEN: 'must-not-pass',
    AXIOM_DATA_KEY: 'must-not-pass',
    E2FSPROGS_FAKE_TIME: '1',
    SYSTEMD_REPART_MKFS_OPTIONS_EXT4: '-E hash_seed=attacker-controlled',
    TZ: 'Pacific/Kiritimati'
  });

  assert.equal(environment.PATH, '/usr/bin');
  assert.equal(environment.HOME, '/tmp/axiom-host-test');
  assert.equal(environment.SOURCE_DATE_EPOCH, '1786500000');
  assert.equal(environment.E2FSPROGS_FAKE_TIME, '1786500000');
  assert.equal(
    environment.SYSTEMD_REPART_MKFS_OPTIONS_EXT4,
    '-O ^has_journal -E hash_seed=6e56f338-f1f4-5cc8-a7fb-3dc1c107485c'
  );
  assert.equal(environment.TZ, 'UTC');
  assert.equal(environment.AXIOM_HOST_LAB, '1');
  assert.equal(environment.AWS_SECRET_ACCESS_KEY, undefined);
  assert.equal(environment.OPENAI_API_KEY, undefined);
  assert.equal(environment.GITHUB_TOKEN, undefined);
  assert.equal(environment.AXIOM_DATA_KEY, undefined);
});

test('builder tool observations require one bounded record for every filesystem tool', () => {
  const observations = parseAxiomHostToolObservations([
    'AXIOM_TOOL_BEGIN:systemd_repart',
    'systemd 258 (258.10-1.fc43)',
    'AXIOM_TOOL_END:systemd_repart',
    'AXIOM_TOOL_BEGIN:mkfs_ext4',
    'mke2fs 1.47.2',
    'AXIOM_TOOL_END:mkfs_ext4',
    'AXIOM_TOOL_BEGIN:mkfs_vfat',
    'mkfs.fat 4.2',
    'AXIOM_TOOL_END:mkfs_vfat',
    'AXIOM_TOOL_BEGIN:mcopy',
    'mcopy (GNU mtools) 4.0.49',
    'AXIOM_TOOL_END:mcopy',
    ''
  ].join('\n'));
  assert.equal(observations.mkfs_ext4, 'mke2fs 1.47.2');
  assert.equal(observations.mcopy, 'mcopy (GNU mtools) 4.0.49');
  assert.throws(
    () => parseAxiomHostToolObservations('AXIOM_TOOL_BEGIN:systemd_repart\nsystemd 258\n'),
    /invalid end marker/
  );
});

async function withFixture(overrides, callback) {
  const root = await mkdtemp(join(tmpdir(), 'axiom-host-lab-'));
  try {
    const policyPath = join(root, 'policy.json');
    const mkosiPath = join(root, 'mkosi.conf');
    const versionPath = join(root, 'mkosi.version');
    const snapshotPath = join(root, 'mkosi.snapshot');
    const toolsPath = join(root, 'mkosi.tools.conf');
    const espRepartPath = join(root, '00-esp.conf');
    const rootRepartPath = join(root, '10-root.conf');
    await Promise.all([
      writeFile(policyPath, overrides.policy ?? POLICY_TEXT),
      writeFile(mkosiPath, overrides.mkosi ?? MKOSI_TEXT),
      writeFile(versionPath, overrides.version ?? VERSION_TEXT),
      writeFile(snapshotPath, overrides.snapshot ?? SNAPSHOT_TEXT),
      writeFile(toolsPath, overrides.tools ?? TOOLS_TEXT),
      writeFile(espRepartPath, overrides.espRepart ?? ESP_REPART_TEXT),
      writeFile(rootRepartPath, overrides.rootRepart ?? ROOT_REPART_TEXT)
    ]);
    await callback({
      policyUrl: pathToFileURL(policyPath),
      mkosiUrl: pathToFileURL(mkosiPath),
      toolsUrl: pathToFileURL(toolsPath),
      espRepartUrl: pathToFileURL(espRepartPath),
      rootRepartUrl: pathToFileURL(rootRepartPath),
      versionUrl: pathToFileURL(versionPath),
      snapshotUrl: pathToFileURL(snapshotPath)
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
