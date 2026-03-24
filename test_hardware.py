import sys
sys.path.append('.')
import time
from hypervisor.src.evolution.hardware import HardwareScanner
hs = HardwareScanner()
start = time.time()
print(hs.generate_capability_manifest())
print(f"Time taken: {time.time() - start:.2f}s")
