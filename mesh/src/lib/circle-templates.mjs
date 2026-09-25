import { readFile } from 'node:fs/promises';
import { digestObject, ValidationError } from './canonical.mjs';
import {
  CIRCLE_CHARTER_SCHEMA,
  CIRCLE_CORE_PACKAGE_SCHEMA,
  CIRCLE_SCHEMA
} from './circle-core.mjs';

export const CIRCLE_TEMPLATE_CATALOG_SCHEMA = 'axiom-circle-template-catalog.v0';
export const CIRCLE_TEMPLATE_SCHEMA = 'axiom-circle-template.v0';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const CIRCLE_KINDS = new Set(['family-coordination','project-team','research-group','creator-collective','community-group']);
const PARTICIPATION_MODELS = new Set(['voluntary','contractual']);
const DISCLOSURE_CLASSES = new Set(['public-safe','member-private']);
const ROLE_MODES = new Set(['propose','deliberate','evidence','vote','approve','review','appeal','observe']);

export async function loadBuiltInCircleTemplates() {
  const path = new URL('../../config/circle-templates-v0.json', import.meta.url);
  return validateCircleTemplateCatalog(JSON.parse(await readFile(path, 'utf8')));
}

export function validateCircleTemplateCatalog(document) {
  exactObject(document, 'Circle template catalog', [
    'schema','version','status','templates','authority_effect','network_effect','runtime_activation'
  ]);
  if (
    document.schema !== CIRCLE_TEMPLATE_CATALOG_SCHEMA
    || document.version !== 0
    || document.status !== 'inert-template-library'
    || document.authority_effect !== 'none'
    || document.network_effect !== 'none'
    || document.runtime_activation !== false
  ) throw new ValidationError('Circle template catalog activation boundary is invalid');
  if (!Array.isArray(document.templates) || document.templates.length < 1 || document.templates.length > 64) {
    throw new ValidationError('Circle template catalog templates are invalid');
  }
  const ids = new Set();
  for (const template of document.templates) {
    validateCircleTemplate(template);
    if (ids.has(template.template_id)) throw new ValidationError('Duplicate Circle template_id: ' + template.template_id);
    ids.add(template.template_id);
  }
  return Object.freeze({
    valid:true,
    schema:document.schema,
    templates:document.templates.length,
    catalog_digest:digestObject(document),
    authority_effect:'none',
    network_effect:'none',
    runtime_activation:false
  });
}

export function validateCircleTemplate(template) {
  exactObject(template, 'Circle template', [
    'schema','template_id','label','description','circle_kind','participation_model','roles',
    'decision_rule','appeal_enabled','member_exit_enabled','default_disclosure_class','policy_floor',
    'execution_authority','membership_authority','authority_effect','network_effect','runtime_activation'
  ]);
  if (
    template.schema !== CIRCLE_TEMPLATE_SCHEMA
    || !id(template.template_id)
    || !text(template.label, 1, 160)
    || !text(template.description, 1, 1200)
    || !CIRCLE_KINDS.has(template.circle_kind)
    || !PARTICIPATION_MODELS.has(template.participation_model)
    || template.appeal_enabled !== true
    || template.member_exit_enabled !== true
    || !DISCLOSURE_CLASSES.has(template.default_disclosure_class)
    || template.policy_floor !== 'raise-only'
    || template.execution_authority !== false
    || template.membership_authority !== false
    || template.authority_effect !== 'none'
    || template.network_effect !== 'none'
    || template.runtime_activation !== false
  ) throw new ValidationError('Circle template is invalid');

  if (!Array.isArray(template.roles) || template.roles.length < 1 || template.roles.length > 32) {
    throw new ValidationError('Circle template roles are invalid');
  }
  const roles = new Set();
  for (const role of template.roles) {
    exactObject(role, 'Circle template role', ['role_id','label','declared_modes','execution_authority']);
    if (
      !id(role.role_id)
      || !text(role.label, 1, 120)
      || !modeArray(role.declared_modes)
      || role.execution_authority !== false
    ) throw new ValidationError('Circle template role is invalid');
    if (roles.has(role.role_id)) throw new ValidationError('Duplicate Circle template role_id: ' + role.role_id);
    roles.add(role.role_id);
  }

  exactObject(template.decision_rule, 'Circle template decision_rule', [
    'quorum_basis_points','approval_basis_points','abstention_counts_toward_quorum'
  ]);
  if (
    !basisPoints(template.decision_rule.quorum_basis_points)
    || !basisPoints(template.decision_rule.approval_basis_points)
    || typeof template.decision_rule.abstention_counts_toward_quorum !== 'boolean'
  ) throw new ValidationError('Circle template decision_rule is invalid');

  return template;
}

export function instantiateCircleTemplate(template, input) {
  validateCircleTemplate(template);
  exactObject(input, 'Circle template instantiation', [
    'circle_id','name','purpose','created_by','created_at','trust_anchor_id'
  ]);
  id(input.circle_id);
  id(input.created_by);
  id(input.trust_anchor_id);
  if (!text(input.name, 1, 160) || !text(input.purpose, 1, 1000)) {
    throw new ValidationError('Circle template instantiation text is invalid');
  }
  canonicalDate(input.created_at, 'created_at');

  const circle = {
    schema:CIRCLE_SCHEMA,
    circle_id:input.circle_id,
    name:input.name,
    purpose:input.purpose,
    created_by:input.created_by,
    created_at:input.created_at,
    trust_anchor_id:input.trust_anchor_id,
    participation_model:template.participation_model,
    member_state_ownership:'independent-node',
    policy_floor:'raise-only',
    authority_effect:'none',
    network_effect:'none',
    runtime_activation:false
  };
  const charter = {
    schema:CIRCLE_CHARTER_SCHEMA,
    circle_id:input.circle_id,
    version:1,
    effective_from:input.created_at,
    supersedes_digest:null,
    roles:template.roles.map(role => ({
      role_id:role.role_id,
      label:role.label,
      declared_modes:[...role.declared_modes],
      execution_authority:false
    })),
    decision_rule:{...template.decision_rule},
    appeal_enabled:true,
    member_exit_enabled:true,
    execution_authority:false,
    authority_effect:'none'
  };
  return {
    schema:CIRCLE_CORE_PACKAGE_SCHEMA,
    version:0,
    status:'inert-contract-laboratory',
    circle,
    charter,
    invitations:[],
    memberships:[],
    proposals:[],
    tasks:[],
    decisions:[],
    appeals:[],
    exits:[],
    exports:[],
    authority_effect:'none',
    network_effect:'none',
    runtime_activation:false
  };
}

function exactObject(value, label, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ValidationError(label + ' must be an object');
  const actual = Object.keys(value).sort().join(',');
  const expected = [...fields].sort().join(',');
  if (actual !== expected) throw new ValidationError(label + ' fields are invalid');
}
function id(value) { return typeof value === 'string' && IDENTIFIER.test(value); }
function text(value, minimum, maximum) {
  return typeof value === 'string' && value.trim().length >= minimum && value.length <= maximum
    && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value);
}
function modeArray(value) {
  return Array.isArray(value) && value.length >= 1 && value.length <= 16
    && value.every(mode => ROLE_MODES.has(mode))
    && new Set(value).size === value.length;
}
function basisPoints(value) { return Number.isSafeInteger(value) && value >= 0 && value <= 10000; }
function canonicalDate(value, label) {
  if (typeof value !== 'string' || value.length > 64) throw new ValidationError(label + ' must be a canonical ISO timestamp');
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) throw new ValidationError(label + ' must be a canonical ISO timestamp');
  return parsed.getTime();
}
