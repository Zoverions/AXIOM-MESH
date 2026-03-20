from src.evolution.routing import RoutingEngine, PredictivePrefetcher

def test_routing_engine_local_preference():
    local_manifest = {
        "tier": "mid",
        "services": ["proxy", "sandbox-exec"],
        "benchmarks": {"inf/s": 5.0, "mem_bandwidth_gb_s": 10.0}
    }
    engine = RoutingEngine(local_manifest)

    hints = {"required_services": ["sandbox-exec"], "min_inf_s": 2.0}
    peer_manifests = {
        "node_1": {"services": ["sandbox-exec"], "benchmarks": {"inf/s": 10.0}}
    }
    # Local satisfies, should prefer local
    assert engine.evaluate_route(hints, peer_manifests) == "local"

def test_routing_engine_delegation():
    local_manifest = {
        "tier": "edge",
        "services": ["proxy"],
        "benchmarks": {"inf/s": 1.0, "mem_bandwidth_gb_s": 2.0}
    }
    engine = RoutingEngine(local_manifest)

    hints = {"required_services": ["zkml-gen"], "min_inf_s": 5.0}
    peer_manifests = {
        "node_1": {"services": ["sandbox-exec"], "benchmarks": {"inf/s": 10.0}},
        "node_2": {"services": ["zkml-gen", "proxy"], "benchmarks": {"inf/s": 12.0, "mem_bandwidth_gb_s": 50.0}},
        "node_3": {"services": ["zkml-gen"], "benchmarks": {"inf/s": 8.0, "mem_bandwidth_gb_s": 20.0}}
    }

    # Local fails, node_2 has highest auction score
    assert engine.evaluate_route(hints, peer_manifests) == "node_2"

def test_prefetcher():
    prefetcher = PredictivePrefetcher()
    assert "ipfs://zkml-trusted-setup" in prefetcher.predict("generate zkml proof")
    assert "grid://global-graph-index" in prefetcher.predict("query the global graph")
    assert "local://sandbox-warmup" in prefetcher.predict("execute code in sandbox")
