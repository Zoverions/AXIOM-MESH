"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeInput = normalizeInput;
const types_1 = require("../types");
const uuid_1 = require("uuid"); // need to install uuid
function normalizeInput(channel, content, metadata = {}) {
    return {
        id: (0, uuid_1.v4)(),
        channel,
        content,
        metadata,
        timestamp: Date.now()
    };
}
//# sourceMappingURL=normalizer.js.map