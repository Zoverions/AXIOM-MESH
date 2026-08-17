import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { DataProtector } from '../src/lib/protector.mjs';
import {
  REMOTE_SOCIAL_PROTECTED_COLUMN_MAPPINGS,
  reencryptRemoteSocialProtectedColumns
} from '../src/grid/remote-social-protection.mjs';
import {
  reencryptSocialProtectedColumns
} from '../src/grid/social-protection.mjs';

function protect(protector, table, column, key, value) {
  return protector.seal(value, `axiom:${table}.${column}:${key}`);
}

function open(protector, table, column, key, value) {
  return protector.open(value, `axiom:${table}.${column}:${key}`);
}

function protectors() {
  return {
    source: new DataProtector(randomBytes(32)),
    target: new DataProtector(randomBytes(32))
  };
}

function createRemoteTables(db) {
  db.exec(`
    CREATE TABLE remote_social_staging (
      stage_id TEXT PRIMARY KEY,
      package_json TEXT NOT NULL,
      import_plan_json TEXT NOT NULL,
      trusted_exporter_json TEXT NOT NULL
    ) STRICT;
    CREATE TABLE remote_social_admissions (
      admission_id TEXT PRIMARY KEY,
      summary_json TEXT NOT NULL
    ) STRICT;
    CREATE TABLE remote_social_observations (
      observation_id TEXT PRIMARY KEY,
      object_json TEXT NOT NULL
    ) STRICT;
    CREATE TABLE remote_social_follows (
      follow_id TEXT PRIMARY KEY,
      trust_json TEXT NOT NULL
    ) STRICT;
    CREATE TABLE remote_social_transport_jobs (
      job_id TEXT PRIMARY KEY,
      review_json TEXT NOT NULL,
      receipt_json TEXT
    ) STRICT;
  `);
}

test('remote social rotation inventory covers every encrypted S3C/D/E/F column exactly once', () => {
  assert.deepEqual(REMOTE_SOCIAL_PROTECTED_COLUMN_MAPPINGS, [
    ['remote_social_staging', 'stage_id', [
      'package_json',
      'import_plan_json',
      'trusted_exporter_json'
    ]],
    ['remote_social_admissions', 'admission_id', ['summary_json']],
    ['remote_social_observations', 'observation_id', ['object_json']],
    ['remote_social_follows', 'follow_id', ['trust_json']],
    ['remote_social_transport_jobs', 'job_id', ['review_json', 'receipt_json']]
  ]);
  const columns = REMOTE_SOCIAL_PROTECTED_COLUMN_MAPPINGS
    .flatMap(([table, , names]) => names.map(column => `${table}.${column}`));
  assert.equal(new Set(columns).size, columns.length);
});

test('remote social rotation is a zero-op when no remote schema is present', () => {
  const db = new DatabaseSync(':memory:');
  const { source, target } = protectors();
  try {
    assert.deepEqual(
      reencryptRemoteSocialProtectedColumns({
        db,
        sourceProtector: source,
        targetProtector: target
      }),
      { protected_values: 0, tables: {} }
    );
  } finally {
    db.close();
  }
});

