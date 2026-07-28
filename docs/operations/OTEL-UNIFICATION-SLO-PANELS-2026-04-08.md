# OpenTelemetry Unification + SLO Panels (Gateway / Hypervisor / Sandbox / Grid)

Date: 2026-04-08  
Owner lane: M21.5 observability

## Scope

This document standardizes correlated observability context so operators can trace a single execution across:

- Gateway (ingress and channel fanout)
- Hypervisor (routing + orchestration)
- Sandbox (execution broker)
- Grid (consensus + settlement)

## Canonical Correlation Context

Every trace/log/metric event MUST carry the following keys when available:

- `trace_id` (globally unique per request lifecycle)
- `intent_id` (AXIOM intent identifier)
- `session_id` (conversation/session umbrella)
- `component` (`gateway|hypervisor|sandbox|grid`)
- `route` (`local|p2p|grid|external`)
- `risk_class` (if scheduler governance policy is active)

### Transport Mapping

- HTTP headers:
  - `X-Axiom-Trace-Id`
  - `X-Axiom-Intent-Id`
  - `X-Axiom-Session-Id`
- OTEL attributes:
  - `axiom.trace_id`
  - `axiom.intent_id`
  - `axiom.session_id`
  - `axiom.route`
  - `axiom.risk_class`

## Metrics Alignment

Minimum counters/histograms by component:

- Gateway
  - `gateway_requests_total`
  - `gateway_request_duration_ms`
- Hypervisor
  - `hypervisor_intent_total{status}`
  - `hypervisor_route_duration_ms{route}`
- Sandbox
  - `sandbox_execution_total{status}`
  - `sandbox_execution_duration_ms`
- Grid
  - `grid_consensus_total{outcome}`
  - `grid_finality_lag_ms`

## Dashboard SLO Panels (Grafana)

### Panel Group A: User-facing latency & reliability

1. **P95 End-to-End Intent Latency**
   - Signal: trace-derived duration from Gateway ingress to terminal Hypervisor response.
   - SLO target: <= 2500ms (rolling 28d).
2. **Success Ratio by Route**
   - Signal: `hypervisor_intent_total` split by `status` and `route`.
   - SLO target: >= 99.0% `success + degraded` for `local`; >= 97.5% for `p2p|grid`.

### Panel Group B: Safety & fail-closed posture

3. **Policy Halt Rate (risk_class=high/critical)**
   - Signal: intents denied by policy/guardrails.
   - SLO target: 100% blocked when approval trace is missing.
4. **Emergency Halt Propagation Time**
   - Signal: governance halt event to scheduler deny enforcement.
   - SLO target: <= 5s.

### Panel Group C: Infrastructure stability

5. **Sandbox Execution Error Budget Burn**
   - Signal: `sandbox_execution_total{status="error"}` over total.
   - SLO target: monthly error budget <= 1.0%.
6. **Grid Finality Lag**
   - Signal: `grid_finality_lag_ms` percentile trends.
   - SLO target: P99 <= 12000ms.

## Operator Verification

- Run parity check for dev environment wiring:

```bash
python3 scripts/check_devcontainer_parity.py
```

- Seed deterministic fixtures for local dashboards:

```bash
python3 scripts/seed_dev_fixtures.py
```

## Rollout Notes

1. Start with trace/log context propagation in dev compose.
2. Verify panel data population in Grafana/Prometheus before promotion.
3. Treat missing correlation context as a warning in dev and a release-gate fail in production RC pipelines.
