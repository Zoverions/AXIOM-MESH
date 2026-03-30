# Subtasks: Custom Node-Type-Specific GUI System

Parent queue: `docs/MASTER-TODO.md` (Lane M7.4)

## Overview

The Custom GUI System provides dedicated dashboard interfaces for each node type in the AXIOM-MESH network, automatically detected and launched based on the node's configured role.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  Gateway Service                         │
│                    (Port 8080)                           │
├─────────────────────────────────────────────────────────┤
│  Node Role Detector → Route to Appropriate GUI          │
└─────────────────────────────────────────────────────────┘
         │              │              │              │
         ▼              ▼              ▼              ▼
   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
   │Education │  │Validator │  │ Storage  │  │ Compute  │
   │ :8081    │  │ :8082    │  │ :8083    │  │ :8084    │
   └──────────┘  └──────────┘  └──────────┘  └──────────┘
```

## M7.4.1 Gateway Detection System
- [x] Implement node role detection from `.env` (NODE_ROLE variable)
- [x] Create routing logic to serve appropriate GUI based on role
- [x] Add fallback to default dashboard if role not recognized
- [x] Implement health check endpoint for each GUI service
- [x] Add authentication middleware for remote access control
- [x] Support theming configuration (dark/light/auto)

**Status:** ✅ Complete — Gateway serves role-specific GUIs at port 8080

## M7.4.2 Education Node GUI (Port 8081)

### Features Implemented
- [x] Learning progress dashboard with real-time metrics
  - Active students counter
  - Courses running status
  - Training progress percentage
  - Model accuracy tracking
  - Epochs completed visualization
- [x] Student analytics panel
  - Individual learner progress
  - Completion rates
  - Assessment scores
  - Engagement metrics
- [x] Curriculum manager
  - Active courses list
  - Module completion tracking
  - Resource allocation view
  - Deployment controls
- [x] Reward tracker
  - AXIOM tokens earned (24h)
  - Historical earnings chart
  - Payout history
  - Projection estimates
- [x] Federated learning visualization
  - Peer collaboration status
  - Federated rounds counter
  - Model aggregation progress
  - Network contribution metrics

### Actions Available
- [x] Start/Stop training sessions
- [x] Export student progress reports (CSV/PDF)
- [x] Adjust learning rate parameters
- [x] Join federated learning swarms
- [x] Deploy new curriculum modules

**Status:** ✅ Complete — Full education dashboard functional

## M7.4.3 Validator Node GUI (Port 8082)

### Features Implemented
- [x] Consensus dashboard
  - Real-time block validation feed
  - Proposal voting interface
  - Finality status indicator
  - Epoch progression tracker
- [x] Performance metrics
  - Uptime monitoring (30d rolling)
  - Latency measurements
  - Successful validation count
  - Slashing risk indicators (LOW/MEDIUM/HIGH)
- [x] Reward analytics
  - Validation rewards tracking
  - Penalty history
  - ROI calculations
  - Comparative performance vs network
- [x] Network health monitor
  - Peer connectivity status
  - Sync state indicator
  - Chain height display
  - Fork detection alerts
- [x] Governance participation
  - Active proposals list
  - Voting history
  - Guild activities
  - Delegate management

### Actions Available
- [x] Vote on governance proposals
- [x] Adjust stake delegation
- [x] View detailed validation logs
- [x] Configure alert thresholds
- [x] Export performance reports

**Status:** ✅ Complete — Full validator dashboard functional

## M7.4.4 Storage Node GUI (Port 8083)

### Features Implemented
- [x] Storage dashboard
  - Total capacity visualization
  - Used space percentage
  - File distribution map
  - Replication factor display
- [x] File management interface
  - Pin/unpin files
  - TTL management
  - Access policy configuration
  - Batch operations
- [x] Retrieval metrics
  - Request latency histogram
  - Bandwidth usage charts
  - Cache hit rate percentage
  - Geographic distribution
- [x] Revenue tracking
  - Storage fees earned
  - Retrieval fees breakdown
  - Payout history
  - Revenue projections
- [x] Health checks
  - File integrity verification status
  - Redundancy alerts
  - Repair job queue
  - Corruption detection

### Actions Available
- [x] Pin new files or collections
- [x] Set storage quotas and limits
- [x] Run integrity audits
- [x] Configure geo-replication
- [x] Generate revenue reports

**Status:** ✅ Complete — Full storage dashboard functional

## M7.4.5 Compute Node GUI (Port 8084)

### Features Implemented
- [x] Resource monitor
  - GPU utilization (real-time graph)
  - CPU utilization
  - Memory usage
  - Temperature sensors
  - Power consumption
- [x] Job queue management
  - Pending jobs list
  - Running jobs with progress
  - Completed jobs history
  - Failed jobs with error details
- [x] zkML proofs dashboard
  - Proof generation status
  - Verification time metrics
  - Success rate percentage
  - Proof size statistics
- [x] Model library
  - Available models list
  - Version management
  - Deployment status
  - Performance benchmarks
- [x] Cost analysis
  - Compute costs breakdown
  - Pricing tier comparison
  - Profitability metrics
  - ROI projections

### Actions Available
- [x] Submit new compute jobs
- [x] Scale resource allocation
- [x] Deploy custom ML models
- [x] View proof verification logs
- [x] Optimize pricing strategies

**Status:** ✅ Complete — Full compute dashboard functional

## M7.4.6 Auto-Launch System
- [x] Read NODE_ROLE from `.env` file on startup
- [x] Map roles to GUI ports:
  - `education-node` → 8081
  - `validator-node` → 8082
  - `storage-node` → 8083
  - `compute-node` → 8084
- [x] Launch appropriate GUI automatically on boot
- [x] Provide manual override via `make gui` command
- [x] Support multiple GUI instances for testing

**Status:** ✅ Complete — Auto-launch based on node role

## M7.4.7 Authentication & Security
- [x] Default localhost-only access
- [x] Optional remote access with authentication
  - Token-based auth (JWT/Bearer)
  - IP whitelist configuration
  - Session timeout management
- [x] HTTPS support for production deployments
- [x] Audit logging for all access attempts
- [x] Rate limiting on authentication endpoints

**Configuration Example:**
```bash
# In .env
GUI_ALLOW_REMOTE=true
GUI_AUTH_TOKEN=your_secure_token_here
GUI_ALLOWED_IPS=192.168.1.0/24,10.0.0.5
GUI_SESSION_TIMEOUT=3600
```

**Status:** ✅ Complete — Auth system implemented

## M7.4.8 REST API Endpoints

Each GUI exposes a REST API for programmatic access:

### Education API (`/api/v1/`)
- [x] `GET /metrics` — Learning progress metrics
- [x] `GET /students` — Student list and analytics
- [x] `GET /courses` — Active courses
- [x] `POST /training/start` — Start training session
- [x] `POST /training/stop` — Stop training session
- [x] `GET /rewards` — Earnings data

### Validator API (`/api/v1/`)
- [x] `GET /status` — Validator status
- [x] `GET /performance` — Performance metrics
- [x] `GET /rewards` — Rewards history
- [x] `POST /vote` — Submit governance vote
- [x] `GET /proposals` — Active proposals

### Storage API (`/api/v1/`)
- [x] `GET /storage` — Storage utilization
- [x] `GET /files` — Pinned files list
- [x] `POST /pin` — Pin new file
- [x] `POST /unpin` — Unpin file
- [x] `GET /revenue` — Revenue metrics

### Compute API (`/api/v1/`)
- [x] `GET /resources` — Resource utilization
- [x] `GET /jobs` — Job queue status
- [x] `POST /jobs/submit` — Submit compute job
- [x] `GET /proofs` — zkML proof statistics
- [x] `GET /models` — Available models

**Status:** ✅ Complete — All APIs documented and functional

## M7.4.9 Testing & Validation
- [x] Unit tests for role detection logic
- [x] Integration tests for each GUI endpoint
- [x] Load testing for concurrent connections
- [x] Security penetration testing
- [x] Cross-browser compatibility testing (Chrome, Firefox, Safari, Edge)
- [x] Mobile responsiveness testing
- [x] Accessibility compliance (WCAG 2.1 AA)

**Status:** ✅ Complete — UI/UX/browser/accessibility validation published in `docs/GUI-CROSS-BROWSER-ACCESSIBILITY-TESTING.md`

## M7.4.10 Documentation
- [x] Create comprehensive HOWTO guide (`docs/HOWTO/custom-guis.md`)
- [x] Document API endpoints with examples
- [x] Create troubleshooting guide
- [x] Add configuration reference
- [x] Include development guide for adding new node types

**Status:** ✅ Complete — Full documentation published

---

## Technical Stack

- **Frontend:** React 18 + TypeScript + TailwindCSS
- **State Management:** Zustand
- **Charts:** Recharts + VisX
- **Backend:** FastAPI (Python) for metrics aggregation
- **Real-time Updates:** Server-Sent Events (SSE)
- **Authentication:** JWT with refresh tokens

## Related Documents

- **HowTo Guide:** `docs/HOWTO/custom-guis.md`
- **Live USB System:** `docs/subtasks/LIVE-USB-SYSTEM.md`
- **Hardware Profiles:** `docs/HARDWARE-PROFILE-MATRIX.md`
- **API Documentation:** `packages/api/README.md`
- **Master TODO:** `docs/MASTER-TODO.md` (Lane M7.4)
- **Audit Reports:** `docs/audits/FULL-ECOSYSTEM-AUDIT-2026-03-29.md`, `docs/audits/security-hardening-blockchain-tokenomics-audit-2026-03-29.md`

## Success Criteria

- ✅ Each node type has dedicated, functional GUI
- ✅ Auto-detection and launch works reliably
- ✅ Real-time metrics update smoothly (<1s latency)
- ✅ Authentication secures remote access
- ✅ REST APIs provide full programmatic control
- ✅ Documentation is comprehensive and accurate
- ✅ Cross-browser testing complete
- ✅ Accessibility compliance verified

---

**Last Updated:** 2026-03-30  
**Owner:** @agent-gateway  
**Priority:** High (M7 Lane)  
**Status:** ✅ Feature Complete
