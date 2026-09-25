import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const NOTEBOOK_URL = new URL(
  '../../labs/ephemeral-gpu-inference/colab/axiom_ephemeral_gpu.ipynb',
  import.meta.url
);
const EXPERIMENT_URL = new URL(
  '../../labs/ephemeral-gpu-inference/EXPERIMENT.md',
  import.meta.url
);

function loadNotebook() {
  return JSON.parse(readFileSync(NOTEBOOK_URL, 'utf8'));
}

function notebookText(notebook) {
  return notebook.cells
    .flatMap((cell) => Array.isArray(cell.source) ? cell.source : [cell.source ?? ''])
    .join('\n');
}

test('ephemeral GPU notebook is an interactive no-authority lab', () => {
  const notebook = loadNotebook();
  const source = notebookText(notebook);

  assert.equal(notebook.nbformat, 4);
  assert.ok(Array.isArray(notebook.cells));
  assert.ok(notebook.cells.length >= 6);

  for (const required of [
    'https://research.google.com/colaboratory/faq.html',
    'torch.cuda.is_available()',
    'torch.cuda.get_device_name(0)',
    'memory_total_gb',
    'nvidia-smi',
    'trust_remote_code=False',
    'axiom-ephemeral-inference-request.v0',
    'axiom-ephemeral-inference-observation.v0',
    '"authority_effect": "none"',
    '"credential_visibility": "none"',
    '"durable_state_effect": "ephemeral-only"',
    '"network_listener": False',
    '"provider_registration": False',
    '"gateway_route_created": False',
    '"production_claim": False'
  ]) {
    assert.equal(source.includes(required), true, `missing notebook boundary marker: ${required}`);
  }

  for (const forbidden of [
    'drive.mount(',
    'google.colab.drive',
    'ngrok',
    'cloudflared',
    'tailscale',
    'paramiko',
    'sshd',
    'gradio',
    'streamlit',
    'uvicorn',
    'FastAPI(',
    'Flask(',
    'http.server',
    'socketserver',
    'distributed.Client',
    'ray.init(',
    'userdata.get(',
    'getpass('
  ]) {
    assert.equal(source.includes(forbidden), false, `forbidden notebook pattern present: ${forbidden}`);
  }

  assert.equal(/\bV100\b/.test(source), false, 'notebook must not assume a V100');
  assert.equal(/\b30\s*(?:GPU[- ]?)?hours?\b/i.test(source), false, 'notebook must not assume a weekly hour quota');
  assert.equal(/\b16\s*GB\b/i.test(source), false, 'notebook must not assume fixed GPU memory');
});

test('ephemeral GPU experiment declares the required frontier-lab controls', () => {
  const experiment = readFileSync(EXPERIMENT_URL, 'utf8');

  for (const required of [
    '**Experiment ID:** `LAB-010`',
    '## Hypothesis',
    '## External constraint source',
    '## Threat model',
    '## Assumptions',
    '## Test data and provenance',
    '## Isolation boundary',
    '## Failure criteria',
    '## Halt and cleanup',
    '## Reproducibility',
    '## Promotion path',
    '## Current non-claims',
    'https://research.google.com/colaboratory/faq.html',
    'Disconnect and delete runtime',
    'runtime/provider catalog should remain unchanged'
  ]) {
    assert.equal(experiment.includes(required), true, `missing experiment control: ${required}`);
  }

  assert.match(
    experiment,
    /does \*\*not\*\* claim:[\s\S]*Google guarantees a V100, 16 GB of VRAM, 30 GPU-hours per week/i
  );
  assert.match(
    experiment,
    /does not add a Gateway route, provider registration, compute-node admission, credential path, remote-execution path/i
  );
});
