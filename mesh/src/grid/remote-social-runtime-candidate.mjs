import { RemoteSocialAbuseGridStore } from './remote-social-abuse-store.mjs';

export const REMOTE_SOCIAL_RUNTIME_CANDIDATE_SCHEMA =
  'axiom-remote-social-runtime-candidate.v1';

export const REMOTE_SOCIAL_RUNTIME_CANDIDATE = Object.freeze({
  schema: REMOTE_SOCIAL_RUNTIME_CANDIDATE_SCHEMA,
  activation_state: 'disabled',
  runtime_role: 'grid-side-remote-social-review-candidate',
  network_egress: false,
  public_routes: false,
  transport_included: false,
  staging_included: true,
  admission_included: true,
  following_included: true,
  retention_included: true,
  abuse_controls_included: true,
  automatic_federation: false,
  automatic_admission: false,
  automatic_follow: false,
  remaining_activation_gates: Object.freeze([
    'threat-model',
    'owner-scoped-api',
    'approval-api-wiring',
    'transport-relay-separation',
    'axiom-one-review',
    'independent-security-review'
  ])
});

export class RemoteSocialRuntimeCandidateGridStore extends RemoteSocialAbuseGridStore {
  getStatus() {
    return {
      ...super.getStatus(),
      remote_social_runtime_candidate: REMOTE_SOCIAL_RUNTIME_CANDIDATE
    };
  }
}