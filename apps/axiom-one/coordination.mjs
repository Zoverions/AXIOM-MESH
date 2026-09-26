// This app-local adapter is deliberately separate from the design-only Social
// feed. A trusted, authenticated server must supply and scope observations.
const SCHEMA = 'axiom-one.mesh-observation.v1';
const SOURCE_FRESH_MS = 35 * 60_000;
const FUTURE_TOLERANCE_MS = 30_000;
const RETAIN_LAST_GOOD_MS = 24 * 60 * 60_000;
const MAX_AGENTS = 100;
const MAX_HISTORY = 200;

export function adaptMeshStatusV1(source, provenance) {
  if (!isRecord(provenance) || !/^[A-Za-z0-9_.:-]{1,80}$/.test(provenance.source_id ?? '')
      || !/^[A-Za-z0-9_.:-]{1,80}$/.test(provenance.audience_id ?? '')
      || !['header', 'timestamp', 'unversioned'].includes(provenance.revision_kind ?? 'header')
      || ((provenance.revision_kind ?? 'header') === 'unversioned'
        ? provenance.revision !== null : !nonnegative(provenance.revision))
      || !/^[a-f0-9]{64}$/.test(provenance.content_digest ?? '')) {
    throw new Error('Trusted feed provenance is required');
  }
  if (!isRecord(source) || source.format !== 'MESH_STATUS v1' || !isRecord(source.agents)
      || Object.keys(source.agents).length > MAX_AGENTS) throw new Error('Invalid MESH_STATUS v1 source');
  const observed = normalizeSourceUpdateTime(source.updated_at);
  if (Object.hasOwn(source, 'updated_at') && observed === null) {
    throw new Error('Invalid MESH_STATUS v1 update time');
  }
  if (source.updated_at == null && provenance.revision_kind === 'timestamp') {
    throw new Error('Timestamp revision needs an update time');
  }
  if (provenance.revision_kind === 'timestamp' && observed === null) {
    throw new Error('Timestamp revision needs a valid update time');
  }
  const agents = Object.entries(source.agents).map(([id, item]) => {
    if (!isRecord(item) || !/^[A-Za-z0-9_.:-]{1,80}$/.test(id)) {
      throw new Error('Invalid MESH_STATUS v1 agent');
    }
    const heartbeatTime = item.last_heartbeat == null ? null : normalizeSourceTime(item.last_heartbeat);
    if (item.last_heartbeat != null && heartbeatTime === null) {
      throw new Error('Invalid MESH_STATUS v1 heartbeat');
    }
    const leaseExpiry = item.lease_expiry == null ? null : normalizeSourceTime(item.lease_expiry);
    if (item.lease_expiry != null && leaseExpiry === null) throw new Error('Invalid MESH_STATUS v1 lease expiry');
    const highWaterId = item.checkpoint_high_water == null ? null : item.checkpoint_high_water;
    if (highWaterId !== null && !boundedText(highWaterId, 120)) {
      throw new Error('Invalid MESH_STATUS v1 checkpoint high-water mark');
    }
    const slots = typeof item.heartbeat_slot === 'string'
      ? /^:(\d\d)\/:(\d\d)$/.exec(item.heartbeat_slot) : null;
    const minutes = slots ? slots.slice(1).map(Number) : [];
    const interval = minutes.length === 2 && minutes.every(n => n >= 0 && n < 60)
      ? ((minutes[1] - minutes[0] + 60) % 60 || 60) * 60 : null;
    const checkpointId = typeof item.last_processed_id === 'string'
      && !/^not-reported\b/i.test(item.last_processed_id) && boundedText(item.last_processed_id, 120)
      ? item.last_processed_id : null;
    const blockers = item.blockers === 'none' || !item.blockers ? []
      : [String(item.blockers).slice(0, 240)];
    return {
      id, kind: 'agent', reported_encryption: item.enc === 'g2-verified' ? 'g2-verified' : 'unknown',
      heartbeat: { last_seen_at: heartbeatTime,
        interval_seconds: interval },
      // Prose such as "coordinator-standing" or "protocol-accepted" is not a
      // verifiable lease expiry. It remains unknown until a structured lease arrives.
      lease: { state: 'unknown', expires_at: leaseExpiry },
      checkpoint: { last_processed_id: checkpointId, last_processed_at: null,
        processed_seq: null, source_high_water_seq: null, source_high_water_id: highWaterId },
      work: String(item.work ?? '').slice(0, 240), blockers,
      reported_state: String(item.state ?? 'unknown').slice(0, 80), capacity: 'unknown',
      resources: allowlistedResources(item.resources)
    };
  });
  if (source.history != null && (!Array.isArray(source.history) || source.history.length > MAX_HISTORY)) {
    throw new Error('Invalid MESH_STATUS v1 history');
  }
  const ids = new Set(agents.map(agent => agent.id));
  const history = (source.history ?? []).flatMap((entry, index) => {
    if (!isRecord(entry) || !boundedText(entry.actor, 80) || !boundedText(entry.event, 80)
        || normalizeSourceTime(entry.ts) === null) throw new Error('Invalid MESH_STATUS v1 history event');
    // Actor names outside the roster have no reliable scoped attribution.
    if (!ids.has(entry.actor)) return [];
    return [{ event_id: `v1.${provenance.revision ?? 'u'}.${index}`, agent_id: entry.actor,
      occurred_at: normalizeSourceTime(entry.ts), kind: 'reported_event', outcome: entry.event,
      owner_only: true }];
  });
  return { schema: SCHEMA, ...provenance, revision_kind: provenance.revision_kind ?? 'header',
    observed_at: observed, agents, history };
}

