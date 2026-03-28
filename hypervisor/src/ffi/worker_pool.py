"""
M15.1 - Python Hypervisor Async-first redesign with multiprocessing worker pool
to overcome GIL limitations for CPU-bound tasks.
"""
import asyncio
import multiprocessing as mp
from concurrent.futures import ProcessPoolExecutor, ThreadPoolExecutor
from typing import Any, Callable, Coroutine, Dict, List, Optional
import os
import time
import logging

logger = logging.getLogger(__name__)


class WorkerPool:
    """
    Hybrid worker pool that uses:
    - ProcessPoolExecutor for CPU-bound tasks (bypasses GIL)
    - ThreadPoolExecutor for I/O-bound tasks
    - asyncio for async-native operations
    """
    
    def __init__(
        self,
        cpu_workers: Optional[int] = None,
        io_workers: Optional[int] = None,
        max_tasks_per_worker: int = 1000,
    ):
        self.cpu_workers = cpu_workers or max(1, mp.cpu_count() - 1)
        self.io_workers = io_workers or min(32, max(1, mp.cpu_count() * 4))
        self.max_tasks_per_worker = max_tasks_per_worker
        
        self._cpu_executor: Optional[ProcessPoolExecutor] = None
        self._io_executor: Optional[ThreadPoolExecutor] = None
        self._task_counter = 0
        self._lock = mp.Lock() if mp.get_start_method() == 'fork' else None
        
    def start(self):
        """Initialize executor pools"""
        self._cpu_executor = ProcessPoolExecutor(
            max_workers=self.cpu_workers,
            mp_context=mp.get_context('spawn')
        )
        self._io_executor = ThreadPoolExecutor(
            max_workers=self.io_workers
        )
        logger.info(f"WorkerPool started: {self.cpu_workers} CPU workers, {self.io_workers} IO workers")
        
    def shutdown(self, wait: bool = True):
        """Shutdown executor pools"""
        if self._cpu_executor:
            self._cpu_executor.shutdown(wait=wait)
        if self._io_executor:
            self._io_executor.shutdown(wait=wait)
        logger.info("WorkerPool shutdown complete")
        
    async def submit_cpu_task(
        self,
        func: Callable,
        *args,
        timeout: Optional[float] = None,
        **kwargs
    ) -> Any:
        """Submit CPU-bound task to process pool (bypasses GIL)"""
        if not self._cpu_executor:
            raise RuntimeError("WorkerPool not started")
            
        loop = asyncio.get_event_loop()
        self._task_counter += 1
        
        try:
            future = self._cpu_executor.submit(func, *args, **kwargs)
            result = await asyncio.wait_for(
                loop.run_in_executor(None, future.result),
                timeout=timeout
            )
            return result
        except asyncio.TimeoutError:
            future.cancel()
            logger.warning(f"CPU task timed out after {timeout}s")
            raise
        except Exception as e:
            logger.error(f"CPU task failed: {e}")
            raise
            
    async def submit_io_task(
        self,
        func: Callable,
        *args,
        timeout: Optional[float] = None,
        **kwargs
    ) -> Any:
        """Submit I/O-bound task to thread pool"""
        if not self._io_executor:
            raise RuntimeError("WorkerPool not started")
            
        loop = asyncio.get_event_loop()
        self._task_counter += 1
        
        try:
            result = await asyncio.wait_for(
                loop.run_in_executor(self._io_executor, func, *args, **kwargs),
                timeout=timeout
            )
            return result
        except asyncio.TimeoutError:
            logger.warning(f"IO task timed out after {timeout}s")
            raise
        except Exception as e:
            logger.error(f"IO task failed: {e}")
            raise
            
    def get_stats(self) -> Dict[str, Any]:
        """Get worker pool statistics"""
        return {
            "cpu_workers": self.cpu_workers,
            "io_workers": self.io_workers,
            "tasks_processed": self._task_counter,
            "max_tasks_per_worker": self.max_tasks_per_worker,
        }