test('remote social rotation re-encrypts every present protected value under the exact established context', () => {
  const db = new DatabaseSync(':memory:');
  const { source, target } = protectors();
  createRemoteTables(db);
  const values = [
    ['remote_social_staging', 'stage-1', 'package_json', { package: 'signed-public-package' }],
    ['remote_social_staging', 'stage-1', 'import_plan_json', { status: 'review-only' }],
    ['remote_social_staging', 'stage-1', 'trusted_exporter_json', { key_id: 'a'.repeat(64) }],
    ['remote_social_admissions', 'admission-1', 'summary_json', { approval: 'one-use' }],
    ['remote_social_observations', 'observation-1', 'object_json', { kind: 'publication' }],
    ['remote_social_follows', 'follow-1', 'trust_json', { trust_label: 'manual-review' }],
    ['remote_social_transport_jobs', 'job-1', 'review_json', { trust_label: 'manual-review' }],
    ['remote_social_transport_jobs', 'job-1', 'receipt_json', { admission_effect: 'none' }]
  ];

  db.prepare(`
    INSERT INTO remote_social_staging(stage_id, package_json, import_plan_json, trusted_exporter_json)
    VALUES (?, ?, ?, ?)
  `).run(
    'stage-1',
    protect(source, 'remote_social_staging', 'package_json', 'stage-1', values[0][3]),
    protect(source, 'remote_social_staging', 'import_plan_json', 'stage-1', values[1][3]),
    protect(source, 'remote_social_staging', 'trusted_exporter_json', 'stage-1', values[2][3])
  );
  db.prepare('INSERT INTO remote_social_admissions(admission_id, summary_json) VALUES (?, ?)').run(
    'admission-1',
    protect(source, 'remote_social_admissions', 'summary_json', 'admission-1', values[3][3])
  );
  db.prepare('INSERT INTO remote_social_observations(observation_id, object_json) VALUES (?, ?)').run(
    'observation-1',
    protect(source, 'remote_social_observations', 'object_json', 'observation-1', values[4][3])
  );
  db.prepare('INSERT INTO remote_social_follows(follow_id, trust_json) VALUES (?, ?)').run(
    'follow-1',
    protect(source, 'remote_social_follows', 'trust_json', 'follow-1', values[5][3])
  );
  db.prepare(`
    INSERT INTO remote_social_transport_jobs(job_id, review_json, receipt_json)
    VALUES (?, ?, ?)
  `).run(
    'job-1',
    protect(source, 'remote_social_transport_jobs', 'review_json', 'job-1', values[6][3]),
    protect(source, 'remote_social_transport_jobs', 'receipt_json', 'job-1', values[7][3])
  );

  try {
    const result = reencryptRemoteSocialProtectedColumns({
      db,
      sourceProtector: source,
      targetProtector: target
    });
    assert.equal(result.protected_values, 8);
    assert.deepEqual(result.tables, {
      remote_social_staging: 3,
      remote_social_admissions: 1,
      remote_social_observations: 1,
      remote_social_follows: 1,
      remote_social_transport_jobs: 2
    });

    for (const [table, key, column, expected] of values) {
      const serialized = db.prepare(`SELECT ${column} AS value FROM ${table} WHERE ${
        table === 'remote_social_staging' ? 'stage_id'
          : table === 'remote_social_admissions' ? 'admission_id'
            : table === 'remote_social_observations' ? 'observation_id'
              : table === 'remote_social_follows' ? 'follow_id'
                : 'job_id'
      } = ?`).get(key).value;
      assert.deepEqual(open(target, table, column, key, serialized), expected);
      assert.throws(
        () => open(source, table, column, key, serialized),
        /authentication failed/
      );
    }
  } finally {
    db.close();
  }
});

test('nullable remote protected columns are skipped without inventing ciphertext', () => {
  const db = new DatabaseSync(':memory:');
  const { source, target } = protectors();
  db.exec(`
    CREATE TABLE remote_social_transport_jobs (
      job_id TEXT PRIMARY KEY,
      review_json TEXT NOT NULL,
      receipt_json TEXT
    ) STRICT;
  `);
  db.prepare(`
    INSERT INTO remote_social_transport_jobs(job_id, review_json, receipt_json)
    VALUES (?, ?, NULL)
  `).run(
    'job-pending',
    protect(source, 'remote_social_transport_jobs', 'review_json', 'job-pending', { status: 'pending' })
  );
  try {
    const result = reencryptRemoteSocialProtectedColumns({
      db,
      sourceProtector: source,
      targetProtector: target
    });
    assert.equal(result.protected_values, 1);
    assert.equal(result.tables.remote_social_transport_jobs, 1);
    const row = db.prepare(`
      SELECT review_json, receipt_json FROM remote_social_transport_jobs WHERE job_id = ?
    `).get('job-pending');
    assert.deepEqual(
      open(target, 'remote_social_transport_jobs', 'review_json', 'job-pending', row.review_json),
      { status: 'pending' }
    );
    assert.equal(row.receipt_json, null);
  } finally {
    db.close();
  }
});