// The coordinator may publish its top-level update instant as a JSON number
// of milliseconds since the Unix epoch. Other v1 time fields stay ISO-only.
export function normalizeSourceUpdateTime(value) {
  if (typeof value === 'number') {
    // Keep the canonical four-digit UTC format used by the observation schema.
    if (!Number.isSafeInteger(value) || value < 0 || value > 253402300799999) return null;
    return new Date(value).toISOString();
  }
  return normalizeSourceTime(value);
}

function normalizeSourceTime(value) {
  if (typeof value !== 'string'
      || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?(?:Z|[+-]\d\d:\d\d)$/.test(value)) return null;
  const parts = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)/.exec(value);
  const [, year, month, day, hour, minute, second] = parts.map(Number);
  const maxDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (month < 1 || month > 12 || day < 1 || day > maxDay
      || hour > 23 || minute > 59 || second > 59) return null;
  const offset = /([+-])(\d\d):(\d\d)$/.exec(value);
  if (offset && (Number(offset[2]) > 23 || Number(offset[3]) > 59)) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function allowlistedResources(value) {
  const resources = {};
  if (!isRecord(value)) return resources;
  if (Number.isFinite(value.cpu_percent) && value.cpu_percent >= 0 && value.cpu_percent <= 100) {
    resources.cpu_percent = value.cpu_percent;
  }
  if (Number.isFinite(value.memory_mb) && value.memory_mb >= 0) resources.memory_mb = value.memory_mb;
  return resources;
}

function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value ? parsed : null;
}

