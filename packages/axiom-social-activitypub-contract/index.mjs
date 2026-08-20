const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const OUTBOUND_ACTIVITY_TYPES = new Set([
  'Create',
  'Update',
  'Delete',
  'Follow',
  'Accept',
  'Reject',
  'Undo',
  'Announce',
  'Like',
  'Block',
  'Flag'
]);
const INBOUND_ACTIVITY_TYPES = new Set(OUTBOUND_ACTIVITY_TYPES);
const PROHIBITED_OUTBOUND = new Set([
  'social.publication.supersede',
  'circle.curated-lens.exclude',
  'circle.member-private-publication',
  'circle.membership',
  'circle.charter',
  'circle.governance',
  'feed.diversity.preference',
  'feed.presentation.transform',
  'spam.assessment',
  'safety.quarantine'
]);

export function validateActivityPubAdapterContract(contract) {
  exactObject(contract, 'ActivityPub adapter contract', [
    'schema',
    'version',
    'status',
    'runtime_activation',
    'canonical_model',
    'authority_effect',
    'network_effect',
    'transport_effect',
    'protocol',
    'identity',
    'outbound_mappings',
    'inbound_mappings',
    'block_semantics',
    'flag_semantics',
    'prohibited_outbound_semantics',
    'private_circle_federation',
    'remote_instance_delivery_completeness_claimed',
    'third_party_deletion_guaranteed',
    'recommendation_effect'
  ]);

  if (
    contract.schema !== 'axiom-social-activitypub-adapter.v0'
    || contract.version !== 0
    || contract.status !== 'inert-semantic-mapping'
    || contract.runtime_activation !== false
    || contract.canonical_model !== 'axiom-social'
    || contract.authority_effect !== 'none'
    || contract.network_effect !== 'none'
    || contract.transport_effect !== 'none'
    || contract.private_circle_federation !== false
    || contract.remote_instance_delivery_completeness_claimed !== false
    || contract.third_party_deletion_guaranteed !== false
    || contract.recommendation_effect !== 'none'
  ) throw new Error('ActivityPub adapter activation or claim boundary is invalid');

  validateProtocol(contract.protocol);
  validateIdentity(contract.identity);
  validateOutboundMappings(contract.outbound_mappings);
  validateInboundMappings(contract.inbound_mappings);
  validateBlockSemantics(contract.block_semantics);
  validateFlagSemantics(contract.flag_semantics);

  if (!Array.isArray(contract.prohibited_outbound_semantics)) {
    throw new Error('ActivityPub prohibited outbound semantics must be an array');
  }
  const prohibited = new Set(contract.prohibited_outbound_semantics);
  if (
    prohibited.size !== PROHIBITED_OUTBOUND.size
    || [...PROHIBITED_OUTBOUND].some(item => !prohibited.has(item))
  ) throw new Error('ActivityPub prohibited outbound semantic inventory drifted');

  return true;
}

export function outboundActivityPubMapping(contract, axiomSemantic) {
  validateActivityPubAdapterContract(contract);
  requireSemantic(axiomSemantic);
  if (PROHIBITED_OUTBOUND.has(axiomSemantic)) {
    throw new Error(`AXIOM semantic ${axiomSemantic} is prohibited from ActivityPub export`);
  }
  const mapping = contract.outbound_mappings.find(item => item.axiom_semantic === axiomSemantic);
  if (!mapping) throw new Error(`No exact ActivityPub mapping exists for ${axiomSemantic}`);
  return Object.freeze({ ...mapping });
}

export function inboundActivityPubMapping(contract, activityType) {
  validateActivityPubAdapterContract(contract);
  if (typeof activityType !== 'string' || !INBOUND_ACTIVITY_TYPES.has(activityType)) {
    throw new Error('Unsupported ActivityPub activity type');
  }
  const mapping = contract.inbound_mappings.find(item => item.activitypub_activity === activityType);
  if (!mapping) throw new Error(`No exact AXIOM mapping exists for ActivityPub ${activityType}`);
  return Object.freeze({ ...mapping });
}

export function activityPubBlockInterpretation(contract) {
  validateActivityPubAdapterContract(contract);
  return Object.freeze({ ...contract.block_semantics });
}

export function activityPubFlagInterpretation(contract) {
  validateActivityPubAdapterContract(contract);
  return Object.freeze({ ...contract.flag_semantics });
}

function validateProtocol(protocol) {
  exactObject(protocol, 'ActivityPub protocol profile', [
    'name',
    'baseline',
    'mastodon_profile',
    'webfinger_required_for_mastodon',
    'webfinger_implemented',
    'inbox_implemented',
    'outbox_implemented',
    'http_signature_transport_implemented',
    'oauth_mastodon_connector_implemented'
  ]);
  if (
    protocol.name !== 'ActivityPub'
    || protocol.baseline !== 'W3C Recommendation 2018-01-23'
    || protocol.mastodon_profile !== true
    || protocol.webfinger_required_for_mastodon !== true
    || protocol.webfinger_implemented !== false
    || protocol.inbox_implemented !== false
    || protocol.outbox_implemented !== false
    || protocol.http_signature_transport_implemented !== false
    || protocol.oauth_mastodon_connector_implemented !== false
  ) throw new Error('ActivityPub protocol profile is invalid');
}

