/**
 * AXIOM One PWA — feed contract types (DESIGN-ONLY scaffolding).
 *
 * Mirrors feed-contract.schema.json. The PWA builds against these; the real
 * backend wiring follows F-1..F-3 (presence-post registry adoption). Until
 * then, scope labels are mock annotations, not registry claims.
 *
 * Label: DESIGN-ONLY. Fixture data must stay synthetic (no real user content).
 */

/** Audience descriptor. `public` | `circle:<id>` | `intimate` | `named:<principal>` */
export type FeedAudience = `public` | `intimate` | `circle:${string}` | `named:${string}`;

export type FeedItemKind = 'note' | 'essay' | 'link' | 'media' | 'track' | 'share';

export interface FeedPayload {
  text: string;
  title?: string;
  link_url?: string;
}

/**
 * One audience-compiled projection. The client never sees other audiences'
 * payloads — privacy is a compile-time property.
 */
export interface FeedProjection {
  projection_id: string; // fp_*
  item_id: string; // fi_*
  digest: string; // sha256:…
  compiled_at: string; // RFC3339
  identity_version: number;
  kind: FeedItemKind;
  sent_at: string; // RFC3339
  author: string; // operator principal id
  audience: FeedAudience;
  payload: FeedPayload;
  ref?: string;
}

/** Opaque pagination cursor (client treats as opaque string). */
export type FeedCursor = string | null;

export interface FeedListResponse {
  /** Sequence order, newest first. Rescinded items excluded server-side — no placeholders, no countable gaps. */
  items: FeedProjection[];
  next_cursor: FeedCursor;
  /** Feed sequence number at read time — cache invalidation key. */
  server_seq: number;
}

export interface FeedQuery {
  audience: FeedAudience;
  cursor?: string;
  /** Default 20, max 100. */
  limit?: number;
  /** Default 'none' (chronological). A lens returns the same item set in reader-chosen order — it can never change which items are eligible. */
  lens?: 'none' | string;
}

export interface RescindAttestation {
  attestation_id: string; // ra_*
  sent_to: string;
  at: string; // RFC3339
  response?: string;
}

export interface RescindLocalEffect {
  surface: string;
  action: string;
  at: string; // RFC3339
}

export interface RescindResponse {
  rescind_id: string; // rs_*
  tombstone_id: string; // ts_*
  rescinded_at: string; // RFC3339
  attestations: RescindAttestation[];
  local_effects: RescindLocalEffect[];
  /** Verbatim ledger line the UI shows: "removed everywhere you control; N mirrors asked, M honored." */
  ui_copy: string;
  /** Stub marker. The real feed.rescind is a signed act with mirror-registry sourcing (F-7). */
  mock_only: true;
}

export interface ApproveDraftCard {
  draft_id: string; // fd_*
  kind: FeedItemKind;
  source_scope: string;
  proposed_scope: string;
  /** Computed server-side, shown verbatim. Widening deltas carry the per-item marker. */
  scope_delta: string;
  created_at: string; // RFC3339
  widening: boolean;
  /** A widening draft is NEVER eligible for standing-rule auto-approve. */
  auto_approve_eligible: boolean;
}

export interface DraftsResponse {
  drafts: ApproveDraftCard[];
}

export interface RescindLedgerRecord {
  rescind_id: string;
  item_id: string;
  scope_before: string;
  scope_after: string;
  reason?: string;
  tombstone_id: string;
  attestations: RescindAttestation[];
  local_effects: RescindLocalEffect[];
  at: string; // RFC3339
}

export interface LedgerResponse {
  records: RescindLedgerRecord[];
}

export type FeedErrorCode =
  | 'validation_error'
  | 'not_found' // deliberately coarse: nonexistent, rescinded, not-in-your-audience are indistinguishable
  | 'not_authorized_for_audience'
  | 'rescind_refused'
  | 'mock_limitation';

export interface FeedErrorResponse {
  error: {
    code: FeedErrorCode;
    message: string;
  };
  trace_id: string;
  mock?: true;
}
