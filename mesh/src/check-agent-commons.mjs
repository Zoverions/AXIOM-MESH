import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../..');

const paths = Object.freeze({
  entry: 'AGENTS.md',
  architecture: 'docs/architecture/AGENT-COMMONS.md',
  challenge: 'docs/architecture/contracts/agent-challenge.v1.schema.json',
  contribution: 'docs/architecture/contracts/agent-contribution.v1.schema.json',
  feedback: 'docs/architecture/contracts/agent-feedback.v1.schema.json',
  contributionForm: '.github/ISSUE_TEMPLATE/agent-contribution.yml',
  feedbackForm: '.github/ISSUE_TEMPLATE/agent-feedback.yml',
  reproductionForm: '.github/ISSUE_TEMPLATE/agent-reproduction.yml'
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

function assertSchemaBase(schema, expectedId, expectedConst) {
  assert(schema.$schema === 'https://json-schema.org/draft/2020-12/schema', `${expectedConst} must use JSON Schema 2020-12`);
  assert(schema.$id === expectedId, `${expectedConst} $id drifted`);
  assert(schema.type === 'object', `${expectedConst} must be an object`);
  assert(schema.additionalProperties === false, `${expectedConst} must fail closed on unknown top-level properties`);
  assert(schema.properties?.schema?.const === expectedConst, `${expectedConst} schema discriminator drifted`);
}

export async function checkAgentCommons() {
  const [
    entry,
    architecture,
    challenge,
    contribution,
    feedback,
    contributionForm,
    feedbackForm,
    reproductionForm
  ] = await Promise.all([
    read(paths.entry),
    read(paths.architecture),
    readJson(paths.challenge),
    readJson(paths.contribution),
    readJson(paths.feedback),
    read(paths.contributionForm),
    read(paths.feedbackForm),
    read(paths.reproductionForm)
  ]);

  for (const marker of [
    'mesh/config/capabilities.json',
    'GitHub is the canonical public collaboration surface',
    'does **not** currently claim a deployed agent federation',
    'Gateway -> Hypervisor -> Sandbox -> Grid'
  ]) {
    assert(entry.includes(marker), `AGENTS.md missing required marker: ${marker}`);
  }

  for (const marker of [
    'External agents may contribute evidence and proposals',
    'GitHub remains the front-facing source of collaboration truth',
    'Read-only MCP/A2A laboratory',
    'The first deliverable is a safer contribution surface, not an autonomous swarm.'
  ]) {
    assert(architecture.includes(marker), `AGENT-COMMONS.md missing required marker: ${marker}`);
  }

  assertSchemaBase(
    challenge,
    'https://axiom.invalid/schemas/agent-challenge.v1.schema.json',
    'axiom-agent-challenge.v1'
  );
  assert(challenge.properties?.base_sha?.$ref === '#/$defs/gitSha', 'challenge must bind an exact git SHA');
  assert(challenge.properties?.authority_granted?.const === false, 'challenge must not grant authority');

  assertSchemaBase(
    contribution,
    'https://axiom.invalid/schemas/agent-contribution.v1.schema.json',
    'axiom-agent-contribution.v1'
  );
  assert(contribution.properties?.base_sha?.$ref === '#/$defs/gitSha', 'contribution must bind an exact git SHA');
  assert(contribution.properties?.merge_authority_requested?.const === false, 'contribution must not request merge authority');
  assert(contribution.properties?.production_authority_requested?.const === false, 'contribution must not request production authority');

  assertSchemaBase(
    feedback,
    'https://axiom.invalid/schemas/agent-feedback.v1.schema.json',
    'axiom-agent-feedback.v1'
  );
  assert(feedback.properties?.base_sha?.$ref === '#/$defs/gitSha', 'feedback must bind an exact git SHA');
  assert(feedback.properties?.public_disclosure_safe?.const === true, 'public feedback envelope must be explicitly public-safe');
  assert(feedback.properties?.authority_requested?.const === false, 'feedback must not request authority');

  for (const [name, form] of [
    ['agent-contribution.yml', contributionForm],
    ['agent-feedback.yml', feedbackForm],
    ['agent-reproduction.yml', reproductionForm]
  ]) {
    assert(form.includes('SECURITY.md'), `${name} must route sensitive security material away from public issues`);
    assert(form.includes('base commit SHA'), `${name} must require base revision context`);
    assert(form.includes('authority'), `${name} must state the authority boundary`);
  }

  return Object.freeze({
    ok: true,
    schemas: [
      challenge.properties.schema.const,
      contribution.properties.schema.const,
      feedback.properties.schema.const
    ],
    issue_forms: 3
  });
}

async function main() {
  const result = await checkAgentCommons();
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
