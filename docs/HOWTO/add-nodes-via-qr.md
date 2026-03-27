# How to Add Nodes via QR Code

This guide explains how to use the AXIOM-MESH QR Provisioning System to quickly and securely add new nodes to your private mesh network.

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Step-by-Step Guide](#step-by-step-guide)
- [Advanced Configuration](#advanced-configuration)
- [Troubleshooting](#troubleshooting)

## Overview

The QR Provisioning System allows you to:
- Generate time-limited invitation QR codes
- Onboard nodes securely with wallet signatures
- Auto-generate node configurations
- Track all invitations and joined nodes

**Use Cases:**
- Adding validator nodes to your consensus network
- Deploying storage nodes across multiple locations
- Setting up education nodes in classrooms
- Rapid scaling of compute nodes

## Prerequisites

1. **Coordinator Node**: A running AXIOM-MESH coordinator
2. **Python 3.8+**: For running provisioning services
3. **Modern Browser**: Chrome, Firefox, or Edge
4. **Mobile Device**: With camera for scanning (optional)
5. **Web3 Wallet**: MetaMask or Phantom (for signature verification)

## Quick Start

### 1. Start Provisioning Services

```bash
cd /path/to/axiom-mesh/services/provision
./start.sh
```

You should see:
```
✅ Services started successfully!
   Dashboard: http://localhost:8081
   Scanner UI: http://localhost:8082
```

### 2. Generate Invitation

Open http://localhost:8081 and:
- Select node type
- Set duration (default: 5 minutes)
- Click "Generate Invitation QR Code"

### 3. Scan and Join

On the new node device:
- Open http://localhost:8082 (or deploy scanner publicly)
- Scan the QR code
- Connect wallet and sign
- Download configuration

## Step-by-Step Guide

### Step 1: Configure Environment

Create or update your `.env` file:

```bash
# Mesh configuration
MESH_ID=my-production-mesh
COORDINATOR_URL=https://coordinator.mymesh.com:8081
NETWORK_NAME=axiom-mainnet
CHAIN_ID=1
RPC_URL=https://mainnet.infura.io/v3/YOUR_KEY

# Security (CHANGE THIS!)
AXIOM_MESH_SECRET=your-super-secret-key-here
```

### Step 2: Start Coordinator Service

```bash
cd services/provision

# Option A: Interactive mode
./start.sh

# Option B: Background service
PROVISION_MODE=coordinator nohup ./start.sh > provision.log 2>&1 &

# Option C: Docker
docker-compose up -d provision-coordinator
```

### Step 3: Generate Invitation Token

**Via Web Interface:**

1. Navigate to http://localhost:8081
2. Fill in the form:
   - **Node Type**: Choose from dropdown
     - Validator: For consensus participation
     - Storage: For data storage operations
     - Compute: For zkML/compute tasks
     - Education: For learning/test environments
   - **Duration**: How long the token is valid (1-60 minutes)
   - **Max Uses**: How many times it can be used (1-10)
3. Click "Generate Invitation QR Code"
4. The QR code appears instantly

**Via API:**

```bash
curl -X POST http://localhost:8081/api/generate-invitation \
  -H "Content-Type: application/json" \
  -d '{
    "node_type": "validator",
    "duration_minutes": 10,
    "max_uses": 1
  }'
```

Response:
```json
{
  "token_id": "xyz789abc",
  "qr_code_url": "http://localhost:8081/api/qr/xyz789abc",
  "expires_at": "2024-03-27T23:15:00",
  "download_url": "http://localhost:8081/api/config/xyz789abc",
  "manual_config": "# Full config file content..."
}
```

### Step 4: Deploy Scanner (Optional)

For remote onboarding, deploy the scanner on a public server:

```bash
# On public server
export COORDINATOR_URL=https://coordinator.mymesh.com:8081
export PROVISION_MODE=scanner

./start.sh
```

Or use Docker:
```bash
docker run -d \
  -p 8082:8082 \
  -e COORDINATOR_URL=https://coordinator.mymesh.com:8081 \
  -e PROVISION_MODE=scanner \
  --name axiom-scanner \
  axiom-mesh-provision
```

### Step 5: New Node Onboarding

**On the new node's device:**

1. **Open Scanner**: Navigate to scanner URL (local or public)
2. **Grant Camera Access**: Allow browser to use camera
3. **Scan QR Code**: Hold device up to QR code on coordinator screen
4. **Verify Scan**: You should see "QR Code scanned successfully!"
5. **Connect Wallet**: 
   - Click "Connect MetaMask"
   - Approve connection in wallet popup
6. **Sign Message**:
   - Click "Sign & Join Mesh"
   - Review message in wallet
   - Sign to prove node ownership
7. **Download Config**:
   - Click "Download Config" button
   - Save `axiom-node.env` file securely

**Alternative: Manual Setup**

If you can't use the scanner:

1. Copy the config text from coordinator dashboard
2. Save as `.env` on new node
3. Manually set up node:

```bash
mkdir -p ~/axiom-node
cd ~/axiom-node
cp /path/to/axiom-node.env .env

git clone https://github.com/your-org/axiom-mesh.git
cd axiom-mesh
docker-compose up -d
```

### Step 6: Verify Node Joined

**On Coordinator Dashboard:**

1. Check statistics on main page
2. "Nodes Joined" counter should increment
3. Or check active tokens: http://localhost:8081/api/tokens

**On New Node:**

```bash
# Check if connected
docker-compose ps

# View logs
docker-compose logs -f

# Should see messages like:
# "Successfully joined mesh: my-production-mesh"
# "Node ID: node-abc12345"
```

## Advanced Configuration

### Custom Token Expiry

For high-security environments, use shorter expiry:

```bash
curl -X POST http://localhost:8081/api/generate-invitation \
  -H "Content-Type: application/json" \
  -d '{
    "node_type": "validator",
    "duration_minutes": 2,
    "max_uses": 1
  }'
```

### Bulk Node Deployment

Generate multiple invitations at once:

```python
import requests
import json

for i in range(10):
    response = requests.post(
        'http://localhost:8081/api/generate-invitation',
        json={
            'node_type': 'storage',
            'duration_minutes': 30,
            'max_uses': 1,
            'metadata': {'batch_id': f'batch-{i//5}', 'location': f'dc-{i%3}'}
        }
    )
    print(f"Node {i}: {response.json()['token_id']}")
```

### Revoke Compromised Tokens

```bash
# List all active tokens
curl http://localhost:8081/api/tokens

# Revoke specific token
curl -X DELETE http://localhost:8081/api/token/TOKEN_ID
```

### Integrate with Existing Systems

**Add to your dashboard:**

```javascript
// Embed QR generator in your existing UI
async function generateInvitation(nodeType) {
  const response = await fetch('/api/generate-invitation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      node_type: nodeType,
      duration_minutes: 5
    })
  });
  
  const data = await response.json();
  document.getElementById('qr-image').src = data.qr_code_url;
}
```

**Webhook Notifications:**

Modify `provision_service.py` to send webhooks:

```python
async def notify_webhook(event_type: str, data: dict):
    webhook_url = os.environ.get("WEBHOOK_URL")
    if webhook_url:
        async with httpx.AsyncClient() as client:
            await client.post(webhook_url, json={
                "event": event_type,
                "data": data,
                "timestamp": datetime.now().isoformat()
            })
```

## Troubleshooting

### QR Code Won't Scan

**Symptoms:**
- Scanner shows "Invalid QR code"
- Camera doesn't focus

**Solutions:**
1. Increase lighting
2. Clean camera lens
3. Try different browser (Chrome works best)
4. Increase QR code size in generator settings
5. Ensure QR code is fully visible in scanner frame

### Wallet Connection Fails

**Symptoms:**
- "MetaMask not installed" error
- Connection popup doesn't appear

**Solutions:**
1. Install MetaMask extension: https://metamask.io
2. Refresh the page after installing
3. Ensure you're on HTTPS (required by some wallets)
4. Check browser console for errors (F12)
5. Try alternative wallet (Phantom, WalletConnect)

### Token Already Used

**Symptoms:**
- "Token already used" error when joining

**Solutions:**
1. Generate a new invitation token
2. Check `/api/tokens` to see token status
3. Ensure token wasn't accidentally scanned twice
4. Use `max_uses > 1` if multiple nodes need same config

### Configuration Download Fails

**Symptoms:**
- Download button doesn't work
- Config file is empty

**Solutions:**
1. Check coordinator service is running
2. Verify token hasn't expired
3. Check disk space on coordinator (`df -h /tmp`)
4. Review coordinator logs for errors

### Service Won't Start

**Symptoms:**
- `./start.sh` fails immediately
- Port already in use errors

**Solutions:**
```bash
# Check what's using the ports
lsof -i :8081
lsof -i :8082

# Kill conflicting processes
kill -9 <PID>

# Or change ports
export PROVISION_COORDINATOR_PORT=9081
export PROVISION_SCANNER_PORT=9082
./start.sh
```

### Production Deployment Issues

**Symptoms:**
- Works locally but not on server
- CORS errors in browser

**Solutions:**
1. Configure reverse proxy (nginx/Apache)
2. Set correct CORS origins in services
3. Use HTTPS with valid certificate
4. Check firewall rules allow ports 8081/8082
5. Verify environment variables are set correctly

## Best Practices

1. **Always use HTTPS** in production
2. **Change default secret key** before deploying
3. **Keep token duration short** (2-5 minutes ideal)
4. **Monitor active tokens** regularly
5. **Revoke unused tokens** after deployment
6. **Backup token database** (`/tmp/axiom_provision_tokens.json`)
7. **Use one-time tokens** (`max_uses=1`) for validators
8. **Log all join events** for audit trail

## Next Steps

- [Custom GUI System](custom-guis.md) - Node-specific dashboards
- [Live USB Builder](create-bootable-usb.md) - Bootable installation media
- [Security Hardening](security-hardening.md) - Production security checklist
- [Scaling Guide](scaling-mesh.md) - Deploying large networks

## Support

For additional help:
- Check API documentation in `/services/provision/README.md`
- Review example configurations in `/config/examples/`
- Open an issue on GitHub
- Join the AXIOM-MESH Discord community
