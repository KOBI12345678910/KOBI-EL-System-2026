"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.whatsappBot = void 0;
// Re-export the whatsappBot from services to the /ai namespace for route imports
var whatsappBot_1 = require("../services/whatsappBot");
Object.defineProperty(exports, "whatsappBot", { enumerable: true, get: function () { return whatsappBot_1.whatsappBot; } });
