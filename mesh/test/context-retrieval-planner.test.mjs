import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildContextRetrievalPlan,
  validateContextVaultCatalogEntry
} from '../src/lib/context-retrieval-planner.mjs';

const CREATED_AT = '2026-08-22T18:00:00.000Z';

function request({
  semanticNeeds,
  purpose = 'choose an accessible hotel'
} = {}) {
  return {
    schema: 'axiom-context-request.v1',
    request_id: 'request_1',
    owner_subject_ref: 'owner_1',
    requester_principal_ref: 'assistant_1',
    recipient_principal_ref: 'travel_agent_1',
    purpose,
    task_class: 'travel.hotel-selection',
    issued_at: '2026-08-22T17:30:00.000Z',
    expires_at: '2026-08-22T19:00:00.000Z',
    semantic_needs: semanticNeeds ?? [{
      semantic_type: 'travel.accessibility.requirements',
      need: 'minimum accommodation constraints for hotel selection',
      required: true,
      maximum_sensitivity: 'restricted',
      acceptable_disclosure_modes: ['transformed-constraint'],
      minimum_confidence: 0.8
    }],
    retention_request: {
      max_seconds: 600,
      recipient_may_persist_requested: false
    },
    minimum_necessary_requested: true,
    source_vault_selector_in_request: false,
    requests_vault_mount: false,
    requests_raw_vault_object: false,
    grants_vault_access: false,
    grants_execution_authority: false,
    onward_disclosure_requested: false
  };
}

function vault({
  vaultId = 'vault_health_narrow',
  owner = 'owner_1',
  domain = 'health-accessibility',
  ceiling = 'restricted',
  access = 'lease-read-derive',
  maxLeaseSeconds = 300,
  crossVault = true,
  rawExternalDisclosure = false,
  purposes = ['choose an accessible hotel'],
  confirmation = true,
  capabilities
} = {}) {
  return {
    schema: 'axiom-context-vault-catalog-entry.v1',
    vault_id: vaultId,
    owner_subject_ref: owner,
    domain,
    sensitivity_ceiling: ceiling,
    local_companion_access: access,
    local_lease_required: true,
    max_local_lease_seconds: maxLeaseSeconds,
    cross_vault_synthesis: crossVault,
    raw_external_disclosure: rawExternalDisclosure,
    allowed_purposes: purposes,
    high_risk_disclosure_requires_owner_confirmation: confirmation,
    semantic_capabilities: capabilities ?? [{
      semantic_type: 'travel.accessibility.requirements',
      resource_refs: ['record_accessibility_1'],
      sensitivity: 'sensitive',
      operations: ['derive']
    }],
    secret_material_in_catalog: false
  };
}

function plan({
  requestValue = request(),
  catalog = [vault()],
  createdAt = CREATED_AT,
  ...overrides
} = {}) {
  return buildContextRetrievalPlan({
    request: requestValue,
    vaultCatalog: catalog,
    brokerPrincipalRef: 'broker_1',
    createdAt,
    ...overrides
  });
}

function validationError(pattern) {
  return error => {
    assert.equal(error?.name, 'ValidationError');
    assert.match(error.message, pattern);
    return true;
  };
}

