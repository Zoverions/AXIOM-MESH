import { RemoteSocialRuntimeGridStore } from './remote-social-runtime-store.mjs';

export const ACCEPTED_SOCIAL_STORAGE_SCHEMA = 'axiom-accepted-social-storage.v1';

export const ACCEPTED_SOCIAL_STORAGE = Object.freeze({
  schema: ACCEPTED_SOCIAL_STORAGE_SCHEMA,
  activation_state: 'accepted-local-storage',
  local_authored_social_storage: true,
  remote_staging_storage: true,
  remote_admission_storage: true,
  remote_following_storage: true,
  remote_retention_storage: true,
  remote_abuse_storage: true,
  remote_review_route: 'owner-scoped-read-only',
  public_mutation_routes: false,
  internal_admission_finalizer: false,
  network_egress: false,
  transport_included: false,
  automatic_admission: false,
  automatic_follow: false,
  automatic_federation: false,
  recommendation_effect: 'none',
  authority_effect: 'none'
});

export class AcceptedSocialGridStore extends RemoteSocialRuntimeGridStore {
  getStatus() {
    const status = super.getStatus();
    return {
      ...status,
      remote_social_runtime_store: Object.freeze({
        ...status.remote_social_runtime_store,
        activation_state: 'accepted-local-storage',
        public_routes: true,
        public_mutation_routes: false,
        read_only_review_route: true
      }),
      accepted_social_storage: ACCEPTED_SOCIAL_STORAGE
    };
  }
}
