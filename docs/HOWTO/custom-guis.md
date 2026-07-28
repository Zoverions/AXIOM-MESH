# Custom Node GUIs

AXIOM-MESH provides specialized graphical interfaces tailored to each node type, offering real-time metrics and controls specific to your node's role in the network.

## Overview

Each node type has a dedicated interface accessible via a unique port:

| Node Type | Port | URL | Description |
|-----------|------|-----|-------------|
| **Education** | 8081 | `http://localhost:8081` | Learning progress, student metrics, curriculum tracking |
| **Validator** | 8082 | `http://localhost:8082` | Validation statistics, consensus participation, rewards |
| **Storage** | 8083 | `http://localhost:8083` | Storage utilization, file pinning, retrieval metrics |
| **Compute** | 8084 | `http://localhost:8084` | GPU/CPU usage, inference jobs, zkML proof generation |

## Auto-Detection & Launch

The system automatically detects your node type and launches the appropriate GUI on boot:

```bash
# Check your current node type
cat .env | grep NODE_ROLE

# Manually launch the GUI for your node type
make gui

# Or access directly via browser
xdg-open http://localhost:8081  # Example for Education node
```

## Education Node Interface (Port 8081)

### Features

- **Learning Progress Dashboard**: Track model training epochs, accuracy improvements, and convergence metrics
- **Student Analytics**: Monitor individual learner progress, completion rates, and assessment scores
- **Curriculum Manager**: View active courses, module completion, and resource allocation
- **Reward Tracker**: AXIOM tokens earned from educational contributions
- **Peer Collaboration**: Connect with other education nodes for federated learning

### Key Metrics

```
┌─────────────────────────────────────┐
│ Education Node Status               │
├─────────────────────────────────────┤
│ Active Students:        1,247       │
│ Courses Running:        12          │
│ Training Progress:      78%         │
│ Model Accuracy:         94.2%       │
│ Epochs Completed:       45/60       │
│ Tokens Earned (24h):    342 AXIOM   │
│ Federated Rounds:       8           │
└─────────────────────────────────────┘
```

### Actions

- Start/Stop training sessions
- Export student progress reports
- Adjust learning rate parameters
- Join federated learning swarms
- Deploy new curriculum modules

## Validator Node Interface (Port 8082)

### Features

- **Consensus Dashboard**: Real-time view of block validation, proposal voting, and finality
- **Performance Metrics**: Uptime, latency, successful validations, and slashing risk indicators
- **Reward Analytics**: Track validation rewards, penalties, and ROI over time
- **Network Health**: Peer connectivity, sync status, and chain height
- **Governance Participation**: Active proposals, voting history, and guild activities

### Key Metrics

```
┌─────────────────────────────────────┐
│ Validator Node Status               │
├─────────────────────────────────────┤
│ Validator Status:       ACTIVE      │
│ Current Epoch:          12,847      │
│ Blocks Validated:       1,456       │
│ Success Rate:           99.8%       │
│ Uptime (30d):           99.95%      │
│ Slashing Risk:          LOW         │
│ Rewards (24h):          523 AXIOM   │
│ Total Stake:            50,000 AXIOM│
│ Guild Rank:             Gold        │
└─────────────────────────────────────┘
```

### Actions

- Vote on governance proposals
- Adjust stake delegation
- View detailed validation logs
- Configure alert thresholds
- Export performance reports

## Storage Node Interface (Port 8083)

### Features

- **Storage Dashboard**: Visualize disk usage, file distribution, and replication factors
- **File Management**: Pin/unpin files, manage TTL, and set access policies
- **Retrieval Metrics**: Request latency, bandwidth usage, and cache hit rates
- **Revenue Tracking**: Storage fees earned, retrieval fees, and payout history
- **Health Checks**: File integrity verification, redundancy alerts, and repair jobs

### Key Metrics

```
┌─────────────────────────────────────┐
│ Storage Node Status                 │
├─────────────────────────────────────┤
│ Total Capacity:         2.0 TB      │
│ Used Space:             1.4 TB (70%)│
│ Files Pinned:           8,234       │
│ Replication Factor:     3x          │
│ Retrieval Requests/h:   145         │
│ Avg Latency:            23ms        │
│ Bandwidth (24h):        45 GB       │
│ Earnings (24h):         287 AXIOM   │
│ Integrity Score:        100%        │
└─────────────────────────────────────┘
```

### Actions

- Pin new files or collections
- Set storage quotas and limits
- Run integrity audits
- Configure geo-replication
- Generate revenue reports

