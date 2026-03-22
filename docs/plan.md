1. **Understand Goal**: Build a scheduler that routes tasks to nodes based on capability profiles, trust requirements, and cost/latency tradeoffs. The scheduler receives requests (`capsule_id`, `token`, `attestation_policy`, `compute_budget`) and returns a node assignment or node list along with a task ticket.
2. **Current Implementation**:
   - I have created `grid/internal/scheduler/scheduler.go` containing a `Scheduler` struct that holds task tickets and nodes metrics (trust scores, latencies, and costs).
   - I have implemented a `Schedule` method to find candidates satisfying the provided `RoutingPolicy` and `compute_budget` and return a selected `node_id` and a `TaskTicket`.
   - I have created tests to verify the routing based on max latency, max cost, and min trust score. It verifies that tasks are only sent to conforming nodes.
   - I have added a REST API implementation in `grid/api/scheduler_api.go` which exposes `POST /schedule` and `GET /schedule/{ticket}/status`.
   - I have integrated the API into the main HTTP multiplexer in `grid/api/server.go`.
3. **Missing Items from Requirements**:
   - The requirement specifies: "compatibility: node meets required_hardware_tier and service_classes" and the node registry should include these. Currently, my implementation only checks `MinTrustScore`, `MaxLatencyMs` and `MaxCost`. I need to update the scheduler logic and test to handle compatibility.
   - I need to implement a mechanism for Failover: "if chosen node becomes unavailable, scheduler reassigns within token TTL".
4. **Planned Changes**:
   - Update `types.AgentManifest` (or internal scheduler registry type) to include `HardwareTier` and `ServiceClasses`.
   - Update `RoutingPolicy` to include `RequiredHardwareTier` and `RequiredServiceClasses`.
   - Update `Schedule` function to filter out nodes that don't match hardware tiers or lack required service classes.
   - Add a `Reassign` API/method for the failover logic which returns a new node ID within the token TTL if the selected node becomes unavailable.
   - Update the test logic to include the 200 node / 1000 task simulation covering compatibility and failover logic.
