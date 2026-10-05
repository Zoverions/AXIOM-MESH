import { access, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../..');

const paths = Object.freeze({
  challenge: 'docs/architecture/contracts/agent-challenge.v1.schema.json',
  feedback: 'docs/architecture/contracts/agent-feedback.v1.schema.json',
  canonicalResult: 'agent-readiness/CONTRIBUTION-RESULT.schema.json',
  obsoleteDuplicateResult: 'docs/architecture/contracts/agent-contribution.v1.schema.json',
  contributionForm: '.github/ISSUE_TEMPLATE/agent-contribution-proposal.yml',
  feedbackForm: '.github/ISSUE_TEMPLATE/agent-feedback.yml',
  reproductionForm: '.github/ISSUE_TEMPLATE/community-testnet-result.yml'
});

function assert(condition, message) {
  if (!condition) throw new Error(`Agent Commons check failed: ${message}`);
}

async function read(relativePath) {
  return readFile(resolve(REPO_ROOT, relativePath), 'utf8');
}

async function readJson(relativePath) {
  return JSON.parse(await read(relativePath));
}

async function exists(relativePath) {
  try {
    await access(resolve(REPO_ROOT, relativePath));
    return true;
  } catch {
    return false;
  }
}

function assertSchemaBase(schema, expectedId, expectedConst) {
  assert(
    schema.$schema === 'https://json-schema.org/draft/2020-12/schema',
    `${expectedConst} must use JSON Schema 2020-12`
  );
  assert(schema.$id === expectedId, `${expectedConst} $id drifted`);
  assert(schema.type === 'object', `${expectedConst} must be an object`);
  assert(
    schema.additionalProperties === false,
    `${expectedConst} must fail closed on unknown top-level properties`
  );
  assert(
    schema.properties?.schema?.const === expectedConst,
    `${expectedConst} schema discriminator drifted`
  );
}

function assertExactShaRef(schema, propertyName) {
  const ref = schema.properties?.[propertyName]?.$ref;
  assert(ref === '#/$defs/gitSha', `${propertyName} must use the exact git SHA definition`);
  assert(
    schema.$defs?.gitSha?.pattern === '^[0-9a-f]{40}$',
    `${propertyName} git SHA definition must require 40 lowercase hex characters`
  );
}

export async function checkAgentCommons() {
  const [challenge, feedback, result, contributionForm, feedbackForm, reproductionForm] =
    await Promise.all([
      readJson(paths.challenge),
      readJson(paths.feedback),
      readJson(paths.canonicalResult),
      read(paths.contributionForm),
      read(paths.feedbackForm),
      read(paths.reproductionForm)
    ]);

  assert(
    !(await exists(paths.obsoleteDuplicateResult)),
    'obsolete duplicate agent-contribution.v1 schema must remain absent; use CONTRIBUTION-RESULT.schema.json'
  );

  assertSchemaBase(
    challenge,
    'https://raw.githubusercontent.com/Zoverions/AXIOM-MESH/main/docs/architecture/contracts/agent-challenge.v1.schema.json',
    'axiom-agent-challenge.v1'
  );
  assert(challenge.properties?.project?.const === 'AXIOM-MESH', 'challenge project identity drifted');
  assert(
    challenge.properties?.supported_build?.const === '0.12.0-dev.3',
    'challenge supported build drifted'
  );
  assert(
    challenge.properties?.canonical_repository?.const === 'Zoverions/AXIOM-MESH',
    'challenge canonical repository drifted'
  );
  assertExactShaRef(challenge, 'base_sha');
  assert(
    challenge.properties?.scope?.properties?.allowed_paths?.minItems === 1,
    'challenge must have at least one allowed path'
  );
  assert(
    challenge.properties?.scope?.properties?.prohibited_effects?.minItems === 1,
    'challenge must name prohibited effects'
  );
  assert(
    challenge.properties?.scope?.properties?.environment_boundary?.minItems === 1,
    'challenge must bind an authorized environment class'
  );
  assert(
    challenge.properties?.result_contract?.const === 'agent-readiness/CONTRIBUTION-RESULT.schema.json',
    'challenge must point to the canonical contribution result contract'
  );
  assert(
    challenge.properties?.disclosure?.properties?.public_issue_safe_only?.const === true,
    'challenge public intake must be public-safe only'
  );
  assert(
    challenge.properties?.disclosure?.properties?.sensitive_findings_route?.const === 'SECURITY.md',
    'challenge must route sensitive findings to SECURITY.md'
  );
  for (const field of [
    'runtime_authority_granted',
    'merge_authority_granted',
    'deployment_authority_granted',
    'credential_authority_granted',
    'spending_authority_granted',
    'hardware_custody_granted',
    'production_promotion_granted',
    'third_party_testing_authorized',
    'compensation_committed'
  ]) {
    assert(
      challenge.properties?.authority_nonclaims?.properties?.[field]?.const === false,
      `challenge ${field} must be false`
    );
  }

  assertSchemaBase(
    feedback,
    'https://raw.githubusercontent.com/Zoverions/AXIOM-MESH/main/docs/architecture/contracts/agent-feedback.v1.schema.json',
    'axiom-agent-feedback.v1'
  );
  assert(feedback.properties?.project?.const === 'AXIOM-MESH', 'feedback project identity drifted');
  assert(
    feedback.properties?.supported_build?.const === '0.12.0-dev.3',
    'feedback supported build drifted'
  );
  assert(
    feedback.properties?.canonical_repository?.const === 'Zoverions/AXIOM-MESH',
    'feedback canonical repository drifted'
  );
  assertExactShaRef(feedback, 'base_sha');
  assert(
    feedback.properties?.public_disclosure_safe?.const === true,
    'public feedback must be explicitly public-safe'
  );
  assert(
    feedback.properties?.authority_requested?.const === false,
    'feedback must not request authority'
  );
  assert(
    feedback.properties?.limitations?.minItems === 1,
    'feedback must state at least one limitation or uncertainty'
  );
  assert(
    feedback.properties?.source?.properties?.identity_assurance?.enum?.includes('unknown'),
    'feedback source assurance must represent unknown identity assurance'
  );
  for (const field of [
    'contains_secrets_or_credentials',
    'contains_private_data',
    'contains_weaponized_exploit_detail',
    'third_party_testing_performed'
  ]) {
    assert(
      feedback.properties?.safety?.properties?.[field]?.const === false,
      `feedback ${field} must be false`
    );
  }

  assertSchemaBase(
    result,
    'https://raw.githubusercontent.com/Zoverions/AXIOM-MESH/main/agent-readiness/CONTRIBUTION-RESULT.schema.json',
    'axiom-agent-contribution-result.v1'
  );
  assert(
    result.properties?.commit_sha?.pattern === '^[0-9a-f]{40}$',
    'canonical contribution result must bind an exact commit SHA'
  );
  assert(
    result.properties?.requested_triage_state?.const === 'EVIDENCE_SUBMITTED',
    'canonical contribution result must request EVIDENCE_SUBMITTED rather than self-accepting'
  );
  assert(
    result.properties?.safety?.properties?.environment_authorized?.const === true,
    'canonical contribution result must require an authorized environment'
  );
  assert(
    result.properties?.authority_nonclaims?.properties?.merge_authority_claimed?.const === false,
    'canonical contribution result must not claim merge authority'
  );
  assert(
    result.properties?.authority_nonclaims?.properties?.production_promotion_claimed?.const === false,
    'canonical contribution result must not claim production promotion'
  );

  const formChecks = [
    ['agent-contribution-proposal.yml', contributionForm, ['SECURITY.md', 'commit SHA', 'authority', 'CONTRIBUTION-RESULT.schema.json']],
    ['agent-feedback.yml', feedbackForm, ['SECURITY.md', 'Exact base commit SHA', 'authority', 'CONTRIBUTION-RESULT.schema.json', 'public-safe']],
    ['community-testnet-result.yml', reproductionForm, ['SECURITY.md', 'commit', 'authority', 'CONTRIBUTION-RESULT.schema.json']]
  ];
  for (const [name, form, markers] of formChecks) {
    for (const marker of markers) {
      assert(form.includes(marker), `${name} missing required marker: ${marker}`);
    }
  }

  return Object.freeze({
    ok: true,
    challenge_schema: challenge.properties.schema.const,
    feedback_schema: feedback.properties.schema.const,
    canonical_result_schema: result.properties.schema.const,
    public_issue_forms: 3,
    duplicate_result_schema_absent: true
  });
}

async function main() {
  process.stdout.write(`${JSON.stringify(await checkAgentCommons())}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
