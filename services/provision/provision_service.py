#!/usr/bin/env python3
"""
AXIOM-MESH QR Provisioning Service
Generates time-limited, cryptographically signed invitation QR codes
for secure node onboarding to private mesh networks.
"""

import os
import sys
import json
import time
import uuid
import base64
import hashlib
import secrets
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any, List

try:
    from fastapi import FastAPI, HTTPException, Request
    from fastapi.concurrency import run_in_threadpool
    from fastapi.responses import HTMLResponse, JSONResponse, FileResponse
    from fastapi.staticfiles import StaticFiles
    from fastapi.middleware.cors import CORSMiddleware
    from pydantic import BaseModel, Field
    import httpx
except ImportError as e:
    print(f"⚠️  Missing dependency: {e}")
    print("Install with: pip install fastapi uvicorn httpx pydantic qrcode[pil]")
    sys.exit(1)

try:
    from eth_account import Account
    from eth_account.messages import encode_typed_data
    HAS_ETH_ACCOUNT = True
except ImportError:
    HAS_ETH_ACCOUNT = False

try:
    import qrcode
    from qrcode.image.styledpil import StyledPilImage
    from qrcode.constants import ERROR_CORRECT_H
except ImportError:
    print("⚠️  Installing qrcode library...")
    os.system(f"{sys.executable} -m pip install qrcode[pil]")
    import qrcode
    from qrcode.image.styledpil import StyledPilImage
    from qrcode.constants import ERROR_CORRECT_H

# Configuration
PROVISION_DB = Path("/tmp/axiom_provision_tokens.json")
TOKEN_EXPIRY_MINUTES = 5
MAX_USES = 1

app = FastAPI(
    title="AXIOM-MESH Provisioning Service",
    description="Secure QR-based node onboarding for private mesh networks",
    version="1.0.0"
)

# Enable CORS for dashboard integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class InvitationToken(BaseModel):
    token_id: str
    mesh_id: str
    coordinator_url: str
    expires_at: float
    created_at: float
    used: bool = False
    uses_count: int = 0
    max_uses: int = MAX_USES
    node_type: str = "validator"
    metadata: Dict[str, Any] = {}

class InvitationRequest(BaseModel):
    node_type: str = Field(default="validator", description="Type of node to provision")
    duration_minutes: int = Field(default=5, ge=1, le=60, description="Token validity duration")
    max_uses: int = Field(default=1, ge=1, le=10, description="Maximum number of uses")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Additional metadata")

class InvitationResponse(BaseModel):
    token_id: str
    qr_code_url: str
    qr_code_data: str
    expires_at: str
    download_url: str
    manual_config: str

# In-memory token store (persisted to disk)
token_store: Dict[str, InvitationToken] = {}

def load_token_store():
    """Load token store from disk"""
    global token_store
    if PROVISION_DB.exists():
        try:
            with open(PROVISION_DB, 'r') as f:
                data = json.load(f)
                token_store = {k: InvitationToken(**v) for k, v in data.items()}
            # Clean expired tokens
            now = time.time()
            token_store = {k: v for k, v in token_store.items() if v.expires_at > now}
            save_token_store()
        except Exception as e:
            print(f"⚠️  Error loading token store: {e}")
            token_store = {}

def save_token_store():
    """Save token store to disk"""
    try:
        with open(PROVISION_DB, 'w') as f:
            json.dump({k: v.model_dump() for k, v in token_store.items()}, f, indent=2)
    except Exception as e:
        print(f"⚠️  Error saving token store: {e}")

def generate_secure_token() -> str:
    """Generate a cryptographically secure token"""
    return secrets.token_urlsafe(32)

def sign_payload(payload: Dict[str, Any], secret: Optional[str] = None) -> str:
    """Sign payload with HMAC-SHA256"""
    if not secret:
        secret = os.environ.get("AXIOM_MESH_SECRET", "axiom-default-secret-change-in-production")
    
    payload_str = json.dumps(payload, sort_keys=True)
    signature = hashlib.sha256(f"{secret}{payload_str}".encode()).hexdigest()
    return f"{base64.urlsafe_b64encode(payload_str.encode()).decode()}.{signature}"