test('planner selects exact semantic minimum-resource scope without reading vaults or issuing authority', () => {
  const narrow = vault();
  const broad = vault({
    vaultId: 'vault_health_broad',
    domain: 'health-general',
    ceiling: 'critical-secret',
    capabilities: [{
      semantic_type: 'travel.accessibility.requirements',
      resource_refs: [
        'record_accessibility_1',
        'record_diagnosis_1',
        'record_clinician_1'
      ],
      sensitivity: 'restricted',
      operations: ['read', 'derive']
    }]
  });
  const irrelevant = vault({
    vaultId: 'vault_work_1',
    domain: 'work',
    capabilities: [{
      semantic_type: 'work.calendar.constraints',
      resource_refs: ['record_work_calendar_1'],
      sensitivity: 'ordinary-private',
      operations: ['derive']
    }]
  });

  const result = plan({ catalog: [broad, irrelevant, narrow] });

  assert.equal(result.schema, 'axiom-context-retrieval-plan.v1');
  assert.equal(result.need_plans.length, 1);
  assert.equal(result.need_plans[0].vault_id, 'vault_health_narrow');
  assert.deepEqual(result.need_plans[0].resource_refs, ['record_accessibility_1']);
  assert.equal(result.need_plans[0].requested_operation, 'derive');
  assert.equal(result.lease_requests.length, 1);
  assert.deepEqual(result.lease_requests[0].requested_operations, ['derive']);
  assert.deepEqual(result.lease_requests[0].resource_refs, ['record_accessibility_1']);
  assert.equal(result.lease_requests[0].wildcard_scope, false);
  assert.equal(result.lease_requests[0].grants_vault_access, false);
  assert.equal(result.lease_requests[0].grants_execution_authority, false);
  assert.equal(result.minimum_necessary_by_construction, true);
  assert.equal(result.exact_semantic_matching_only, true);
  assert.equal(result.model_ranking_used, false);
  assert.equal(result.local_only, true);
  assert.equal(result.recipient_visible, false);
  assert.equal(result.contains_vault_topology, true);
  assert.equal(result.contains_raw_vault_content, false);
  assert.equal(result.reads_vaults, false);
  assert.equal(result.issues_leases, false);
  assert.equal(result.commits_access_receipts, false);
  assert.equal(result.grants_vault_access, false);
  assert.equal(result.grants_execution_authority, false);
});

test('planner is deterministic across vault-catalog ordering', () => {
  const narrow = vault();
  const broad = vault({
    vaultId: 'vault_health_broad',
    capabilities: [{
      semantic_type: 'travel.accessibility.requirements',
      resource_refs: ['record_a', 'record_b'],
      sensitivity: 'restricted',
      operations: ['derive']
    }]
  });

  const first = plan({ catalog: [narrow, broad] });
  const second = plan({ catalog: [broad, narrow] });
  assert.equal(first.plan_sha256, second.plan_sha256);
  assert.equal(first.plan_id, second.plan_id);
  assert.deepEqual(first.need_plans, second.need_plans);
  assert.deepEqual(first.lease_requests, second.lease_requests);
});

test('required semantic need fails closed when no purpose- and sensitivity-compatible vault exists', () => {
  assert.throws(
    () => plan({
      catalog: [vault({ purposes: ['unrelated purpose'] })]
    }),
    validationError(/Required semantic need cannot be minimally planned/)
  );

  assert.throws(
    () => plan({
      requestValue: request({
        semanticNeeds: [{
          semantic_type: 'travel.accessibility.requirements',
          need: 'ordinary-only constraint',
          required: true,
          maximum_sensitivity: 'ordinary-private',
          acceptable_disclosure_modes: ['transformed-constraint']
        }]
      }),
      catalog: [vault()]
    }),
    validationError(/Required semantic need cannot be minimally planned/)
  );
});

test('optional unavailable need is recorded without broadening required access', () => {
  const value = request({
    semanticNeeds: [
      {
        semantic_type: 'travel.accessibility.requirements',
        need: 'accessibility constraints',
        required: true,
        maximum_sensitivity: 'restricted',
        acceptable_disclosure_modes: ['transformed-constraint']
      },
      {
        semantic_type: 'travel.favorite.snack',
        need: 'optional snack preference',
        required: false,
        maximum_sensitivity: 'ordinary-private',
        acceptable_disclosure_modes: ['derived-inference']
      }
    ]
  });

  const result = plan({ requestValue: value, catalog: [vault()] });
  assert.deepEqual(
    result.unresolved_optional_semantic_types,
    ['travel.favorite.snack']
  );
  assert.equal(result.need_plans.length, 1);
  assert.equal(result.lease_requests.length, 1);
});