function validateIdentity(identity) {
  exactObject(identity, 'ActivityPub identity mapping', [
    'source_projection_schema',
    'target_concept',
    'protected_actor_state_exposed',
    'legal_identity_proof_claimed',
    'controller_identity_proof_claimed'
  ]);
  if (
    identity.source_projection_schema !== 'axiom-publication-persona-projection.v1'
    || identity.target_concept !== 'activitypub-actor'
    || identity.protected_actor_state_exposed !== false
    || identity.legal_identity_proof_claimed !== false
    || identity.controller_identity_proof_claimed !== false
  ) throw new Error('ActivityPub identity mapping exceeds the public persona boundary');
}

function validateOutboundMappings(mappings) {
  if (!Array.isArray(mappings) || mappings.length !== 10) {
    throw new Error('ActivityPub outbound mapping inventory is invalid');
  }
  const seenSemantics = new Set();
  for (const mapping of mappings) {
    exactObject(mapping, 'ActivityPub outbound mapping', [
      'axiom_semantic',
      'activitypub_activity',
      'activitypub_object',
      'requires_public_projection'
    ]);
    if (
      !semantic(mapping.axiom_semantic)
      || seenSemantics.has(mapping.axiom_semantic)
      || !OUTBOUND_ACTIVITY_TYPES.has(mapping.activitypub_activity)
      || typeof mapping.activitypub_object !== 'string'
      || !mapping.activitypub_object.length
      || mapping.requires_public_projection !== true
      || PROHIBITED_OUTBOUND.has(mapping.axiom_semantic)
    ) throw new Error('ActivityPub outbound mapping is invalid');
    seenSemantics.add(mapping.axiom_semantic);
  }

  if (mappings.some(item => item.activitypub_activity === 'Update')) {
    throw new Error('ActivityPub Update cannot be exported before stable external object binding exists');
  }
  const block = mappings.find(item => item.activitypub_activity === 'Block');
  if (block?.axiom_semantic !== 'personal.interaction.boundary') {
    throw new Error('ActivityPub Block must map only from a personal interaction boundary');
  }
  const flag = mappings.find(item => item.activitypub_activity === 'Flag');
  if (flag?.axiom_semantic !== 'content.report') {
    throw new Error('ActivityPub Flag must map only from a report assertion');
  }
}

function validateInboundMappings(mappings) {
  if (!Array.isArray(mappings) || mappings.length !== 11) {
    throw new Error('ActivityPub inbound mapping inventory is invalid');
  }
  const seenActivities = new Set();
  for (const mapping of mappings) {
    exactObject(mapping, 'ActivityPub inbound mapping', [
      'activitypub_activity',
      'axiom_semantic',
      'remote_observation_only',
      'authorship_claimed',
      'content_truth_claimed'
    ]);
    if (
      !INBOUND_ACTIVITY_TYPES.has(mapping.activitypub_activity)
      || seenActivities.has(mapping.activitypub_activity)
      || !semantic(mapping.axiom_semantic)
      || mapping.remote_observation_only !== true
      || mapping.authorship_claimed !== false
      || mapping.content_truth_claimed !== false
    ) throw new Error('ActivityPub inbound mapping exceeds the remote-observation boundary');
    seenActivities.add(mapping.activitypub_activity);
  }

  const block = mappings.find(item => item.activitypub_activity === 'Block');
  if (block?.axiom_semantic !== 'personal.interaction.boundary.remote-observation') {
    throw new Error('Inbound ActivityPub Block must stay actor-pair scoped');
  }
  const flag = mappings.find(item => item.activitypub_activity === 'Flag');
  if (flag?.axiom_semantic !== 'content.report.remote-observation') {
    throw new Error('Inbound ActivityPub Flag must remain a report observation');
  }
}

function validateBlockSemantics(block) {
  exactObject(block, 'ActivityPub Block semantics', [
    'scope',
    'personal_interaction_boundary',
    'personal_visibility_effect_allowed',
    'third_party_suppression',
    'circle_wide_suppression',
    'community_wide_suppression',
    'spam_claimed',
    'unsafe_claimed',
    'truth_judgment_claimed'
  ]);
  if (
    block.scope !== 'actor-pair-only'
    || block.personal_interaction_boundary !== true
    || block.personal_visibility_effect_allowed !== true
    || block.third_party_suppression !== false
    || block.circle_wide_suppression !== false
    || block.community_wide_suppression !== false
    || block.spam_claimed !== false
    || block.unsafe_claimed !== false
    || block.truth_judgment_claimed !== false
  ) throw new Error('ActivityPub Block semantics exceed user-scoped authority');
}

function validateFlagSemantics(flag) {
  exactObject(flag, 'ActivityPub Flag semantics', [
    'report_assertion_only',
    'spam_truth_claimed',
    'content_falsity_claimed',
    'guilt_claimed',
    'universal_hiding_effect'
  ]);
  if (
    flag.report_assertion_only !== true
    || flag.spam_truth_claimed !== false
    || flag.content_falsity_claimed !== false
    || flag.guilt_claimed !== false
    || flag.universal_hiding_effect !== false
  ) throw new Error('ActivityPub Flag semantics exceed report authority');
}

function requireSemantic(value) {
  if (!semantic(value)) throw new Error('AXIOM semantic identifier is invalid');
}

function semantic(value) {
  return typeof value === 'string' && value.length > 2 && value.length <= 160 && IDENTIFIER.test(value);
}

function exactObject(value, label, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} fields are invalid`);
  }
}
