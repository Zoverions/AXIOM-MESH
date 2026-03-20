# ResourceBalancer Policy

## Overview
The ResourceBalancer is a core routing node in the Hypervisor's execution graph (currently implemented in `hypervisor/src/graph/autoresearch_graph.py`). Its primary function is to dynamically route computational tasks to the most appropriate execution environment based on task complexity, required security, and intent. It ensures that resources are allocated efficiently while maintaining the rigorous security guarantees of the AXIOM-MESH network.

## Routing Heuristics
The policy evaluates the user or agent intent to determine the optimal execution path. The current decision matrix is as follows:

1.  **Local (Default):**
    *   **Intent Keywords:** N/A (Fallback)
    *   **Priority Tag:** `normal`
    *   **Use Case:** Standard, low-complexity tasks that do not require distributed consensus or high security. Executed within the local sandbox.

2.  **Peer (P2P):**
    *   **Intent Keywords:** `peer`, `offload`
    *   **Priority Tag:** `low`
    *   **Use Case:** Tasks that can be offloaded to trusted peers within the MCP compatibility matrix. Used for parallelizing workloads or accessing distributed knowledge without the overhead of full Grid consensus.

3.  **Grid (Consensus):**
    *   **Intent Keywords:** `consensus`, `grid`
    *   **Priority Tag:** `high`
    *   **Use Case:** Tasks requiring zero-knowledge proofs (zkML), Proof-of-Execution-Result (PoER) validation, or updates to the distributed knowledge graph. This path leverages bonded nodes and enforces strict verification.

4.  **L1 (Settlement):**
    *   **Intent Keywords:** `settle`, `l1`
    *   **Priority Tag:** `critical`
    *   **Use Case:** High-value transactions, permanent state anchors, or cross-chain operations (e.g., via CCIP). This is the most secure but also the most expensive execution path.

## Cost-Benefit Evaluation Criteria
When determining the routing decision, the ResourceBalancer considers the following factors:
*   **Security vs. Speed:** Grid and L1 paths offer high security (zk-proofs, immutable ledgers) but incur higher latency and token costs. Local and Peer paths are faster but rely on local sandboxing and peer trust (MCP profiles).
*   **Treasury Implications:** Routing to the Grid or L1 automatically triggers treasury split calculations, ensuring that network security and wealth generation pools are funded appropriately from the transaction costs.
*   **Hardware Profile:** The decision also factors in the local hardware capabilities (e.g., 'edge', 'full_node'). Devices with lower capabilities will naturally bias towards Peer or Grid routing for complex tasks.