def verify_signature(signed_data: str, secret: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Verify and decode signed payload"""
    try:
        if not secret:
            secret = os.environ.get("AXIOM_MESH_SECRET", "axiom-default-secret-change-in-production")
        
        encoded_payload, signature = signed_data.rsplit('.', 1)
        payload_str = base64.urlsafe_b64decode(encoded_payload.encode()).decode()
        
        # Verify signature
        expected_sig = hashlib.sha256(f"{secret}{payload_str}".encode()).hexdigest()
        if not secrets.compare_digest(signature, expected_sig):
            return None
        
        return json.loads(payload_str)
    except Exception as e:
        print(f"⚠️  Signature verification failed: {e}")
        return None

def get_mesh_config() -> Dict[str, Any]:
    """Get current mesh configuration from environment"""
    return {
        "mesh_id": os.environ.get("MESH_ID", "axiom-mesh-default"),
        "coordinator_url": os.environ.get("COORDINATOR_URL", "http://localhost:8000"),
        "network_name": os.environ.get("NETWORK_NAME", "axiom-private"),
        "chain_id": os.environ.get("CHAIN_ID", "31337"),
        "rpc_url": os.environ.get("RPC_URL", "http://localhost:8545"),
    }

def generate_qr_code(data: str, token_id: str) -> str:
    """Generate QR code image and save to file"""
    qr_dir = Path("/tmp/axiom_qr_codes")
    qr_dir.mkdir(exist_ok=True)
    
    qr = qrcode.QRCode(
        version=1,
        error_correction=ERROR_CORRECT_H,
        box_size=10,
        border=4,
    )
    qr.add_data(data)
    qr.make(fit=True)
    
    img = qr.make_image(fill_color="black", back_color="white")
    filepath = qr_dir / f"{token_id}.png"
    img.save(filepath)
    
    return str(filepath)

def save_config_file(filepath: Path, content: str):
    """Write configuration file to disk (synchronous)"""
    with open(filepath, 'w') as f:
        f.write(content)

def generate_config_file(token: InvitationToken) -> str:
    """Generate .env configuration file content for new node"""
    mesh_config = get_mesh_config()
    
    config = f"""# AXIOM-MESH Node Configuration
# Auto-generated by Provisioning Service
# Token: {token.token_id}
# Expires: {datetime.fromtimestamp(token.expires_at).isoformat()}

NODE_TYPE={token.node_type}
MESH_ID={mesh_config['mesh_id']}
COORDINATOR_URL={mesh_config['coordinator_url']}
NETWORK_NAME={mesh_config['network_name']}
CHAIN_ID={mesh_config['chain_id']}
RPC_URL={mesh_config['rpc_url']}

# Join token (one-time use)
JOIN_TOKEN={token.token_id}
JOIN_TOKEN_EXPIRES={token.expires_at}

# Auto-generated node ID
NODE_ID=node-{uuid.uuid4().hex[:8]}

# Security
API_KEY={secrets.token_urlsafe(32)}
SECRET_KEY={secrets.token_urlsafe(32)}
"""
    return config

@app.on_event("startup")
async def startup_event():
    """Initialize token store on startup"""
    load_token_store()
    print("✅ Provisioning service started")
    print(f"📍 Mesh ID: {get_mesh_config()['mesh_id']}")
    print(f"🔗 Coordinator URL: {get_mesh_config()['coordinator_url']}")

@app.on_event("shutdown")
async def shutdown_event():
    """Save token store on shutdown"""
    save_token_store()

@app.get("/", response_class=HTMLResponse)
async def root():
    """Serve the provisioning dashboard"""
    html_content = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AXIOM-MESH Node Provisioning</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 20px;
        }
        .container {
            background: white;
            border-radius: 20px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            max-width: 800px;
            width: 100%;
            padding: 40px;
        }
        h1 {
            color: #333;
            margin-bottom: 10px;
            font-size: 2em;
        }
        .subtitle {
            color: #666;
            margin-bottom: 30px;
            font-size: 1.1em;
        }
        .form-group {
            margin-bottom: 20px;
        }
        label {
            display: block;
            margin-bottom: 8px;
            color: #555;
            font-weight: 600;
        }
        select, input {
            width: 100%;
            padding: 12px;
            border: 2px solid #ddd;
            border-radius: 8px;
            font-size: 1em;
            transition: border-color 0.3s;
        }
        select:focus, input:focus {
            outline: none;
            border-color: #667eea;
        }
        button {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            padding: 15px 30px;
            border-radius: 8px;
            font-size: 1.1em;
            cursor: pointer;
            width: 100%;
            font-weight: 600;
            transition: transform 0.2s, box-shadow 0.2s;
        }
        button:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 20px rgba(102, 126, 234, 0.4);
        }
        button:active {
            transform: translateY(0);
        }
        .result {
            margin-top: 30px;
            padding: 20px;
            background: #f8f9fa;
            border-radius: 10px;
            display: none;
        }
        .result.active {
            display: block;
        }
        .qr-container {
            text-align: center;
            margin: 20px 0;
        }
        .qr-container img {
            max-width: 300px;
            border: 4px solid #667eea;
            border-radius: 10px;
        }
        .info-box {
            background: #e3f2fd;
            padding: 15px;
            border-radius: 8px;
            margin: 15px 0;
            border-left: 4px solid #2196F3;
        }
        .warning-box {
            background: #fff3e0;
            padding: 15px;
            border-radius: 8px;
            margin: 15px 0;
            border-left: 4px solid #FF9800;
        }
        .config-preview {
            background: #2d2d2d;
            color: #f8f8f2;
            padding: 15px;
            border-radius: 8px;
            overflow-x: auto;
            font-family: 'Courier New', monospace;
            font-size: 0.9em;
            margin: 15px 0;
        }
        .btn-secondary {
            background: #6c757d;
            margin-top: 10px;
        }
        .stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 15px;
            margin-top: 20px;
        }
        .stat-card {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 8px;
            text-align: center;
        }
        .stat-value {
            font-size: 2em;
            font-weight: bold;
            color: #667eea;
        }
        .stat-label {
            color: #666;
            font-size: 0.9em;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🔐 AXIOM-MESH Node Provisioning</h1>
        <p class="subtitle">Generate secure QR codes for instant node onboarding</p>
        
        <div class="info-box">
            <strong>ℹ️ How it works:</strong>
            <ol style="margin-left: 20px; margin-top: 10px;">
                <li>Configure invitation parameters below</li>
                <li>Scan QR code with new node's mobile device or webcam</li>
                <li>Sign with wallet to prove node ownership</li>
                <li>Auto-download configuration and join mesh</li>
            </ol>
        </div>
        
        <form id="provisionForm">
            <div class="form-group">
                <label for="nodeType">Node Type</label>
                <select id="nodeType" name="nodeType">
                    <option value="validator">Validator Node</option>
                    <option value="storage">Storage Node</option>
                    <option value="compute">Compute Node</option>
                    <option value="education">Education Node</option>
                </select>
            </div>
            
            <div class="form-group">
                <label for="duration">Token Duration (minutes)</label>
                <input type="number" id="duration" name="duration" min="1" max="60" value="5">
            </div>
            
            <div class="form-group">
                <label for="maxUses">Maximum Uses</label>
                <input type="number" id="maxUses" name="maxUses" min="1" max="10" value="1">
            </div>
            
            <button type="submit">Generate Invitation QR Code</button>
        </form>
        
        <div id="result" class="result">
            <div class="warning-box">
                <strong>⚠️ Important:</strong> This QR code expires in <span id="expiryTime"></span> minutes and can only be used <span id="maxUsesDisplay"></span> time(s).
            </div>
            
            <div class="qr-container">
                <img id="qrImage" src="" alt="QR Code">
            </div>
            
            <div style="text-align: center;">
                <a id="downloadBtn" href="#" download="axiom-node-config.env">
                    <button class="btn-secondary">Download Config File</button>
                </a>
                <button class="btn-secondary" onclick="copyConfig()">Copy Config to Clipboard</button>
            </div>
            
            <div class="config-preview" id="configPreview"></div>
        </div>
        
        <div class="stats">
            <div class="stat-card">
                <div class="stat-value" id="activeTokens">0</div>
                <div class="stat-label">Active Tokens</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" id="todayIssued">0</div>
                <div class="stat-label">Issued Today</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" id="totalJoined">0</div>
                <div class="stat-label">Nodes Joined</div>
            </div>
        </div>
    </div>
    
    <script>
        let currentConfig = '';
        
        document.getElementById('provisionForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const formData = {
                node_type: document.getElementById('nodeType').value,
                duration_minutes: parseInt(document.getElementById('duration').value),
                max_uses: parseInt(document.getElementById('maxUses').value)
            };
            
            try {
                const response = await fetch('/api/generate-invitation', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(formData)
                });
                
                if (!response.ok) throw new Error('Failed to generate invitation');
                
                const data = await response.json();
                
                // Display result
                document.getElementById('result').classList.add('active');
                document.getElementById('qrImage').src = data.qr_code_url;
                document.getElementById('expiryTime').textContent = formData.duration_minutes;
                document.getElementById('maxUsesDisplay').textContent = formData.max_uses;
                
                // Set download link
                const blob = new Blob([data.manual_config], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                document.getElementById('downloadBtn').href = url;
                
                // Show config preview
                currentConfig = data.manual_config;
                document.getElementById('configPreview').textContent = data.manual_config;
                
                // Update stats
                updateStats();
                
            } catch (error) {
                alert('Error: ' + error.message);
            }
        });
        
        function copyConfig() {
            navigator.clipboard.writeText(currentConfig).then(() => {
                alert('Configuration copied to clipboard!');
            }).catch(err => {
                console.error('Failed to copy:', err);
            });
        }
        
        async function updateStats() {
            try {
                const response = await fetch('/api/stats');
                const stats = await response.json();
                document.getElementById('activeTokens').textContent = stats.active_tokens;
                document.getElementById('todayIssued').textContent = stats.today_issued;
                document.getElementById('totalJoined').textContent = stats.total_joined;
            } catch (error) {
                console.error('Failed to update stats:', error);
            }
        }
        
        // Load initial stats
        updateStats();
    </script>
</body>
</html>
"""
    return HTMLResponse(content=html_content)

@app.post("/api/generate-invitation", response_model=InvitationResponse)
async def generate_invitation(request: InvitationRequest):
    """Generate a new invitation token and QR code"""
    
    # Get mesh configuration
    mesh_config = get_mesh_config()
    
    # Create token
    token_id = generate_secure_token()
    now = time.time()
    expires_at = now + (request.duration_minutes * 60)
    
    token = InvitationToken(
        token_id=token_id,
        mesh_id=mesh_config["mesh_id"],
        coordinator_url=mesh_config["coordinator_url"],
        expires_at=expires_at,
        created_at=now,
        max_uses=request.max_uses,
        node_type=request.node_type,
        metadata=request.metadata
    )
    
    # Store token
    token_store[token_id] = token
    await run_in_threadpool(save_token_store)
    
    # Create signed payload for QR code
    payload = {
        "token_id": token_id,
        "mesh_id": mesh_config["mesh_id"],
        "coordinator_url": mesh_config["coordinator_url"],
        "node_type": request.node_type,
        "expires_at": expires_at
    }
    
    signed_data = sign_payload(payload)
    
    # Generate QR code
    qr_filepath = await run_in_threadpool(generate_qr_code, signed_data, token_id)
    
    # Generate config file
    config_content = generate_config_file(token)
    
    # Create temporary config file for download
    config_dir = Path("/tmp/axiom_configs")
    config_dir.mkdir(exist_ok=True)
    config_filepath = config_dir / f"{token_id}.env"
    await run_in_threadpool(save_config_file, config_filepath, config_content)
    
    return InvitationResponse(
        token_id=token_id,
        qr_code_url=f"/api/qr/{token_id}",
        qr_code_data=signed_data,
        expires_at=datetime.fromtimestamp(expires_at).isoformat(),
        download_url=f"/api/config/{token_id}",
        manual_config=config_content
    )

@app.get("/api/qr/{token_id}")
async def get_qr_code(token_id: str):
    """Serve QR code image"""
    if token_id not in token_store:
        raise HTTPException(status_code=404, detail="Token not found")
    
    filepath = Path(f"/tmp/axiom_qr_codes/{token_id}.png")
    if not filepath.exists():
        raise HTTPException(status_code=404, detail="QR code not found")
    
    return FileResponse(filepath, media_type="image/png")

@app.get("/api/config/{token_id}")
async def get_config(token_id: str):
    """Serve configuration file"""
    if token_id not in token_store:
        raise HTTPException(status_code=404, detail="Token not found")
    
    filepath = Path(f"/tmp/axiom_configs/{token_id}.env")
    if not filepath.exists():
        raise HTTPException(status_code=404, detail="Config not found")
    
    return FileResponse(filepath, media_type="text/plain", filename="axiom-node-config.env")

@app.get("/api/stats")
async def get_stats():
    """Get provisioning statistics"""
    now = time.time()
    today_start = now - (now % 86400)  # Start of today
    
    active_tokens = sum(1 for t in token_store.values() if t.expires_at > now and not t.used)
    today_issued = sum(1 for t in token_store.values() if t.created_at > today_start)
    total_joined = sum(1 for t in token_store.values() if t.used)
    
    return {
        "active_tokens": active_tokens,
        "today_issued": today_issued,
        "total_joined": total_joined
    }

@app.post("/api/join")
async def join_mesh(request: Request):
    """Process node join request with wallet signature"""
    try:
        data = await request.json()
        token_id = data.get("token_id")
        wallet_address = data.get("wallet_address")
        signature = data.get("signature")
        
        if not all([token_id, wallet_address, signature]):
            raise HTTPException(status_code=400, detail="Missing required fields")
        
        # Verify token exists and is valid
        if token_id not in token_store:
            raise HTTPException(status_code=404, detail="Invalid token")
        
        token = token_store[token_id]
        
        # Check expiration
        if time.time() > token.expires_at:
            del token_store[token_id]
            await run_in_threadpool(save_token_store)
            raise HTTPException(status_code=400, detail="Token expired")
        
        # Check usage limit
        if token.used or token.uses_count >= token.max_uses:
            raise HTTPException(status_code=400, detail="Token already used")
        
        # Verify wallet signature
        if HAS_ETH_ACCOUNT:
            timestamp = data.get("timestamp")
            if timestamp is None:
                raise HTTPException(status_code=400, detail="Missing timestamp for signature verification")

            domain_data = {
                "name": "AXIOM-MESH",
                "version": "1",
                "chainId": 1
            }
            message_types = {
                "JoinMesh": [
                    {"name": "token_id", "type": "string"},
                    {"name": "node_address", "type": "address"},
                    {"name": "timestamp", "type": "uint256"}
                ]
            }
            message_data = {
                "token_id": token_id,
                "node_address": wallet_address,
                "timestamp": int(timestamp)
            }
            try:
                signable_message = encode_typed_data(domain_data=domain_data, message_types=message_types, message_data=message_data)
                recovered_address = Account.recover_message(signable_message, signature=signature)
                if recovered_address.lower() != wallet_address.lower():
                    raise HTTPException(status_code=400, detail="Invalid wallet signature")
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"Signature verification failed: {str(e)}")
        
        # Mark token as used
        token.used = True
        token.uses_count += 1
        token.metadata["wallet_address"] = wallet_address
        token.metadata["joined_at"] = datetime.now().isoformat()
        
        await run_in_threadpool(save_token_store)
        
        return {
            "success": True,
            "message": "Node successfully joined the mesh",
            "node_id": f"node-{uuid.uuid4().hex[:8]}",
            "mesh_id": token.mesh_id
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/token/{token_id}")
async def revoke_token(token_id: str):
    """Revoke an invitation token"""
    if token_id not in token_store:
        raise HTTPException(status_code=404, detail="Token not found")
    
    del token_store[token_id]
    await run_in_threadpool(save_token_store)
    
    return {"success": True, "message": "Token revoked"}

@app.get("/api/tokens")
async def list_tokens():
    """List all active tokens"""
    now = time.time()
    active = [
        {
            "token_id": t.token_id,
            "node_type": t.node_type,
            "expires_at": datetime.fromtimestamp(t.expires_at).isoformat(),
            "used": t.used,
            "uses_count": t.uses_count,
            "max_uses": t.max_uses
        }
        for t in token_store.values()
        if t.expires_at > now
    ]
    
    return {"tokens": active, "count": len(active)}

if __name__ == "__main__":
    import uvicorn
    print("🚀 Starting AXIOM-MESH Provisioning Service...")
    print("📍 Dashboard: http://localhost:8081")
    print("🔗 API: http://localhost:8081/api")
    uvicorn.run(app, host="0.0.0.0", port=8081)
