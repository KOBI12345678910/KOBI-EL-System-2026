"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.aipRouter = void 0;
// ── aip.ts
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const aipEngine_1 = require("../aip/aipEngine");
const aipRouter = (0, express_1.Router)();
exports.aipRouter = aipRouter;
aipRouter.use(auth_1.authenticate);
aipRouter.post('/query', async (req, res) => {
    try {
        const response = await aipEngine_1.aipEngine.query({
            question: req.body.question,
            context: req.body.context,
            user_id: req.user?.id
        });
        res.json(response);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
aipRouter.get('/suggestions', async (req, res) => {
    res.json({
        suggestions: [
            'כמה הכנסות הייתה לנו החודש?',
            'מה מצב המלאי עכשיו?',
            'איזה הזמנות מאוחרות?',
            'מי בשטח עכשיו?',
            'מה תחזית החודש הבא?',
            'מי הלקוח הגדול ביותר?',
            'כמה עובדים חולים היום?',
            'מה הרווח הגולמי שלנו?',
            'איזה חומרים הולכים להיגמר?',
            'מה ביצועי הצוות החודש?'
        ]
    });
});
