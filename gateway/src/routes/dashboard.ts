import { Router, Request, Response } from 'express';

const router = Router();

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

export default router;
