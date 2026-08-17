import { signedFetch } from '../lib/client.mjs';
import {
  REMOTE_SOCIAL_ADMISSION_FINALIZER_SCHEMA,
  buildRemoteSocialAdmissionFinalizerResult,
  normalizeRemoteSocialAdmissionFinalizerRequest
} from '../lib/remote-social-admission-finalizer.mjs';

export async function finalizeRemoteSocialAdmission({
  identity,
  gridUrl,
  intent,
  intentId,
  approvalId,
  traceId,
  timeoutMs = 5_000
}) {
  const request = normalizeRemoteSocialAdmissionFinalizerRequest({
    schema: REMOTE_SOCIAL_ADMISSION_FINALIZER_SCHEMA,
    intent_id: intentId,
    approval_id: approvalId,
    intent: {
      action: intent.action,
      input: intent.input,
      purpose: intent.purpose,
      data_scopes: intent.data_scopes,
      principal: {
        id: intent.principal.id,
        type: intent.principal.type
      }
    }
  });
  const response = await signedFetch(
    identity,
    'grid',
    gridUrl,
    '/internal/v1/social/remote-admit',
    {
      method: 'POST',
      body: request,
      traceId,
      timeoutMs
    }
  );
  return buildRemoteSocialAdmissionFinalizerResult(response);
}
