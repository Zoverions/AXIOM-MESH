const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export const LOCAL_FEED_SIGNAL_AVAILABILITY = Object.freeze({
  relevance: 'unavailable-without-bound-evidence',
  relationship: 'deterministic-owner-local',
  recency: 'deterministic-relative-publication-time',
  novelty: 'unavailable-without-bound-evidence',
  source_diversity: 'unavailable-without-bound-evidence',
  perspective_expansion: 'unavailable-without-bound-evidence',
  learning_value: 'unavailable-without-bound-evidence'
});

export const DEFAULT_LOCAL_FEED_WEIGHTS = Object.freeze({
  relevance: 0,
  relationship: 0.25,
  recency: 0.75,
  novelty: 0,
  source_diversity: 0,
  perspective_expansion: 0,
  learning_value: 0
});

const ZERO_SIGNALS = Object.freeze({
  relevance: 0,
  relationship: 0,
  recency: 0,
  novelty: 0,
  source_diversity: 0,
  perspective_expansion: 0,
  learning_value: 0
});

const NULL_EVIDENCE = Object.freeze({
  relevance: null,
  relationship: null,
  recency: null,
  novelty: null,
  source_diversity: null,
  perspective_expansion: null,
  learning_value: null
});

export function buildOwnerLocalFeedCandidates(publications) {
  if (!Array.isArray(publications)) {
    throw new TypeError('owner-local feed publications must be an array');
  }

  const normalized = publications.map((entry, index) => normalizePublication(entry, index));
  const active = normalized
    .filter(item => item.status === 'active')
    .slice()
    .sort((left, right) => (
      left.created_at.localeCompare(right.created_at)
      || left.publication_id.localeCompare(right.publication_id)
    ));
  const recency = new Map(active.map((item, index) => [
    item.publication_id,
    active.length <= 1 ? 1 : index / (active.length - 1)
  ]));

  return Object.freeze(normalized.map(item => Object.freeze({
    candidate_id: item.publication_id,
    publication_id: item.publication_id,
    published_at: item.created_at,
    source_kind: 'local-publication',
    source_reasons: Object.freeze(['local-corpus']),
    eligibility: Object.freeze({
      status: item.status === 'active' ? 'eligible' : 'excluded'
    }),
    signals: Object.freeze({
      ...ZERO_SIGNALS,
      relationship: item.status === 'active' ? 1 : 0,
      recency: item.status === 'active' ? recency.get(item.publication_id) : 0
    }),
    signal_evidence: NULL_EVIDENCE,
    source_record: item.source_record
  })));
}

export function chronologicalOwnerLocalPublications(publications) {
  if (!Array.isArray(publications)) return Object.freeze([]);
  return Object.freeze(publications
    .map((entry, index) => {
      try {
        return normalizePublication(entry, index);
      } catch {
        return null;
      }
    })
    .filter(item => item?.status === 'active')
    .sort((left, right) => (
      right.created_at.localeCompare(left.created_at)
      || left.publication_id.localeCompare(right.publication_id)
    ))
    .map(item => item.source_record));
}

export function cloneDefaultLocalFeedWeights() {
  return { ...DEFAULT_LOCAL_FEED_WEIGHTS };
}

function normalizePublication(entry, index) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new TypeError(`owner-local publication[${index}] must be an object`);
  }
  const publication = entry.publication;
  if (!publication || typeof publication !== 'object' || Array.isArray(publication)) {
    throw new TypeError(`owner-local publication[${index}].publication must be an object`);
  }
  if (
    typeof publication.publication_id !== 'string'
    || !IDENTIFIER.test(publication.publication_id)
  ) {
    throw new TypeError(`owner-local publication[${index}].publication_id is invalid`);
  }
  if (typeof publication.created_at !== 'string' || !UTC.test(publication.created_at)) {
    throw new TypeError(`owner-local publication[${index}].created_at is invalid`);
  }
  const parsed = new Date(publication.created_at);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== publication.created_at) {
    throw new TypeError(`owner-local publication[${index}].created_at is invalid`);
  }
  if (typeof entry.status !== 'string' || entry.status.length === 0) {
    throw new TypeError(`owner-local publication[${index}].status is invalid`);
  }
  return Object.freeze({
    publication_id: publication.publication_id,
    created_at: publication.created_at,
    status: entry.status,
    source_record: entry
  });
}