## Compute Node Interface (Port 8084)

### Features

- **Resource Monitor**: Real-time GPU/CPU utilization, memory usage, and temperature
- **Job Queue**: Pending, running, and completed inference/compute jobs
- **zkML Proofs**: Proof generation status, verification time, and success rates
- **Model Library**: Available models, versions, and deployment status
- **Cost Analysis**: Compute costs, pricing tiers, and profitability metrics

### Key Metrics

```
┌─────────────────────────────────────┐
│ Compute Node Status                 │
├─────────────────────────────────────┤
│ GPU Utilization:        87%         │
│ CPU Utilization:        45%         │
│ Memory Usage:           24/32 GB    │
│ Active Jobs:            7           │
│ Queue Length:           3           │
│ zkML Proofs (24h):      156         │
│ Avg Proof Time:         2.3s        │
│ Earnings (24h):         612 AXIOM   │
│ Temperature:            72°C        │
└─────────────────────────────────────┘
```

### Actions

- Submit new compute jobs
- Scale resource allocation
- Deploy custom ML models
- View proof verification logs
- Optimize pricing strategies

## Configuration

### Enable/Disable Specific GUIs

Edit `.env` to control which interfaces are active:

```bash
# Enable all node-specific GUIs
ENABLE_CUSTOM_GUI=true

# Specify which ports to expose
GUI_EDUCATION_PORT=8081
GUI_VALIDATOR_PORT=8082
GUI_STORAGE_PORT=8083
GUI_COMPUTE_PORT=8084

# Disable specific GUIs if not needed
GUI_EDUCATION_ENABLED=false  # Disable education GUI
```

### Authentication

By default, GUIs are accessible only from localhost. To enable remote access:

```bash
# In .env
GUI_ALLOW_REMOTE=true
GUI_AUTH_TOKEN=your_secure_token_here
GUI_ALLOWED_IPS=192.168.1.0/24,10.0.0.5
```

### Theming

Customize the appearance:

```bash
# In .env
GUI_THEME=dark  # Options: dark, light, auto
GUI_PRIMARY_COLOR=#4F46E5
GUI_REFRESH_INTERVAL=5000  # ms
```

## Troubleshooting

### GUI Not Loading

1. Check if the service is running:
   ```bash
   docker ps | grep gui
   ```

2. Verify port binding:
   ```bash
   netstat -tlnp | grep 8081
   ```

3. Restart the GUI service:
   ```bash
   make restart-gui
   ```

### High Resource Usage

If the GUI consumes excessive resources:

```bash
# Reduce refresh rate
GUI_REFRESH_INTERVAL=10000

# Disable real-time charts
GUI_ENABLE_CHARTS=false

# Limit historical data retention
GUI_HISTORY_HOURS=24
```

### Connection Refused

Ensure Docker networking is configured correctly:

```bash
docker network ls
docker network inspect axiom-mesh_default
```

## API Access

Each GUI exposes a REST API for programmatic access:

```bash
# Education node metrics
curl http://localhost:8081/api/v1/metrics

# Validator status
curl http://localhost:8082/api/v1/status

# Storage utilization
curl http://localhost:8083/api/v1/storage

# Compute job queue
curl http://localhost:8084/api/v1/jobs
```

Authentication required for remote access:

```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
     http://localhost:8081/api/v1/metrics
```

## Development

### Build Custom GUI

The GUIs are built with React + TypeScript:

```bash
cd apps/gui
npm install
npm run dev  # Development mode
npm run build  # Production build
```

### Add New Node Type

1. Create new component in `apps/gui/src/nodes/`
2. Define metrics schema in `packages/types/src/node-types.ts`
3. Update port configuration in `packages/config/default.ts`
4. Register in `apps/gui/src/App.tsx`

## Security Best Practices

- **Never expose GUIs to public internet** without authentication
- **Use HTTPS** in production environments
- **Rotate auth tokens** regularly
- **Monitor access logs** for suspicious activity
- **Keep GUI dependencies updated** for security patches

## Next Steps

- **[Node Configuration](node-config.md)**: Customize node roles and resources
- **[Swarm Management](swarm-management.md)**: Connect with other nodes
- **[Security Audits](security-audits.md)**: Review security best practices
- **[First Steps](first-steps.md)**: Get started with your node

## Resources

- [GUI Source Code](../../apps/gui/)
- [API Documentation](../../packages/api/README.md)
- [Live USB Guide](create-bootable-usb.md)
- [Installation Guide](INSTALLATION-GUIDE.md)
