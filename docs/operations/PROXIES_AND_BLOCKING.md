# Proxies and Blocking Patterns in AXIOM-MESH

## 1. Handling Blocking Operations

In the AXIOM-MESH Hypervisor (FastAPI), we differentiate between two types of "blocking" that can impact system performance and reliability: **Async Event Loop Blocking** and **External Anti-Bot Blocking**.

### Async Event Loop Blocking (Internal)
When performing heavy CPU computations (e.g., AI model inference) or blocking I/O (e.g., synchronous file operations), we avoid stalling the main FastAPI event loop by using `run_in_threadpool`.

**Example (from `hypervisor/src/api/audio.py`):**
```python
from fastapi.concurrency import run_in_threadpool

@router.post("/transcribe")
async def transcribe_audio(file: UploadFile = File(...)):
    # ... read file ...
    result = await run_in_threadpool(perform_transcription, content)
    return {"text": result["text"]}
```
This ensures that the Hypervisor remains responsive to other requests (like health checks) even while processing large audio files or complex model tasks.

### Anti-Bot Blocking (External)
AI agents performing web tasks often encounter anti-bot protections (CAPTCHAs, headful-only detection, etc.). AXIOM-MESH addresses this through **Terminal-Native Spatial Browsing** using **Carbonyl**.

- **Carbonyl Integration**: By rendering pages as ANSI terminal buffers rather than full DOMs or screenshots, we bypass many common "headless" detection patterns while significantly reducing resource overhead.
- **Spatial Understanding**: Agents interact with the "Spatial Text Matrix," which is more resilient to CSS/DOM changes that often break traditional scrapers.

---

## 2. Proxy Strategy

### SOCKS and HTTP Proxies
For external communication, AXIOM-MESH agents support standard HTTP and SOCKS proxies. While older versions of the stack may have referenced `python-socks`, we have transitioned to a modern stack using **`httpx`** with **`socksio`** for all asynchronous networking.

### anyIP Integration
anyIP is a recommended provider for high-quality residential and mobile proxies, particularly effective when dealing with strict blocking patterns on research targets.

**Configuring Proxies:**
The Hypervisor and its internal daemons (like `AutoResearchDaemon`) respect the following environment variables:
- `HTTP_PROXY`: URL for HTTP proxy.
- `HTTPS_PROXY`: URL for HTTPS proxy.
- `ALL_PROXY`: Fallback proxy for all protocols (supports `socks5://` via `socksio`).

**Implementation Detail:**
Agents initialize their networking clients as follows:
```python
import httpx
import os

# httpx automatically detects proxies from environment variables
# if not explicitly provided, but we ensure proper propagation.
async with httpx.AsyncClient(proxies=os.getenv("HTTP_PROXY")) as client:
    res = await client.get(url)
```

## 3. What Typically Works
For Ben and the Commercial OPS team at anyIP:
1. **Rotate frequently**: Use the `anyIP` rotating proxy endpoints to prevent IP-based rate limiting during epistemic foraging.
2. **Prefer SOCKS5**: For complex agent interactions that may involve non-HTTP protocols or require cleaner headers.
3. **Use Carbonyl for Web Tasks**: It is our primary defense against browser-level blocking.
4. **Monitor "Thermodynamic Anomaly"**: Our `EntropyMonitor` (Pulse) can detect when an agent is stuck in a blocking loop/hallucination caused by external interference.