test('remote rotation rolls back all earlier table changes if a present remote schema is incomplete', () => {
  const db = new DatabaseSync(':memory:');
  const { source, target } = protectors();
  db.exec(`
    CREATE TABLE remote_social_staging (
      stage_id TEXT PRIMARY KEY,
      package_json TEXT NOT NULL,
      import_plan_json TEXT NOT NULL,
      trusted_exporter_json TEXT NOT NULL
    ) STRICT;
    CREATE TABLE remote_social_transport_jobs (
      job_id TEXT PRIMARY KEY,
      review_json TEXT NOT NULL
    ) STRICT;
  `);
  const originalPackage = protect(
    source,
    'remote_social_staging',
    'package_json',
    'stage-rollback',
    { package: 'must-remain-under-source-key' }
  );
  db.prepare(`
    INSERT INTO remote_social_staging(stage_id, package_json, import_plan_json, trusted_exporter_json)
    VALUES (?, ?, ?, ?)
  `).run(
    'stage-rollback',
    originalPackage,
    protect(source, 'remote_social_staging', 'import_plan_json', 'stage-rollback', { plan: true }),
    protect(source, 'remote_social_staging', 'trusted_exporter_json', 'stage-rollback', { exporter: true })
  );
  db.prepare(`
    INSERT INTO remote_social_transport_jobs(job_id, review_json) VALUES (?, ?)
  `).run(
    'job-incomplete',
    protect(source, 'remote_social_transport_jobs', 'review_json', 'job-incomplete', { review: true })
  );
  try {
    assert.throws(
      () => reencryptRemoteSocialProtectedColumns({
        db,
        sourceProtector: source,
        targetProtector: target
      }),
      /protected column is missing.*receipt_json/
    );
    const after = db.prepare(`
      SELECT package_json FROM remote_social_staging WHERE stage_id = ?
    `).get('stage-rollback').package_json;
    assert.equal(after, originalPackage);
    assert.deepEqual(
      open(source, 'remote_social_staging', 'package_json', 'stage-rollback', after),
      { package: 'must-remain-under-source-key' }
    );
    assert.throws(
      () => open(target, 'remote_social_staging', 'package_json', 'stage-rollback', after),
      /authentication failed/
    );
  } finally {
    db.close();
  }
});

test('existing social rotation entry point aggregates local and remote protected values', () => {
  const db = new DatabaseSync(':memory:');
  const { source, target } = protectors();
  db.exec(`
    CREATE TABLE actor_states (
      actor_id TEXT PRIMARY KEY,
      state_json TEXT NOT NULL
    ) STRICT;
    CREATE TABLE remote_social_staging (
      stage_id TEXT PRIMARY KEY,
      package_json TEXT NOT NULL,
      import_plan_json TEXT NOT NULL,
      trusted_exporter_json TEXT NOT NULL
    ) STRICT;
  `);
  db.prepare('INSERT INTO actor_states(actor_id, state_json) VALUES (?, ?)').run(
    'actor-1',
    protect(source, 'actor_states', 'state_json', 'actor-1', { actor_id: 'actor-1' })
  );
  db.prepare(`
    INSERT INTO remote_social_staging(stage_id, package_json, import_plan_json, trusted_exporter_json)
    VALUES (?, ?, ?, ?)
  `).run(
    'stage-1',
    protect(source, 'remote_social_staging', 'package_json', 'stage-1', { package: 1 }),
    protect(source, 'remote_social_staging', 'import_plan_json', 'stage-1', { plan: 1 }),
    protect(source, 'remote_social_staging', 'trusted_exporter_json', 'stage-1', { exporter: 1 })
  );
  try {
    const result = reencryptSocialProtectedColumns({
      db,
      sourceProtector: source,
      targetProtector: target
    });
    assert.equal(result.protected_values, 4);
    assert.equal(result.tables.actor_states, 1);
    assert.equal(result.tables.remote_social_staging, 3);
  } finally {
    db.close();
  }
});