test('planner requests raw read only when verbatim is the sole acceptable disclosure mode', () => {
  const verbatimRequest = request({
    semanticNeeds: [{
      semantic_type: 'travel.accessibility.requirements',
      need: 'owner-approved exact wording',
      required: true,
      maximum_sensitivity: 'restricted',
      acceptable_disclosure_modes: ['owner-approved-verbatim']
    }]
  });
  const readVault = vault({
    access: 'lease-read',
    rawExternalDisclosure: true,
    capabilities: [{
      semantic_type: 'travel.accessibility.requirements',
      resource_refs: ['record_accessibility_statement_1'],
      sensitivity: 'sensitive',
      operations: ['read']
    }]
  });

  const result = plan({ requestValue: verbatimRequest, catalog: [readVault] });
  assert.equal(result.need_plans[0].requested_operation, 'read');
  assert.deepEqual(result.lease_requests[0].requested_operations, ['read']);

  assert.throws(
    () => plan({
      requestValue: verbatimRequest,
      catalog: [vault({
        access: 'lease-read',
        rawExternalDisclosure: false,
        capabilities: [{
          semantic_type: 'travel.accessibility.requirements',
          resource_refs: ['record_accessibility_statement_1'],
          sensitivity: 'sensitive',
          operations: ['read']
        }]
      })]
    }),
    validationError(/Required semantic need cannot be minimally planned/)
  );
});

test('cross-vault planning fails closed when required synthesis is disallowed', () => {
  const value = request({
    semanticNeeds: [
      {
        semantic_type: 'travel.accessibility.requirements',
        need: 'accessibility constraints',
        required: true,
        maximum_sensitivity: 'restricted',
        acceptable_disclosure_modes: ['transformed-constraint']
      },
      {
        semantic_type: 'travel.schedule.constraints',
        need: 'schedule constraints',
        required: true,
        maximum_sensitivity: 'sensitive',
        acceptable_disclosure_modes: ['derived-inference']
      }
    ]
  });
  const accessibility = vault({ crossVault: false });
  const schedule = vault({
    vaultId: 'vault_schedule_1',
    domain: 'calendar',
    crossVault: true,
    ceiling: 'sensitive',
    capabilities: [{
      semantic_type: 'travel.schedule.constraints',
      resource_refs: ['record_calendar_constraint_1'],
      sensitivity: 'sensitive',
      operations: ['derive']
    }]
  });

  assert.throws(
    () => plan({ requestValue: value, catalog: [accessibility, schedule] }),
    validationError(/Required semantic need cannot be minimally planned/)
  );

  const result = plan({
    requestValue: value,
    catalog: [
      vault({ crossVault: true }),
      schedule
    ]
  });
  assert.equal(result.lease_requests.length, 2);
});

test('owner mismatch and local metadata-only access cannot satisfy a required need', () => {
  assert.throws(
    () => plan({ catalog: [vault({ owner: 'different_owner' })] }),
    validationError(/Required semantic need cannot be minimally planned/)
  );
  assert.throws(
    () => plan({ catalog: [vault({ access: 'metadata-only' })] }),
    validationError(/Required semantic need cannot be minimally planned/)
  );
});

test('catalog validator rejects secret material, ambient lease semantics, and sensitivity escalation', () => {
  const secret = vault();
  secret.secret_material_in_catalog = true;
  assert.throws(
    () => validateContextVaultCatalogEntry(secret),
    validationError(/secret_material_in_catalog/)
  );

  const ambient = vault();
  ambient.local_lease_required = false;
  assert.throws(
    () => validateContextVaultCatalogEntry(ambient),
    validationError(/local_lease_required/)
  );

  const escalated = vault({
    ceiling: 'sensitive',
    capabilities: [{
      semantic_type: 'travel.accessibility.requirements',
      resource_refs: ['record_accessibility_1'],
      sensitivity: 'restricted',
      operations: ['derive']
    }]
  });
  assert.throws(
    () => validateContextVaultCatalogEntry(escalated),
    validationError(/sensitivity exceeds vault ceiling/)
  );
});

test('retrieval plan must be created within the request validity window', () => {
  assert.throws(
    () => plan({ createdAt: '2026-08-22T19:00:00.000Z' }),
    validationError(/request validity window/)
  );
});
