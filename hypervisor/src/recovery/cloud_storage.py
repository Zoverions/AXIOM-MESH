import requests
import json
from typing import Dict, Any, Union

class CloudStorageProvider:
    def upload_file(self, file_content: bytes, destination: str, credentials: str) -> str:
        raise NotImplementedError

    def download_file(self, source: str, credentials: str) -> bytes:
        raise NotImplementedError

def _parse_credentials(credentials: str) -> Union[str, Dict[str, Any]]:
    """
    Accept either:
    - plain access token string
    - JSON object string containing provider-specific fields
    """
    try:
        parsed = json.loads(credentials)
        if isinstance(parsed, dict):
            return parsed
    except (TypeError, json.JSONDecodeError):
        pass
    return credentials

def _resolve_access_token(credentials: str) -> str:
    parsed = _parse_credentials(credentials)
    if isinstance(parsed, dict):
        token = parsed.get("access_token", "")
        if not token:
            raise ValueError("Missing access_token in cloud_credentials")
        return token
    return parsed

class GoogleDriveProvider(CloudStorageProvider):
    def upload_file(self, file_content: bytes, destination: str, credentials: str) -> str:
        token = _resolve_access_token(credentials)
        headers = {
            "Authorization": f"Bearer {token}"
        }

        metadata = {
            "name": destination
        }

        files = {
            "data": ("metadata", json.dumps(metadata), "application/json"),
            "file": (destination, file_content, "application/octet-stream")
        }

        url = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart"

        res = requests.post(url, headers=headers, files=files, timeout=30)
        res.raise_for_status()

        return res.json().get("id", "uploaded")

    def download_file(self, source: str, credentials: str) -> bytes:
        token = _resolve_access_token(credentials)
        headers = {
            "Authorization": f"Bearer {token}"
        }
        url = f"https://www.googleapis.com/drive/v3/files/{source}?alt=media"

        res = requests.get(url, headers=headers, timeout=30)
        res.raise_for_status()
        return res.content

class OneDriveProvider(CloudStorageProvider):
    def upload_file(self, file_content: bytes, destination: str, credentials: str) -> str:
        token = _resolve_access_token(credentials)
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/octet-stream"
        }

        url = f"https://graph.microsoft.com/v1.0/me/drive/root:/{destination}:/content"

        res = requests.put(url, headers=headers, data=file_content, timeout=30)
        res.raise_for_status()

        return res.json().get("id", "uploaded")

    def download_file(self, source: str, credentials: str) -> bytes:
        token = _resolve_access_token(credentials)
        headers = {
            "Authorization": f"Bearer {token}"
        }
        url = f"https://graph.microsoft.com/v1.0/me/drive/items/{source}/content"

        res = requests.get(url, headers=headers, timeout=30)
        res.raise_for_status()
        return res.content

class AWSS3Provider(CloudStorageProvider):
    """
    Uses presigned URLs so backups can be stored on AWS S3 without embedding
    long-lived keys in the Hypervisor process.
    cloud_credentials JSON format:
    {
      "upload_url": "...",
      "download_url": "..."
    }
    """

    def upload_file(self, file_content: bytes, destination: str, credentials: str) -> str:
        parsed = _parse_credentials(credentials)
        if not isinstance(parsed, dict):
            raise ValueError("AWS S3 credentials must be a JSON object with upload_url")

        upload_url = parsed.get("upload_url")
        if not upload_url:
            raise ValueError("Missing upload_url for aws-s3 provider")

        headers = {"Content-Type": "application/octet-stream"}
        res = requests.put(upload_url, headers=headers, data=file_content, timeout=60)
        res.raise_for_status()

        return parsed.get("object_key", destination)

    def download_file(self, source: str, credentials: str) -> bytes:
        parsed = _parse_credentials(credentials)
        if not isinstance(parsed, dict):
            raise ValueError("AWS S3 credentials must be a JSON object with download_url")

        download_url = parsed.get("download_url")
        if not download_url:
            raise ValueError("Missing download_url for aws-s3 provider")

        res = requests.get(download_url, timeout=60)
        res.raise_for_status()
        return res.content

class MeshStoreProvider(CloudStorageProvider):
    """
    Decentralized storage provider backed by IPFS-compatible APIs.
    cloud_credentials can be plain token or JSON:
    {
      "api_url": "http://127.0.0.1:5001/api/v0",
      "api_key": "optional-basic-auth"
    }
    """

    def upload_file(self, file_content: bytes, destination: str, credentials: str) -> str:
        parsed = _parse_credentials(credentials)
        api_url = "http://127.0.0.1:5001/api/v0"
        api_key = ""
        if isinstance(parsed, dict):
            api_url = parsed.get("api_url", api_url).rstrip("/")
            api_key = parsed.get("api_key", "")
        elif isinstance(parsed, str):
            api_key = parsed

        headers = {}
        if api_key:
            headers["Authorization"] = f"Basic {api_key}"

        files = {"file": (destination, file_content, "application/octet-stream")}
        res = requests.post(f"{api_url}/add", headers=headers, files=files, timeout=60)
        res.raise_for_status()
        cid = res.json().get("Hash")
        if not cid:
            raise ValueError("MeshStore/IPFS upload did not return a CID")
        return cid

    def download_file(self, source: str, credentials: str) -> bytes:
        parsed = _parse_credentials(credentials)
        api_url = "http://127.0.0.1:5001/api/v0"
        api_key = ""
        if isinstance(parsed, dict):
            api_url = parsed.get("api_url", api_url).rstrip("/")
            api_key = parsed.get("api_key", "")
        elif isinstance(parsed, str):
            api_key = parsed

        headers = {}
        if api_key:
            headers["Authorization"] = f"Basic {api_key}"

        res = requests.post(f"{api_url}/cat", headers=headers, params={"arg": source}, timeout=60)
        res.raise_for_status()
        return res.content

class CloudStorageFactory:
    @staticmethod
    def get_provider(provider_name: str) -> CloudStorageProvider:
        key = provider_name.lower()
        if key in ("gdrive", "googledrive"):
            return GoogleDriveProvider()
        elif key == "onedrive":
            return OneDriveProvider()
        elif key in ("aws", "s3", "aws-s3"):
            return AWSS3Provider()
        elif key in ("meshstore", "ipfs", "decentralized"):
            return MeshStoreProvider()
        else:
            raise ValueError(f"Unknown cloud storage provider: {provider_name}")
