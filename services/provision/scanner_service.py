#!/usr/bin/env python3
"""
AXIOM-MESH QR Scanner Client
Mobile-friendly web interface for scanning QR codes and joining mesh networks
"""

import os
import sys
import json
import base64
from pathlib import Path

try:
    from fastapi import FastAPI, Request, Form
    from fastapi.responses import HTMLResponse, JSONResponse
    from fastapi.middleware.cors import CORSMiddleware
    import httpx
except ImportError as e:
    print(f"⚠️  Missing dependency: {e}")
    print("Install with: pip install fastapi uvicorn httpx")
    sys.exit(1)

app = FastAPI(
    title="AXIOM-MESH QR Scanner",
    description="Mobile QR scanner for node onboarding",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/", response_class=HTMLResponse)
async def scanner_ui():
    """Serve the QR scanner interface"""
    html_content = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AXIOM-MESH QR Scanner</title>
    <script src="https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js"></script>
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
            max-width: 500px;
            width: 100%;
            padding: 30px;
            text-align: center;
        }
        h1 {
            color: #333;
            margin-bottom: 10px;
            font-size: 1.8em;
        }
        .subtitle {
            color: #666;
            margin-bottom: 20px;
        }
        #reader {
            width: 100%;
            border-radius: 10px;
            overflow: hidden;
            margin: 20px 0;
        }
        .status {
            padding: 15px;
            border-radius: 8px;
            margin: 15px 0;
            display: none;
        }
        .status.success {
            background: #d4edda;
            color: #155724;
            border: 1px solid #c3e6cb;
        }
        .status.error {
            background: #f8d7da;
            color: #721c24;
            border: 1px solid #f5c6cb;
        }
        .status.info {
            background: #d1ecf1;
            color: #0c5460;
            border: 1px solid #bee5eb;
        }
        .wallet-section {
            margin-top: 20px;
            padding-top: 20px;
            border-top: 2px solid #eee;
        }
        .btn {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 8px;
            font-size: 1em;
            cursor: pointer;
            margin: 5px;
            transition: transform 0.2s;
        }
        .btn:hover {
            transform: translateY(-2px);
        }
        .btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
        .config-download {
            display: none;
            margin-top: 20px;
        }
        .config-download.active {
            display: block;
        }
        pre {
            background: #2d2d2d;
            color: #f8f8f2;
            padding: 15px;
            border-radius: 8px;
            overflow-x: auto;
            font-size: 0.85em;
            text-align: left;
            margin: 15px 0;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>📱 AXIOM-MESH QR Scanner</h1>
        <p class="subtitle">Scan invitation QR code to join the mesh</p>
        
        <div id="reader"></div>
        
        <div id="status" class="status"></div>
        
        <div class="wallet-section" id="walletSection" style="display: none;">
            <h3>🦊 Connect Wallet</h3>
            <p style="color: #666; margin: 10px 0;">Sign with your wallet to prove node ownership</p>
            <button class="btn" onclick="connectWallet()">Connect MetaMask</button>
            <button class="btn" onclick="signAndJoin()">Sign & Join Mesh</button>
        </div>
        
        <div class="config-download" id="configDownload">
            <h3>✅ Configuration Ready!</h3>
            <p style="color: #666; margin: 10px 0;">Download your node configuration:</p>
            <a id="downloadLink" href="#" download="axiom-node.env">
                <button class="btn">Download Config</button>
            </a>
            <pre id="configPreview"></pre>
        </div>
        
        <div style="margin-top: 20px;">
            <button class="btn" onclick="restartScanner()" style="background: #6c757d;">Scan Again</button>
        </div>
    </div>
    
    <script>
        let scannedData = null;
        let configData = null;
        let walletAddress = null;
        let signature = null;
        
        // Initialize QR scanner
        const html5QrCode = new Html5Qrcode("reader");
        
        function showStatus(message, type) {
            const statusEl = document.getElementById('status');
            statusEl.textContent = message;
            statusEl.className = `status ${type}`;
            statusEl.style.display = 'block';
        }
        
        async function connectWallet() {
            if (typeof window.ethereum !== 'undefined') {
                try {
                    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
                    walletAddress = accounts[0];
                    showStatus(`Connected: ${walletAddress.substring(0, 10)}...`, 'success');
                } catch (error) {
                    showStatus('Failed to connect wallet: ' + error.message, 'error');
                }
            } else {
                showStatus('MetaMask not installed! Please install MetaMask.', 'error');
            }
        }
        
        async function signAndJoin() {
            if (!walletAddress || !scannedData) {
                showStatus('Please scan QR code and connect wallet first', 'error');
                return;
            }
            
            try {
                // Sign the token data
                const msgParams = JSON.stringify({
                    types: {
                        EIP712Domain: [
                            { name: 'name', type: 'string' },
                            { name: 'version', type: 'string' },
                            { name: 'chainId', type: 'uint256' }
                        ],
                        JoinMesh: [
                            { name: 'token_id', type: 'string' },
                            { name: 'node_address', type: 'address' },
                            { name: 'timestamp', type: 'uint256' }
                        ]
                    },
                    primaryType: 'JoinMesh',
                    domain: {
                        name: 'AXIOM-MESH',
                        version: '1',
                        chainId: 1
                    },
                    message: {
                        token_id: scannedData.token_id,
                        node_address: walletAddress,
                        timestamp: Math.floor(Date.now() / 1000)
                    }
                });
                
                signature = await window.ethereum.request({
                    method: 'eth_signTypedData_v4',
                    params: [walletAddress, msgParams]
                });
                
                // Send to provisioning service
                const response = await fetch('/api/join', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        token_id: scannedData.token_id,
                        wallet_address: walletAddress,
                        signature: signature
                    })
                });
                
                const result = await response.json();
                
                if (result.success) {
                    showStatus('✅ Successfully joined the mesh!', 'success');
                    
                    // Download config
                    const blob = new Blob([configData], { type: 'text/plain' });
                    const url = URL.createObjectURL(blob);
                    document.getElementById('downloadLink').href = url;
                    document.getElementById('configPreview').textContent = configData;
                    document.getElementById('configDownload').classList.add('active');
                    document.getElementById('walletSection').style.display = 'none';
                } else {
                    showStatus('Failed to join: ' + result.message, 'error');
                }
                
            } catch (error) {
                showStatus('Error: ' + error.message, 'error');
            }
        }
        
        function restartScanner() {
            location.reload();
        }
        
        // Start scanning
        html5QrCode.start(
            { facingMode: "environment" },
            {
                fps: 10,
                qrbox: { width: 250, height: 250 }
            },
            async (decodedText, decodedResult) => {
                console.log(`QR Code detected: ${decodedText}`);
                
                try {
                    // Parse the signed payload
                    const [encodedPayload, signature] = decodedText.split('.');
                    const payloadStr = atob(encodedPayload);
                    const payload = JSON.parse(payloadStr);
                    
                    scannedData = payload;
                    
                    showStatus('✅ QR Code scanned successfully! Fetching configuration...', 'info');
                    
                    // Fetch configuration
                    const configResponse = await fetch(`/api/config/${payload.token_id}`);
                    if (configResponse.ok) {
                        configData = await configResponse.text();
                        
                        showStatus('Configuration loaded. Connect your wallet to continue.', 'success');
                        document.getElementById('walletSection').style.display = 'block';
                        
                        // Stop scanning
                        html5QrCode.stop();
                    } else {
                        throw new Error('Invalid or expired token');
                    }
                    
                } catch (error) {
                    showStatus('Invalid QR code: ' + error.message, 'error');
                }
            },
            (errorMessage) => {
                console.log('QR scan error:', errorMessage);
            }
        ).catch(err => {
            showStatus('Error starting camera: ' + err, 'error');
        });
    </script>