class RustFFIBridge:
    """
    Bridge to Rust FFI bindings via pyo3 for GIL-free native execution.
    Falls back to pure Python if Rust module not available.
    """
    
    def __init__(self):
        self._rust_module = None
        self._load_rust_module()
        
    def _load_rust_module(self):
        """Attempt to load compiled Rust FFI module"""
        try:
            # Try to import the compiled Rust extension
            from hypervisor import rust_extension as rust_mod
            self._rust_module = rust_mod
            logger.info("Rust FFI module loaded successfully")
        except ImportError:
            logger.warning("Rust FFI module not available, using Python fallback")
            self._rust_module = None
            
    def compute_hash(self, data: bytes) -> str:
        """Compute hash using Rust if available, else Python fallback"""
        if self._rust_module:
            return self._rust_module.compute_hash(data)
        # Fallback to Python hashlib
        import hashlib
        return hashlib.sha256(data).hexdigest()
        
    def verify_signature(self, message: bytes, signature: bytes, public_key: bytes) -> bool:
        """Verify cryptographic signature using Rust if available"""
        if self._rust_module:
            return self._rust_module.verify_signature(message, signature, public_key)
        # Fallback - would need proper implementation
        logger.warning("Signature verification requires Rust FFI module")
        return False
        
    def encrypt_payload(self, plaintext: bytes, key: bytes) -> bytes:
        """Encrypt payload using Rust crypto if available"""
        if self._rust_module:
            return self._rust_module.encrypt_payload(plaintext, key)
        # Fallback - basic XOR for demo (use proper crypto in production)
        import os
        nonce = os.urandom(12)
        return nonce + bytes(a ^ b for a, b in zip(plaintext, key * (len(plaintext) // len(key) + 1)))
        
    def decrypt_payload(self, ciphertext: bytes, key: bytes) -> bytes:
        """Decrypt payload using Rust crypto if available"""
        if self._rust_module:
            return self._rust_module.decrypt_payload(ciphertext, key)
        # Fallback - basic XOR for demo
        nonce = ciphertext[:12]
        encrypted = ciphertext[12:]
        return bytes(a ^ b for a, b in zip(encrypted, key * (len(encrypted) // len(key) + 1)))
        
    def get_performance_stats(self) -> Dict[str, Any]:
        """Get Rust FFI performance metrics"""
        if self._rust_module and hasattr(self._rust_module, 'get_stats'):
            return self._rust_module.get_stats()
        return {
            "rust_available": self._rust_module is not None,
            "mode": "rust" if self._rust_module else "python_fallback"
        }


# Global instances
_worker_pool: Optional[WorkerPool] = None
_rust_bridge: Optional[RustFFIBridge] = None


def get_worker_pool() -> WorkerPool:
    """Get or create global worker pool instance"""
    global _worker_pool
    if _worker_pool is None:
        _worker_pool = WorkerPool()
        _worker_pool.start()
    return _worker_pool


def get_rust_bridge() -> RustFFIBridge:
    """Get or create global Rust FFI bridge instance"""
    global _rust_bridge
    if _rust_bridge is None:
        _rust_bridge = RustFFIBridge()
    return _rust_bridge


async def parallel_map(
    func: Callable,
    items: List[Any],
    use_processes: bool = True,
    chunk_size: int = 100,
) -> List[Any]:
    """
    Execute function in parallel across multiple items.
    Uses processes for CPU-bound, threads for I/O-bound.
    """
    pool = get_worker_pool()
    results = []
    
    if use_processes:
        # Submit all tasks concurrently
        tasks = [
            pool.submit_cpu_task(func, item)
            for item in items
        ]
    else:
        tasks = [
            pool.submit_io_task(func, item)
            for item in items
        ]
    
    results = await asyncio.gather(*tasks, return_exceptions=True)
    
    # Handle exceptions
    processed_results = []
    for i, result in enumerate(results):
        if isinstance(result, Exception):
            logger.error(f"Task {i} failed: {result}")
            processed_results.append(None)
        else:
            processed_results.append(result)
            
    return processed_results


# Example CPU-bound computation for testing
def heavy_computation(data: bytes, iterations: int = 1000000) -> str:
    """Example CPU-intensive task that benefits from multiprocess execution"""
    import hashlib
    result = data
    for _ in range(iterations):
        result = hashlib.sha256(result).digest()
    return result.hex()


if __name__ == "__main__":
    # Test the worker pool
    import asyncio
    
    async def test():
        pool = get_worker_pool()
        
        # Test CPU-bound task
        data = b"test_data"
        result = await pool.submit_cpu_task(heavy_computation, data, 100000)
        print(f"CPU task result: {result[:16]}...")
        
        # Test Rust FFI
        bridge = get_rust_bridge()
        hash_result = bridge.compute_hash(b"test")
        print(f"Hash result: {hash_result}")
        
        # Test parallel map
        items = [f"data_{i}".encode() for i in range(10)]
        results = await parallel_map(heavy_computation, items, iterations=10000)
        print(f"Parallel results: {len(results)} items processed")
        
        pool.shutdown()
        
    asyncio.run(test())
