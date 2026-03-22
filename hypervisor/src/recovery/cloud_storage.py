import requests
import json
import base64
from typing import Dict, Any, Optional

class CloudStorageProvider:
    def upload_file(self, file_content: bytes, destination: str, credentials: str) -> str:
        raise NotImplementedError

    def download_file(self, source: str, credentials: str) -> bytes:
        raise NotImplementedError

class GoogleDriveProvider(CloudStorageProvider):
    def upload_file(self, file_content: bytes, destination: str, credentials: str) -> str:
        headers = {
            "Authorization": f"Bearer {credentials}"
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
        headers = {
            "Authorization": f"Bearer {credentials}"
        }
        url = f"https://www.googleapis.com/drive/v3/files/{source}?alt=media"

        res = requests.get(url, headers=headers, timeout=30)
        res.raise_for_status()
        return res.content

class OneDriveProvider(CloudStorageProvider):
    def upload_file(self, file_content: bytes, destination: str, credentials: str) -> str:
        headers = {
            "Authorization": f"Bearer {credentials}",
            "Content-Type": "application/octet-stream"
        }

        url = f"https://graph.microsoft.com/v1.0/me/drive/root:/{destination}:/content"

        res = requests.put(url, headers=headers, data=file_content, timeout=30)
        res.raise_for_status()

        return res.json().get("id", "uploaded")

    def download_file(self, source: str, credentials: str) -> bytes:
        headers = {
            "Authorization": f"Bearer {credentials}"
        }
        url = f"https://graph.microsoft.com/v1.0/me/drive/items/{source}/content"

        res = requests.get(url, headers=headers, timeout=30)
        res.raise_for_status()
        return res.content

class CloudStorageFactory:
    @staticmethod
    def get_provider(provider_name: str) -> CloudStorageProvider:
        if provider_name.lower() == "gdrive":
            return GoogleDriveProvider()
        elif provider_name.lower() == "onedrive":
            return OneDriveProvider()
        else:
            raise ValueError(f"Unknown cloud storage provider: {provider_name}")
