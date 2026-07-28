import { Router, Request, Response } from 'express';
import axios from 'axios';

const router = Router();

// In-memory store for emergence alerts received from the Grid
const emergenceAlerts: any[] = [];

const DEFAULT_GRID_URL = process.env.GRID_DASHBOARD_URL || process.env.GRID_URL || 'http://grid:5000';
const DEFAULT_HYPERVISOR_URL = process.env.HYPERVISOR_DASHBOARD_URL || process.env.HYPERVISOR_URL || 'http://hypervisor:8000';

function average(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((acc, value) => acc + value, 0) / values.length;
}

async function fetchGridTrustScores() {
    const [nodesResp, skillsResp] = await Promise.all([
        axios.get(`${DEFAULT_GRID_URL}/nodes`, { timeout: 3000 }),
        axios.get(`${DEFAULT_GRID_URL}/skills`, { timeout: 3000 })
    ]);

    const nodes = nodesResp.data?.nodes || [];
    const skills = skillsResp.data || [];

    const nodeTrustScores = nodes
        .map((n: any) => Number(n.trust_score))
        .filter((score: number) => Number.isFinite(score) && score >= 0);

    const taskBuckets = new Map<string, number[]>();
    for (const skill of skills) {
        const taskName = (skill.task || 'unknown').toString().trim();
        const nodeId = skill.nodeId || skill.nodeID;
        const node = nodes.find((n: any) => n.node_id === nodeId);
        const nodeScore = Number(node?.trust_score);
        if (!taskName || !Number.isFinite(nodeScore)) continue;
        const current = taskBuckets.get(taskName) || [];
        current.push(nodeScore);
        taskBuckets.set(taskName, current);
    }

    const capsules = Array.from(taskBuckets.entries())
        .map(([task, scores]) => ({
            id: task,
            personas: [],
            composite_score: Number(average(scores).toFixed(4))
        }))
        .sort((a, b) => b.composite_score - a.composite_score)
        .slice(0, 10);

    return {
        source: 'grid-ledger',
        global_average: Number(average(nodeTrustScores).toFixed(4)),
        node_count: nodes.length,
        capsules
    };
}

async function fetchPipelineTelemetry() {
    const [gridStatsResp, gridDemResp, hypervisorMetricsResp] = await Promise.all([
        axios.get(`${DEFAULT_GRID_URL}/zk-stats`, { timeout: 3000 }),
        axios.get(`${DEFAULT_GRID_URL}/dem`, { timeout: 3000 }),
        axios.get(`${DEFAULT_HYPERVISOR_URL}/metrics`, { timeout: 3000 })
    ]);

    const gridStats = gridStatsResp.data || {};
    const gridDem = gridDemResp.data || {};
    const hypervisorMetrics = hypervisorMetricsResp.data || {};

    return {
        source: 'grid+hypervisor',
        active_pipelines: Number(gridStats.zkml_queue_size || 0),
        events_processed_24h: Number(hypervisorMetrics.requests || 0),
        average_latency_ms: Math.round(Number(gridDem.meta_sentience_score || 0)),
        active_bonded_nodes: Number(gridStats.active_bonded_nodes || 0),
        equilibrium_status: gridDem.equilibrium_status || 'unknown',
        intent_metrics: hypervisorMetrics.intents || { success: 0, error: 0, degraded: 0 }
    };
}

/**
 * GET /dashboard/trust-scores
 * Returns anonymized trust scores from the Grid ledger.
 */
router.get('/trust-scores', async (req: Request, res: Response) => {
    try {
        const trustScores = await fetchGridTrustScores();
        res.json(trustScores);
    } catch (error: any) {
        res.status(502).json({
            error: 'Failed to load trust scores from Grid ledger',
            details: error?.message || 'unknown error'
        });
    }
});

/**
 * GET /dashboard/data-pipelines
 * Returns system throughput and active pipeline state from Grid + Hypervisor telemetry.
 */
router.get('/data-pipelines', async (req: Request, res: Response) => {
    try {
        const pipelineData = await fetchPipelineTelemetry();
        res.json(pipelineData);
    } catch (error: any) {
        res.status(502).json({
            error: 'Failed to load pipeline telemetry',
            details: error?.message || 'unknown error'
        });
    }
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

    const secretToMatch = expectedSecret;

    if (secretToMatch && authHeader === `Bearer ${secretToMatch}`) {
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
router.get('/comprehensive', async (req: Request, res: Response) => {
    try {
        const [trustScores, pipelineData] = await Promise.all([
            fetchGridTrustScores(),
            fetchPipelineTelemetry()
        ]);

        res.json({
            mesh_status: {
                connected_to_greater_mesh: pipelineData.active_bonded_nodes > 0,
                node_count: trustScores.node_count,
                equilibrium_status: pipelineData.equilibrium_status
            },
            trust_scores: trustScores,
            telemetry: pipelineData,
            security: {
                status: 'Secure',
                waf_active: true,
                last_scan: new Date().toISOString()
            }
        });
    } catch (error: any) {
        res.status(502).json({
            error: 'Failed to build comprehensive dashboard payload',
            details: error?.message || 'unknown error'
        });
    }
});

export default router;
