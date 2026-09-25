import assert from 'node:assert/strict';
import test from 'node:test';

import { validateCircleCorePackage } from '../src/lib/circle-core.mjs';
import {
  instantiateCircleTemplate,
  loadBuiltInCircleTemplates,
  validateCircleTemplate,
  validateCircleTemplateCatalog
} from '../src/lib/circle-templates.mjs';

test('built-in Circle templates validate and remain non-authorizing', async () => {
  const catalog = await loadBuiltInCircleTemplates();
  const result = validateCircleTemplateCatalog(catalog);
  assert.equal(result.templates, 5);
  assert.equal(result.authority_effect, 'none');
  assert.equal(catalog.templates.every(item => item.execution_authority === false), true);
  assert.equal(catalog.templates.every(item => item.membership_authority === false), true);
});

test('every built-in template instantiates a valid empty Circle Core package', async () => {
  const catalog = await loadBuiltInCircleTemplates();
  for (const [index, template] of catalog.templates.entries()) {
    const packageDocument = instantiateCircleTemplate(template, {
      circle_id:'circle.template-demo.' + (index + 1),
      name:'Template demo ' + (index + 1),
      purpose:'Validate an inert Circle template without creating membership or execution authority.',
      created_by:'human.owner',
      created_at:'2026-09-24T12:00:00.000Z',
      trust_anchor_id:'anchor.template-demo.' + (index + 1)
    });
    const checked = validateCircleCorePackage(packageDocument);
    assert.equal(checked.valid, true);
    assert.equal(checked.counts.memberships, 0);
    assert.equal(checked.counts.invitations, 0);
    assert.equal(packageDocument.charter.execution_authority, false);
    assert.equal(packageDocument.authority_effect, 'none');
  }
});

test('Circle templates cannot smuggle role, membership or execution authority', async () => {
  const catalog = await loadBuiltInCircleTemplates();
  const template = structuredClone(catalog.templates[0]);
  template.roles[0].execution_authority = true;
  assert.throws(() => validateCircleTemplate(template), /role is invalid/);

  const membership = structuredClone(catalog.templates[0]);
  membership.membership_authority = true;
  assert.throws(() => validateCircleTemplate(membership), /template is invalid/);

  const unknown = structuredClone(catalog.templates[0]);
  unknown.default_members = ['human.owner'];
  assert.throws(() => validateCircleTemplate(unknown), /fields are invalid/);
});
