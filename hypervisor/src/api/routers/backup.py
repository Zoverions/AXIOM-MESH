from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
import os
import json
import base64
from typing import Optional
from src.recovery.bundle_manager import RecoveryBundleManager
from src.recovery.cloud_storage import CloudStorageFactory

router = APIRouter(prefix="/backup", tags=["backup"])

# Re-implementing verify_signature minimally or importing it correctly later
def get_expected_api_key() -> str:
    from src.core.secrets import SecretManager
    expected = SecretManager.get_secret("HYPERVISOR_API_KEY")
    if not expected:
        raise HTTPException(status_code=500, detail="HYPERVISOR_API_KEY not set")
    return expected

import fastapi

async def verify_signature(request: fastapi.Request):
    import hmac, hashlib
    from datetime import datetime, timezone
    timestamp = request.headers.get("X-Axiom-Timestamp")
    nonce = request.headers.get("X-Axiom-Nonce")
    signature = request.headers.get("X-Axiom-Signature")

    if not timestamp or not nonce or not signature:
        raise HTTPException(status_code=403, detail="Missing required signature headers")

    try:
        ts_val = int(timestamp)
        now = int(datetime.now(timezone.utc).timestamp() * 1000)
        if abs(now - ts_val) > 300000:
            raise HTTPException(status_code=403, detail="Request signature expired")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid timestamp format")

    api_key = get_expected_api_key()
    body = await request.body()
    payload = f"{timestamp}:{nonce}:{body.decode('utf-8')}"
    expected_mac = hmac.new(api_key.encode('utf-8'), payload.encode('utf-8'), hashlib.sha256).hexdigest()

    if not hmac.compare_digest(expected_mac, signature):
        raise HTTPException(status_code=403, detail="Invalid request signature")

    return api_key

class BackupCreateRequest(BaseModel):
    node_id: str
    cloud_provider: Optional[str] = None
    cloud_credentials: Optional[str] = None
    backup_name: Optional[str] = "axiom_backup.enc"

class BackupRestoreRequest(BaseModel):
    payload: Optional[str] = None
    cloud_provider: Optional[str] = None
    cloud_credentials: Optional[str] = None
    cloud_source: Optional[str] = None

@router.post("/create")
async def create_backup(request: BackupCreateRequest, api_key: str = Depends(verify_signature)):
    try:
        manager = RecoveryBundleManager()
        bundle_data = manager.create_bundle(request.node_id)

        # If no cloud provider, return the encrypted payload
        if not request.cloud_provider:
            return {
                "status": "success",
                "message": "Local backup generated",
                "bundle": base64.b64encode(bundle_data).decode("utf-8")
            }

        # Cloud upload
        if not request.cloud_credentials:
            raise HTTPException(status_code=400, detail="Missing cloud_credentials for cloud provider")

        provider = CloudStorageFactory.get_provider(request.cloud_provider)
        file_id = provider.upload_file(bundle_data, request.backup_name, request.cloud_credentials)

        return {
            "status": "success",
            "message": f"Backup uploaded to {request.cloud_provider}",
            "file_id": file_id
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/restore")
async def restore_backup(request: BackupRestoreRequest, api_key: str = Depends(verify_signature)):
    try:
        manager = RecoveryBundleManager()

        bundle_data = None
        if request.payload:
            bundle_data = base64.b64decode(request.payload)
        elif request.cloud_provider and request.cloud_source and request.cloud_credentials:
            provider = CloudStorageFactory.get_provider(request.cloud_provider)
            bundle_data = provider.download_file(request.cloud_source, request.cloud_credentials)
        else:
            raise HTTPException(status_code=400, detail="Must provide either payload or cloud settings")

        if not bundle_data:
            raise HTTPException(status_code=400, detail="Failed to retrieve backup data")

        manager.restore_bundle(bundle_data)

        return {
            "status": "success",
            "message": "Node state restored from backup successfully"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/providers")
async def get_providers():
    return {
        "providers": ["gdrive", "onedrive"]
    }
