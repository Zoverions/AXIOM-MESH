import { Router, Request, Response } from 'express';

const router = Router();

// Mock store for testing gateway endpoints.
// In a full implementation, this interacts with FoundersCouncil.sol and Grid/Hypervisor metrics.
const MOCK_ROLES = [
    { id: 0, name: 'Economics', requiredReputationType: 0 },
    { id: 1, name: 'Security', requiredReputationType: 1 },
    { id: 2, name: 'Education', requiredReputationType: 2 }
];

const MOCK_MEMBERS = [
    { roleId: 0, humanMember: '0x1c2cbabf75e1938ed2f2c59e734e83aa5fbe1b73', aiAgent: '0xAgent001' },
    { roleId: 1, humanMember: '0xSecur1tyExperT', aiAgent: '0xAgent002' }
];

const MOCK_PHASES = {
    0: 'FounderControl',
    1: 'FoundersCouncil',
    2: 'Subcommittees',
    3: 'NationStateGuilds'
};

let currentPhaseId = 0; // Default to FounderControl

/**
 * GET /api/v1/council/roles
 * Fetches the list of active Founders Council roles.
 */
router.get('/roles', (req: Request, res: Response) => {
    res.json({ roles: MOCK_ROLES });
});

/**
 * GET /api/v1/council/members
 * Fetches the currently assigned members of the Founders Council.
 */
router.get('/members', (req: Request, res: Response) => {
    res.json({ members: MOCK_MEMBERS });
});

/**
 * GET /api/v1/council/recommendations/:roleId
 * Requests the system for candidate recommendations based on SoulboundReputation and system metrics.
 */
router.get('/recommendations/:roleId', (req: Request, res: Response) => {
    const roleId = parseInt(req.params.roleId as string, 10);
    const role = MOCK_ROLES.find(r => r.id === roleId);

    if (!role) {
        return res.status(404).json({ error: 'Role not found' });
    }

    // Mock recommendation logic
    const recommendations = [
        {
            candidateAddress: '0xCand1dateA',
            score: 950,
            domain: role.name
        },
        {
            candidateAddress: '0xCand1dateB',
            score: 820,
            domain: role.name
        }
    ];

    res.json({ recommendations });
});

/**
 * GET /api/v1/council/phase
 * Gets the current governance phase.
 */
router.get('/phase', (req: Request, res: Response) => {
    res.json({ phaseId: currentPhaseId, phaseName: MOCK_PHASES[currentPhaseId as keyof typeof MOCK_PHASES] });
});

/**
 * POST /api/v1/council/transition
 * "Flips the switch" to transition governance to the Founders Council (or subsequent phases).
 */
router.post('/transition', (req: Request, res: Response) => {
    // In production, this requires Founder authentication and calling `transitionToFoundersCouncil` on GovernanceTransition.sol

    // Check if we can transition
    if (currentPhaseId >= 3) {
         return res.status(400).json({ error: 'Already at final governance phase' });
    }

    currentPhaseId++;
    res.json({
        message: 'Successfully transitioned governance phase',
        newPhaseId: currentPhaseId,
        newPhaseName: MOCK_PHASES[currentPhaseId as keyof typeof MOCK_PHASES]
    });
});

export default router;
