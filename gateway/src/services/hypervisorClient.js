"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendToHypervisor = sendToHypervisor;
const axios_1 = __importDefault(require("axios"));
const types_1 = require("../types");
const HYPERVISOR_URL = process.env.HYPERVISOR_URL || 'http://localhost:8000';
async function sendToHypervisor(intent) {
    try {
        const response = await axios_1.default.post(`${HYPERVISOR_URL}/process`, intent);
        return response.data;
    }
    catch (error) {
        console.error('Error sending to Hypervisor:', error.message);
        return {
            id: 'err-' + Date.now(),
            intent_id: intent.id,
            response: `Hypervisor error: ${error.message}`,
            status: 'error'
        };
    }
}
//# sourceMappingURL=hypervisorClient.js.map