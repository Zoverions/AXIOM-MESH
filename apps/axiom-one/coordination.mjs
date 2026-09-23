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
      || !nonnegative(provenance.revision)
      || !/^[a-f0-9]{64}$/.test(provenance.content_digest ?? '')) {
    throw new Error('Trusted feed provenance is required');
  }
  if (!isRecord(source) || source.format !== 'MESH_STATUS v1' || !isRecord(source.agents)
      || Object.keys(source.agents).length > MAX_AGENTS) throw new Error('Invalid MESH_STATUS v1 source');
  const observed = Date.parse(source.updated_at);
  if (!Number.isFinite(observed) || typeof source.updated_at !== 'string') {
    throw new Error('MESH_STATUS v1 needs a valid update time');
  }
  const agents = Object.entries(source.agents).map(([id, item]) => {
    if (!isRecord(item) || !/^[A-Za-z0-9_.:-]{1,80}$/.test(id)) {
      throw new Error('Invalid MESH_STATUS v1 agent');
    }
    const heartbeatTime = item.last_heartbeat == null ? null : Date.parse(item.last_heartbeat);
    if (heartbeatTime !== null && !Number.isFinite(heartbeatTime)) {
      throw new Error('Invalid MESH_STATUS v1 heartbeat');
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
      heartbeat: { last_seen_at: heartbeatTime === null ? null : new Date(heartbeatTime).toISOString(),
        interval_seconds: interval },
      // Prose such as "coordinator-standing" or "protocol-accepted" is not a
      // verifiable lease expiry. It remains unknown until a structured lease arrives.
      lease: { state: 'unknown', expires_at: null },
      checkpoint: { last_processed_id: checkpointId, last_processed_at: null,
        processed_seq: null, source_high_water_seq: null },
      work: String(item.work ?? '').slice(0, 240), blockers,
      reported_state: String(item.state ?? 'unknown').slice(0, 80), capacity: 'unknown', resources: {}
    };
  });
  return { schema: SCHEMA, ...provenance, observed_at: new Date(observed).toISOString(), agents, history: [] };
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
  if (!isRecord(snapshot) || snapshot.schema !== SCHEMA || timestamp(snapshot.observed_at) === null
      || timestamp(snapshot.observed_at) > nowMs + FUTURE_TOLERANCE_MS
      || !/^[A-Za-z0-9_.:-]{1,80}$/.test(snapshot.source_id ?? '')
      || !/^[A-Za-z0-9_.:-]{1,80}$/.test(snapshot.audience_id ?? '')
      || !nonnegative(snapshot.revision)
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
          && timestamp(agent.heartbeat.last_seen_at) > timestamp(snapshot.observed_at) + FUTURE_TOLERANCE_MS)
        || (agent.heartbeat.interval_seconds !== null && (!Number.isInteger(agent.heartbeat.interval_seconds)
          || agent.heartbeat.interval_seconds < 5 || agent.heartbeat.interval_seconds > 3600))
        || !isRecord(agent.lease) || !['active', 'expired', 'revoked', 'none', 'unknown'].includes(agent.lease.state)
        || (agent.lease.expires_at !== null && timestamp(agent.lease.expires_at) === null)
        || !isRecord(agent.checkpoint)
        || (agent.checkpoint.processed_seq !== null && !nonnegative(agent.checkpoint.processed_seq))
        || (agent.checkpoint.source_high_water_seq !== null && !nonnegative(agent.checkpoint.source_high_water_seq))
        || (agent.checkpoint.processed_seq !== null && agent.checkpoint.source_high_water_seq !== null
          && agent.checkpoint.processed_seq > agent.checkpoint.source_high_water_seq)
        || (agent.checkpoint.last_processed_at !== null && timestamp(agent.checkpoint.last_processed_at) === null)
        || (agent.checkpoint.last_processed_at !== null
          && timestamp(agent.checkpoint.last_processed_at) > Math.min(nowMs, timestamp(snapshot.observed_at)) + FUTURE_TOLERANCE_MS)
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
        || timestamp(event.occurred_at) > Math.min(nowMs, timestamp(snapshot.observed_at)) + FUTURE_TOLERANCE_MS
        || !boundedText(event.kind, 80) || !boundedText(event.outcome, 80)) return false;
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
  const replayed = snapshotValid && lastGoodComparable
    && (snapshot.revision < lastGood.revision
      || timestamp(snapshot.observed_at) < timestamp(lastGood.observed_at)
      || (snapshot.revision === lastGood.revision
        && (snapshot.observed_at !== lastGood.observed_at
          || snapshot.content_digest !== lastGood.content_digest)));
  const sourceState = snapshot === null ? 'unavailable'
    : !snapshotValid ? 'malformed'
      : replayed ? 'replayed'
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
      if (sourceState !== 'live') entry.last_known_state = lastKnownState;
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
  const history = (retained?.history ?? []).filter(event => visibleIds === null || visibleIds.has(event.agent_id))
    .map(event => ({ event_id: event.event_id, agent_id: event.agent_id,
      occurred_at: event.occurred_at, kind: event.kind, outcome: event.outcome }))
    .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at) || a.event_id.localeCompare(b.event_id));
  return { schema: 'axiom-one.coordination-view.v1', source_state: sourceState,
    as_of: retained?.observed_at ?? null, revision: retained?.revision ?? null, agents, history };
}
