import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import impactPolicy from '../config/documentation-impact-policy.json' with { type: 'json' };
import { canonicalJson, digestObject, ValidationError } from './lib/canonical.mjs';

export const DOCUMENTATION_IMPACT_POLICY_SCHEMA =
  'axiom-documentation-impact-policy.v1';

export function validateDocumentationImpactPolicy(policy = impactPolicy) {
  exactObject(policy, 'Documentation impact policy', [
    'schema', 'version', 'status', 'rules'
  ]);
  if (
    policy.schema !== DOCUMENTATION_IMPACT_POLICY_SCHEMA
    || policy.version !== 1
    || policy.status !== 'enforced-on-pull-request-diffs'
    || !Array.isArray(policy.rules)
    || policy.rules.length < 5
  ) throw new ValidationError('Documentation impact policy identity is invalid');

  const ids = new Set();
  for (const rule of policy.rules) {
    exactObject(rule, 'Documentation impact rule', [
      'id', 'trigger', 'required_groups'
    ]);
    if (
      typeof rule.id !== 'string'
      || !/^[a-z][a-z0-9-]{2,63}$/.test(rule.id)
      || ids.has(rule.id)
    ) throw new ValidationError('Documentation impact rule id is invalid or duplicated');
    ids.add(rule.id);
    exactObject(rule.trigger, `${rule.id} trigger`, ['exact', 'prefixes']);
    for (const list of [rule.trigger.exact, rule.trigger.prefixes]) {
      if (!Array.isArray(list) || list.some(value => !validRepositoryPath(value))) {
        throw new ValidationError(`${rule.id} trigger path inventory is invalid`);
      }
    }
    if (rule.trigger.exact.length + rule.trigger.prefixes.length === 0) {
      throw new ValidationError(`${rule.id} has no trigger paths`);
    }
    if (!Array.isArray(rule.required_groups) || rule.required_groups.length === 0) {
      throw new ValidationError(`${rule.id} has no required documentation groups`);
    }
    const groupIds = new Set();
    for (const group of rule.required_groups) {
      exactObject(group, `${rule.id} required group`, ['id', 'any_of']);
      if (
        typeof group.id !== 'string'
        || !/^[a-z][a-z0-9-]{2,63}$/.test(group.id)
        || groupIds.has(group.id)
        || !Array.isArray(group.any_of)
        || group.any_of.length === 0
        || group.any_of.some(value => !validRepositoryPath(value))
      ) throw new ValidationError(`${rule.id} required group is invalid`);
      groupIds.add(group.id);
    }
  }
  return {
    valid: true,
    schema: policy.schema,
    rules: policy.rules.length,
    policy_digest: digestObject(policy)
  };
}

export function evaluateDocumentationImpact(changedPaths, policy = impactPolicy) {
  const validation = validateDocumentationImpactPolicy(policy);
  if (!Array.isArray(changedPaths)) {
    throw new ValidationError('Changed path inventory must be an array');
  }
  const paths = [...new Set(changedPaths
    .map(value => normalizePath(value))
    .filter(Boolean))].sort();
  if (paths.some(value => !validRepositoryPath(value))) {
    throw new ValidationError('Changed path inventory contains an invalid repository path');
  }
  const changed = new Set(paths);
  const triggered = [];
  const violations = [];
  for (const rule of policy.rules) {
    const matchingTriggers = paths.filter(path => ruleMatchesPath(rule, path));
    if (matchingTriggers.length === 0) continue;
    const groups = rule.required_groups.map(group => {
      const matchingDocumentation = group.any_of.filter(path => changed.has(path));
      const satisfied = matchingDocumentation.length > 0;
      if (!satisfied) {
        violations.push({
          rule_id: rule.id,
          group_id: group.id,
          any_of: [...group.any_of]
        });
      }
      return {
        id: group.id,
        satisfied,
        matching_paths: matchingDocumentation
      };
    });
    triggered.push({
      id: rule.id,
      matching_triggers: matchingTriggers,
      required_groups: groups
    });
  }
  return {
    valid: violations.length === 0,
    schema: 'axiom-documentation-impact-result.v1',
    policy_digest: validation.policy_digest,
    changed_path_count: paths.length,
    triggered_rule_count: triggered.length,
    triggered_rules: triggered,
    violations
  };
}

export function assertDocumentationImpact(changedPaths, policy = impactPolicy) {
  const result = evaluateDocumentationImpact(changedPaths, policy);
  if (!result.valid) {
    const summary = result.violations
      .map(item => `${item.rule_id}/${item.group_id}: ${item.any_of.join(' | ')}`)
      .join('; ');
    throw new ValidationError(`Documentation impact requirements are incomplete: ${summary}`);
  }
  return result;
}

async function main(argv = process.argv.slice(2)) {
  if (canonicalJson(argv) === canonicalJson(['--policy-only'])) {
    return validateDocumentationImpactPolicy();
  }
  if (argv.length === 3 && argv[0] === '--git-range') {
    const paths = gitChangedPaths(argv[1], argv[2]);
    return assertDocumentationImpact(paths);
  }
  if (canonicalJson(argv) === canonicalJson(['--stdin'])) {
    const input = await readFile(0, 'utf8');
    return assertDocumentationImpact(input.split(/\r?\n/));
  }
  throw new ValidationError(
    'Usage: node src/check-documentation-impact.mjs --policy-only | --git-range <base-sha> <head-sha> | --stdin'
  );
}

function gitChangedPaths(base, head) {
  for (const [label, value] of [['base', base], ['head', head]]) {
    if (typeof value !== 'string' || !/^[a-f0-9]{40}$/.test(value)) {
      throw new ValidationError(`Documentation impact ${label} SHA is invalid`);
    }
  }
  let output;
  try {
    output = execFileSync(
      'git',
      ['diff', '--name-only', '--diff-filter=ACMRT', base, head],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    );
  } catch (error) {
    throw new ValidationError(`Unable to compute documentation impact diff: ${error.message}`);
  }
  return output.split(/\r?\n/).filter(Boolean);
}

function ruleMatchesPath(rule, path) {
  return rule.trigger.exact.includes(path)
    || rule.trigger.prefixes.some(prefix => path.startsWith(prefix));
}

function validRepositoryPath(value) {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= 240
    && !value.startsWith('/')
    && !value.includes('\\')
    && !value.split('/').includes('..');
}

function normalizePath(value) {
  return typeof value === 'string' ? value.trim().replace(/^\.\//, '') : '';
}

function exactObject(value, label, keys) {
  if (
    !value
    || typeof value !== 'object'
    || Array.isArray(value)
    || canonicalJson(Object.keys(value).sort()) !== canonicalJson([...keys].sort())
  ) throw new ValidationError(`${label} key inventory drifted`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await main();
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.name ?? 'Error'}: ${error.message}\n`);
    process.exitCode = 1;
  }
}
