import uvicorn
import os

if __name__ == "__main__":
    port = int(os.environ.get("HYPERVISOR_PORT", 8000))
    uvicorn.run("src.api.server:app", host="0.0.0.0", port=port, reload=True)
