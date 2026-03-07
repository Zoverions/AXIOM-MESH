"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const normalizer_1 = require("../utils/normalizer");
const hypervisorClient_1 = require("../services/hypervisorClient");
const router = (0, express_1.Router)();
router.post('/api/v1/intent/process', async (req, res) => {
    try {
        const { channel, content, metadata } = req.body;
        if (!content) {
            res.status(400).json({ error: 'Content is required' });
            return;
        }
        const intent = (0, normalizer_1.normalizeInput)(channel || 'api', content, metadata);
        const response = await (0, hypervisorClient_1.sendToHypervisor)(intent);
        res.json(response);
    }
    catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.get('/health', (req, res) => {
    res.json({ status: 'ok', component: 'omni-gateway' });
});
exports.default = router;
//# sourceMappingURL=rest.js.map