</body>
</html>
"""
    return HTMLResponse(content=html_content)

@app.post("/api/join")
async def join_mesh(request: Request):
    """Forward join request to provisioning service"""
    try:
        data = await request.json()
        
        # Get coordinator URL from environment
        coordinator_url = os.environ.get("COORDINATOR_URL", "http://localhost:8081")
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{coordinator_url}/api/join",
                json=data,
                timeout=30.0
            )
            
            return JSONResponse(status_code=response.status_code, content=response.json())
            
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": str(e)}
        )

@app.get("/api/config/{token_id}")
async def get_config(token_id: str):
    """Forward config request to provisioning service"""
    try:
        coordinator_url = os.environ.get("COORDINATOR_URL", "http://localhost:8081")
        
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{coordinator_url}/api/config/{token_id}",
                timeout=30.0
            )
            
            if response.status_code == 200:
                return HTMLResponse(content=response.text, media_type="text/plain")
            else:
                return JSONResponse(
                    status_code=response.status_code,
                    content={"error": "Config not found"}
                )
                
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )

if __name__ == "__main__":
    import uvicorn
    print("🚀 Starting AXIOM-MESH QR Scanner...")
    print("📍 Scanner UI: http://localhost:8082")
    uvicorn.run(app, host="0.0.0.0", port=8082)
