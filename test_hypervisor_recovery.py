import os
from hypervisor.src.recovery.bundle_manager import RecoveryBundleManager

# Test RecoveryBundleManager
os.environ["WALLET_SEED"] = "test_seed"
os.environ["SWARM_ID"] = "test_swarm"
os.environ["RECOVERY_KEY"] = b"wL_kK8G8uC7vA3dI9eR1sY5mQ3hU7vC8jX3wL5kG7sA=".decode() # dummy valid fernet key

manager = RecoveryBundleManager()
cid = manager.create_bundle("test_node")
print(f"Bundle CID: {cid}")
