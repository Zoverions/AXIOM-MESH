from typing import Dict, Any, Optional

class RoutingEngine:
    """
    Lightweight Routing Engine that uses a gossip-based "compute auction" logic.
    It compares an intent's resource hints against local and peer Capability Manifests
    to decide whether to execute locally or delegate.
    """
    def __init__(self, local_manifest: Dict[str, Any]):
        self.local_manifest = local_manifest

    def evaluate_route(self, intent_hints: Dict[str, Any], peer_manifests: Dict[str, Dict[str, Any]]) -> str:
        """
        Determines the best node to handle the intent based on capability manifests.
        Returns the node ID of the chosen peer, or 'local' if it should be executed locally.
        """
        if not intent_hints:
            return "local"

        required_services = intent_hints.get("required_services", [])
        min_inf_s = intent_hints.get("min_inf_s", 0)

        # Helper to check if a manifest satisfies the hints
        def satisfies(manifest: Dict[str, Any]) -> bool:
            services = manifest.get("services", [])
            if any(req not in services for req in required_services):
                return False

            benchmarks = manifest.get("benchmarks", {})
            inf_s = benchmarks.get("inf/s", 0)
            if inf_s < min_inf_s:
                return False

            return True

        # Always prefer local execution if we satisfy the requirements
        if satisfies(self.local_manifest):
            return "local"

        # Otherwise, find the best peer using a compute auction score
        # Score = (inf/s) * 0.4 + (mem_bandwidth_gb_s) * 0.4 + (staked_bonds) * 0.2
        best_peer = None
        best_score = -1

        for peer_id, manifest in peer_manifests.items():
            if satisfies(manifest):
                benchmarks = manifest.get("benchmarks", {})
                inf_s = benchmarks.get("inf/s", 0)
                mem_bw = benchmarks.get("mem_bandwidth_gb_s", 0)
                stake = benchmarks.get("staked_bonds", 100) # Mock default stake if absent

                score = (inf_s * 0.4) + (mem_bw * 0.4) + (stake * 0.2)
                if score > best_score:
                    best_peer = peer_id
                    best_score = score

        if best_peer:
            return best_peer

        # If no one strictly satisfies, default to local
        # (graceful degradation, edge proxy, or quantization fallback will handle it)
        return "local"

    def evaluate_route_with_address(self, intent_hints: Dict[str, Any], peer_manifests: Dict[str, Dict[str, Any]]) -> tuple[str, Optional[str]]:
        """
        Evaluates the best route and also returns the peer's address.
        """
        route = self.evaluate_route(intent_hints, peer_manifests)
        if route == "local":
            return "local", None

        # We assume the address is part of the manifest metadata or we deduce it
        # In this implementation we will look for an explicit "address" field or default to localhost
        addr = peer_manifests.get(route, {}).get("address", "localhost")
        return route, addr

class PredictivePrefetcher:
    """
    Distilled decision tree proxy that predicts required context based on intent text.
    In a real environment, this might be an ONNX model. Here we simulate a distilled tree.
    """
    def predict(self, intent_text: str) -> list:
        # Simple heuristic mapping representing a distilled decision tree
        text = intent_text.lower()
        prefetch_urls = []
        if "zkml" in text or "proof" in text:
            prefetch_urls.append("ipfs://zkml-trusted-setup")
        if "graph" in text or "network" in text:
            prefetch_urls.append("grid://global-graph-index")
        if "sandbox" in text or "execute" in text:
            prefetch_urls.append("local://sandbox-warmup")

        return prefetch_urls

    async def execute_prefetch(self, network_sync, intent_text: str):
        urls = self.predict(intent_text)
        for url in urls:
            try:
                if url.startswith("grid://") or url.startswith("ipfs://"):
                    # Mock prefetch for grid/ipfs resources
                    pass
                elif url.startswith("local://"):
                    # Mock prefetch for local resources
                    pass
                else:
                    await network_sync.fetch_web_cache(url)
            except Exception as e:
                # Log but do not crash the intent processing on prefetch failure
                print(f"[Prefetcher] Failed to prefetch {url}: {e}")
