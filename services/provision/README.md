# AXIOM-MESH QR Provisioning System

## Overview

The QR Provisioning System provides a secure, user-friendly way to onboard new nodes to your private AXIOM-MESH network using QR codes and wallet signatures.

## Features

- 🔐 **Cryptographically Signed Tokens**: Time-limited, one-time-use invitation tokens
- 📱 **Mobile-Friendly Scanner**: Works on any device with a camera
- 🦊 **Wallet Integration**: MetaMask/Phantom signature verification
- ⏰ **Auto-Expiry**: Tokens expire after configurable duration (default: 5 minutes)
- 🎯 **Node-Type Specific**: Generate configs for validator, storage, compute, or education nodes
- 📊 **Real-Time Statistics**: Track active tokens, issued invitations, and joined nodes

## Architecture

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────────┐
│   Coordinator   │         │   QR Scanner     │         │    New Node     │
│   (Port 8081)   │◄───────►│   (Port 8082)    │◄───────►│   (Mobile/Web)  │
│                 │         │                  │         │                 │
│ - Generate QR   │         │ - Camera Access  │         │ - Scan QR Code  │
│ - Sign Tokens   │         │ - Wallet Connect │         │ - Sign Message  │
│ - Store Configs │         │ - Download Config│         │ - Get Config    │
└─────────────────┘         └──────────────────┘         └─────────────────┘
```

## Quick Start

### 1. Start the Services

```bash
cd services/provision
./start.sh
```

This starts both the Coordinator (port 8081) and Scanner (port 8082).

### 2. Generate Invitation

1. Open **http://localhost:8081** in your browser
2. Select node type (validator/storage/compute/education)
3. Set token duration and max uses
4. Click "Generate Invitation QR Code"

### 3. Join New Node

1. On the new node's device, open **http://localhost:8082** (or deploy scanner publicly)
2. Allow camera access
3. Scan the QR code from step 2
4. Connect wallet (MetaMask/Phantom)
5. Sign the join message
6. Download the configuration file

### 4. Run New Node

```bash
# On the new node machine
mkdir -p ~/axiom-node
cd ~/axiom-node

# Upload/download the config file
cp axiom-node.env .env

# Clone and start
git clone https://github.com/your-org/axiom-mesh.git
cd axiom-mesh
docker-compose up -d
```

## API Reference

### Coordinator API (Port 8081)

#### Generate Invitation
```http
POST /api/generate-invitation
Content-Type: application/json

{
  "node_type": "validator",
  "duration_minutes": 5,
  "max_uses": 1
}
```

Response:
```json
{
  "token_id": "abc123...",
  "qr_code_url": "/api/qr/abc123...",
  "expires_at": "2024-03-27T23:00:00",
  "download_url": "/api/config/abc123...",
  "manual_config": "# Node configuration..."
}
```

#### Get QR Code
```http
GET /api/qr/{token_id}
```

#### Get Configuration
```http
GET /api/config/{token_id}
```

#### Join Mesh (with wallet signature)
```http
POST /api/join
Content-Type: application/json

{
  "token_id": "abc123...",
  "wallet_address": "0x...",
  "signature": "0x..."
}
```

#### List Active Tokens
```http
GET /api/tokens
```

#### Revoke Token
```http
DELETE /api/token/{token_id}
```

#### Get Statistics
```http
GET /api/stats
```

## Configuration

Set these environment variables before starting:

```bash
export MESH_ID="my-private-mesh"
export COORDINATOR_URL="http://coordinator.example.com:8081"
export NETWORK_NAME="axiom-mainnet"
export CHAIN_ID="1"
export RPC_URL="https://mainnet.infura.io/v3/YOUR_KEY"
export AXIOM_MESH_SECRET="your-secret-key-change-in-production"
```

## Security Considerations

1. **Change Default Secret**: Always set `AXIOM_MESH_SECRET` in production
2. **Use HTTPS**: Deploy behind reverse proxy with TLS
3. **Short Expiry**: Keep token duration as short as possible (1-5 minutes)
4. **One-Time Use**: Set `max_uses=1` for maximum security
5. **Firewall Rules**: Restrict access to coordinator API
6. **Audit Logs**: Monitor `/api/tokens` endpoint regularly

## Docker Deployment

### Dockerfile
```dockerfile
FROM python:3.11-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
EXPOSE 8081 8082

CMD ["./start.sh"]
```

### docker-compose.yml
```yaml
version: '3.8'

services:
  provision-coordinator:
    build: .
    ports:
      - "8081:8081"
    environment:
      - PROVISION_MODE=coordinator
      - MESH_ID=${MESH_ID}
      - AXIOM_MESH_SECRET=${AXIOM_MESH_SECRET}
    volumes:
      - provision-data:/tmp

  provision-scanner:
    build: .
    ports:
      - "8082:8082"
    environment:
      - PROVISION_MODE=scanner
      - COORDINATOR_URL=http://provision-coordinator:8081
    depends_on:
      - provision-coordinator

volumes:
  provision-data:
```

## Troubleshooting

### QR Code Not Scanning
- Ensure good lighting
- Check camera permissions
- Try increasing QR code size in generator

### Wallet Connection Fails
- Install MetaMask/Phantom extension
- Ensure you're on HTTPS (required for some wallets)
- Check browser console for errors

### Token Expired
- Generate a new invitation with longer duration
- Check system time synchronization

### Config Download Fails
- Verify token hasn't been used already
- Check coordinator service logs
- Ensure sufficient disk space in `/tmp`

## Development

### Running Tests
```bash
python -m pytest tests/
```

### Local Development
```bash
# Terminal 1 - Coordinator
python provision_service.py

# Terminal 2 - Scanner
COORDINATOR_URL=http://localhost:8081 python scanner_service.py
```

## License

MIT License - See LICENSE file for details

## Support

For issues and feature requests, please open a GitHub issue.
