"use strict";
// ── Bridge barrel export ──────────────────────────────────────
// BUG-07 fix: techno-kol-ops ↔ procurement & AI integration
// ───────────────────────────────────────────────────────────────
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDefaultAiClient = exports.AiBridgeClient = exports.getDefaultProcurementClient = exports.ProcurementBridgeClient = void 0;
var procurement_bridge_1 = require("./procurement-bridge");
Object.defineProperty(exports, "ProcurementBridgeClient", { enumerable: true, get: function () { return procurement_bridge_1.ProcurementBridgeClient; } });
Object.defineProperty(exports, "getDefaultProcurementClient", { enumerable: true, get: function () { return procurement_bridge_1.getDefaultProcurementClient; } });
var ai_bridge_1 = require("./ai-bridge");
Object.defineProperty(exports, "AiBridgeClient", { enumerable: true, get: function () { return ai_bridge_1.AiBridgeClient; } });
Object.defineProperty(exports, "getDefaultAiClient", { enumerable: true, get: function () { return ai_bridge_1.getDefaultAiClient; } });
