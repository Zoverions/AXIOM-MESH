import { Router, Request, Response } from 'express';

const router = Router();

// In-memory store for emergence alerts received from the Grid
const emergenceAlerts: any[] = [];

/**
 * GET /dashboard/trust-scores
 * Returns anonymized trust scores for top capsules and specific personas.
 */
router.get('/trust-scores', (req: Request, res: Response) => {
    // Mock Data for now, should eventually index from Grid or Hypervisor
    const trustScores = {
        global_average: 0.92,
        capsules: [
            {
                id: "education_tome_v1",
                personas: [
                    { name: "psychologist", score: 0.95 },
                    { name: "guidance_counselor", score: 0.88 },
                    { name: "subject_expert", score: 0.99 }
                ],
                composite_score: 0.94
            },
            {
                id: "physics_research_v2",
                personas: [],
                composite_score: 0.98
            }
        ]
    };

    res.json(trustScores);
});

/**
 * GET /dashboard/data-pipelines
 * Returns system throughput and active pipeline state (anonymized).
 */
router.get('/data-pipelines', (req: Request, res: Response) => {
    const pipelineData = {
        active_pipelines: 42,
        events_processed_24h: 1045000,
        average_latency_ms: 124,
        top_regions: ["us-east", "eu-central", "ap-southeast"]
    };

    res.json(pipelineData);
});


/**
 * Internal auth middleware to secure ingestion endpoints
 */
const internalAuth = (req: Request, res: Response, next: Function) => {
    const authHeader = req.headers['authorization'];
    const expectedSecret = process.env.GATEWAY_INTERNAL_SECRET;

    // In production, require the secret to be explicitly set
    if (!expectedSecret && process.env.NODE_ENV === 'production') {
        res.status(500).json({ error: "Internal Configuration Error: GATEWAY_INTERNAL_SECRET missing" });
        return;
    }

    const secretToMatch = expectedSecret || "internal-dev-secret-1234";

    if (authHeader === `Bearer ${secretToMatch}`) {
        next();
    } else {
        res.status(403).json({ error: "Forbidden: Invalid internal secret" });
    }
};

/**
 * POST /dashboard/alerts/ingest

 * Internal route for Grid to push emergence alerts to the gateway dashboard
 */
router.post('/alerts/ingest', internalAuth, (req: Request, res: Response) => {
    const alert = req.body;
    if (alert && alert.alert_id) {
        emergenceAlerts.push(alert);
        // Keep only the latest 100 alerts
        if (emergenceAlerts.length > 100) {
            emergenceAlerts.shift();
        }
        res.json({ status: "ingested" });
    } else {
        res.status(400).json({ error: "Invalid alert format" });
    }
});

/**
 * GET /dashboard/alerts/emergence
 * Returns anonymized emergence alerts for coalition anomaly signatures.
 */
router.get('/alerts/emergence', (req: Request, res: Response) => {
    // Return live alerts ingested from Grid, fallback to a sample if empty
    if (emergenceAlerts.length > 0) {
        res.json(emergenceAlerts);
    } else {
        res.json([
            {
                alert_id: "sample-alert-000",
                intent_ids: ["intent-sample"],
                coalition_signature_hash: "0x00000000...",
                severity: "info",
                recommended_action: "none"
            }
        ]);
    }
});

/**
 * GET /dashboard/comprehensive
 * Returns comprehensive system data for the new dashboard interface.
 */
router.get('/comprehensive', (req: Request, res: Response) => {
    res.json({
        mesh_status: {
            connected_to_greater_mesh: true,
            private_nodes: [
                { id: 'node-alpha-1', status: 'active', role: 'validator', ip: '10.0.0.1', latency: '12ms' },
                { id: 'node-beta-2', status: 'active', role: 'compute', ip: '10.0.0.2', latency: '45ms' },
                { id: 'node-gamma-3', status: 'standby', role: 'storage', ip: '10.0.0.3', latency: '8ms' }
            ]
        },
        security: {
            status: 'Secure',
            waf_active: true,
            threat_level: 'Low',
            last_scan: new Date().toISOString()
        },
        models: {
            local: ['llama3-8b-instruct', 'mistral-7b', 'phi-3-mini'],
            remote: ['gpt-4o', 'claude-3-5-sonnet', 'axiom-reasoning-v1']
        },
        assets: {
            nfts: ['Citizenship-001', 'Founder-042', 'Compute-Bond-11'],
            entities: ['psychologist_agent', 'physics_research_v2', 'defi_trader']
        },
        governance: {
            system: 'First-Past-The-Post (FPTP)',
            template: 'Canada',
            current_election_status: 'Upcoming',
            representatives: 338
        }
    });
});

export default router;