function boundedText(value, maximum = 160) {
  return typeof value === 'string' && value.length <= maximum && !/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonnegative(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function validObservation(snapshot, nowMs) {
  if (!isRecord(snapshot) || snapshot.schema !== SCHEMA
      || !['header', 'timestamp', 'unversioned'].includes(snapshot.revision_kind ?? 'header')
      || (snapshot.observed_at !== null && timestamp(snapshot.observed_at) === null)
      || (snapshot.observed_at !== null && timestamp(snapshot.observed_at) > nowMs + FUTURE_TOLERANCE_MS)
      || !/^[A-Za-z0-9_.:-]{1,80}$/.test(snapshot.source_id ?? '')
      || !/^[A-Za-z0-9_.:-]{1,80}$/.test(snapshot.audience_id ?? '')
      || ((snapshot.revision_kind ?? 'header') === 'unversioned'
        ? snapshot.revision !== null : !nonnegative(snapshot.revision))
      || !/^[a-f0-9]{64}$/.test(snapshot.content_digest ?? '')
      || !Array.isArray(snapshot.agents) || snapshot.agents.length > MAX_AGENTS
      || !Array.isArray(snapshot.history) || snapshot.history.length > MAX_HISTORY) return false;
  const ids = new Set();
  const eventIds = new Set();
  for (const agent of snapshot.agents) {
    if (!isRecord(agent) || !boundedText(agent.id, 80) || !/^[A-Za-z0-9_.:-]+$/.test(agent.id)
        || ids.has(agent.id) || !['agent', 'worker'].includes(agent.kind)
        || !isRecord(agent.heartbeat)
        || (agent.heartbeat.last_seen_at !== null && timestamp(agent.heartbeat.last_seen_at) === null)
        || (agent.heartbeat.last_seen_at !== null
          && timestamp(agent.heartbeat.last_seen_at) > nowMs + FUTURE_TOLERANCE_MS)
        || (agent.heartbeat.last_seen_at !== null
          && snapshot.observed_at !== null
          && timestamp(agent.heartbeat.last_seen_at) > timestamp(snapshot.observed_at) + FUTURE_TOLERANCE_MS)
        || (agent.heartbeat.interval_seconds !== null && (!Number.isInteger(agent.heartbeat.interval_seconds)
          || agent.heartbeat.interval_seconds < 5 || agent.heartbeat.interval_seconds > 3600))
        || !isRecord(agent.lease) || !['active', 'expired', 'revoked', 'none', 'unknown'].includes(agent.lease.state)
        || (agent.lease.expires_at !== null && timestamp(agent.lease.expires_at) === null)
        || !isRecord(agent.checkpoint)
        || (agent.checkpoint.processed_seq !== null && !nonnegative(agent.checkpoint.processed_seq))
        || (agent.checkpoint.source_high_water_seq !== null && !nonnegative(agent.checkpoint.source_high_water_seq))
        || (agent.checkpoint.source_high_water_id != null
          && !boundedText(agent.checkpoint.source_high_water_id, 120))
        || (agent.checkpoint.processed_seq !== null && agent.checkpoint.source_high_water_seq !== null
          && agent.checkpoint.processed_seq > agent.checkpoint.source_high_water_seq)
        || (agent.checkpoint.last_processed_at !== null && timestamp(agent.checkpoint.last_processed_at) === null)
        || (agent.checkpoint.last_processed_at !== null
          && timestamp(agent.checkpoint.last_processed_at) > Math.min(nowMs,
            snapshot.observed_at === null ? nowMs : timestamp(snapshot.observed_at)) + FUTURE_TOLERANCE_MS)
        || (agent.checkpoint.last_processed_id !== null && !boundedText(agent.checkpoint.last_processed_id, 120))
        || !boundedText(agent.work, 240) || !Array.isArray(agent.blockers) || agent.blockers.length > 10
        || !agent.blockers.every(value => boundedText(value, 240))
        || !boundedText(agent.reported_state, 80) || !boundedText(agent.capacity, 80)
        || !['g2-verified', 'unknown'].includes(agent.reported_encryption)) return false;
    ids.add(agent.id);
  }
  for (const event of snapshot.history) {
    if (!isRecord(event) || !boundedText(event.event_id, 80) || !/^[A-Za-z0-9_.:-]+$/.test(event.event_id)
        || eventIds.has(event.event_id)
        || !ids.has(event.agent_id) || timestamp(event.occurred_at) === null
        || timestamp(event.occurred_at) > Math.min(nowMs,
          snapshot.observed_at === null ? nowMs : timestamp(snapshot.observed_at)) + FUTURE_TOLERANCE_MS
        || !boundedText(event.kind, 80) || !boundedText(event.outcome, 80)
        || (event.owner_only !== undefined && event.owner_only !== true)) return false;
    eventIds.add(event.event_id);
  }
  return true;
}

function agentState(agent, nowMs) {
  if (agent.lease.state === 'revoked' || agent.lease.state === 'expired'
      || (agent.lease.expires_at !== null && timestamp(agent.lease.expires_at) <= nowMs)) return 'lease_expired';
  if (agent.lease.state !== 'active' || agent.lease.expires_at === null) return 'unknown';
  if (agent.heartbeat.last_seen_at === null || agent.heartbeat.interval_seconds === null) return 'unknown';
  const rhythmMs = Math.max(60_000, agent.heartbeat.interval_seconds * 2_000);
  if (nowMs - timestamp(agent.heartbeat.last_seen_at) > rhythmMs) return 'heartbeat_stale';
  if (agent.checkpoint.source_high_water_seq === null || agent.checkpoint.processed_seq === null) return 'unknown';
  if (agent.checkpoint.source_high_water_seq === agent.checkpoint.processed_seq) return 'idle';
  if (agent.checkpoint.last_processed_at === null
      || nowMs - timestamp(agent.checkpoint.last_processed_at) > rhythmMs) return 'lagging';
  return 'healthy';
}

export function deriveCoordinationView({ snapshot, lastGood = null, now, scope } = {}) {
  if (!isRecord(scope) || !['owner', 'coordinator', 'member'].includes(scope.role)
      || !/^[A-Za-z0-9_.:-]{1,80}$/.test(scope.source_id ?? '')
      || !/^[A-Za-z0-9_.:-]{1,80}$/.test(scope.audience_id ?? '')
      || (scope.role !== 'owner' && (!Array.isArray(scope.visible_agent_ids)
        || !scope.visible_agent_ids.every(id => boundedText(id, 80))))) {
    throw new Error('A server-verified coordination scope is required');
  }
  const nowMs = timestamp(now);
  if (nowMs === null) throw new Error('An explicit UTC clock is required');
  const matchesScope = input => input.source_id === scope.source_id && input.audience_id === scope.audience_id;
  const snapshotValid = snapshot !== null && validObservation(snapshot, nowMs) && matchesScope(snapshot);
  const lastGoodComparable = validObservation(lastGood, nowMs) && matchesScope(lastGood);
  const lastGoodRetainable = lastGoodComparable
    && nowMs - timestamp(lastGood.observed_at) <= RETAIN_LAST_GOOD_MS;
  const snapshotKind = snapshot?.revision_kind ?? 'header';
  const lastGoodKind = lastGood?.revision_kind ?? 'header';
  const replayed = snapshotValid && lastGoodComparable
    && (snapshotKind === 'timestamp' && lastGoodKind === 'header'
      || snapshotKind === 'header' && lastGoodKind === 'timestamp'
        && (snapshot.observed_at === null || lastGood.observed_at === null
          || timestamp(snapshot.observed_at) <= timestamp(lastGood.observed_at))
      || snapshot.revision !== null && lastGood.revision !== null
        && snapshotKind === lastGoodKind && snapshot.revision < lastGood.revision
      || snapshotKind === 'timestamp' && lastGoodKind === 'timestamp'
        && snapshot.observed_at !== null && lastGood.observed_at !== null
        && timestamp(snapshot.observed_at) < timestamp(lastGood.observed_at)
      || snapshot.revision !== null && snapshot.revision === lastGood.revision
        && snapshotKind === lastGoodKind
        && (snapshot.observed_at !== lastGood.observed_at
          || snapshot.content_digest !== lastGood.content_digest));
  const sourceState = snapshot === null ? 'unavailable'
    : !snapshotValid ? 'malformed'
      : replayed ? 'replayed'
      : snapshot.observed_at === null || snapshot.revision === null ? 'unversioned'
        : nowMs - timestamp(snapshot.observed_at) > SOURCE_FRESH_MS ? 'stale' : 'live';
  const retained = replayed ? (lastGoodRetainable ? lastGood : null) : snapshotValid ? snapshot
    : sourceState === 'unavailable' && lastGoodRetainable ? lastGood : null;
  const visibleIds = scope.role === 'owner' ? null : new Set(scope.visible_agent_ids);
  const agents = (retained?.agents ?? []).filter(agent => visibleIds === null || visibleIds.has(agent.id))
    .map(agent => {
      const lastKnownState = agentState(agent, nowMs);
      const entry = {
        id: agent.id, kind: agent.kind,
        last_seen_at: agent.heartbeat.last_seen_at,
        heartbeat_interval_seconds: agent.heartbeat.interval_seconds,
        lease: { state: agent.lease.state, expires_at: agent.lease.expires_at },
        state: sourceState === 'live' ? lastKnownState : sourceState
      };
      if (sourceState !== 'live') entry.last_known_state = sourceState === 'unversioned'
        ? 'unknown' : lastKnownState;
      if (scope.role === 'owner' || (scope.role === 'coordinator'
          && Array.isArray(scope.visible_fields) && scope.visible_fields.includes('work'))) entry.work = agent.work;
      if (scope.role === 'owner' || (scope.role === 'coordinator'
          && Array.isArray(scope.visible_fields) && scope.visible_fields.includes('blockers'))) {
        entry.blockers = [...agent.blockers];
      }
      if (scope.role === 'owner') {
        entry.reported_encryption = agent.reported_encryption;
        entry.source_reported_state = agent.reported_state;
        entry.capacity = agent.capacity;
        entry.checkpoint = { ...agent.checkpoint };
        entry.resources = {};
        if (isRecord(agent.resources)) {
          if (Number.isFinite(agent.resources.cpu_percent) && agent.resources.cpu_percent >= 0
              && agent.resources.cpu_percent <= 100) entry.resources.cpu_percent = agent.resources.cpu_percent;
          if (Number.isFinite(agent.resources.memory_mb) && agent.resources.memory_mb >= 0) {
            entry.resources.memory_mb = agent.resources.memory_mb;
          }
        }
      }
      return entry;
    });
  const history = (retained?.history ?? []).filter(event => (visibleIds === null || visibleIds.has(event.agent_id))
      && (!event.owner_only || scope.role === 'owner'))
    .map(event => ({ event_id: event.event_id, agent_id: event.agent_id,
      occurred_at: event.occurred_at, kind: event.kind, outcome: event.outcome }))
    .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at) || a.event_id.localeCompare(b.event_id));
  return { schema: 'axiom-one.coordination-view.v1', source_state: sourceState,
    as_of: retained?.observed_at ?? null, revision: retained?.revision ?? null, agents, history };
}
