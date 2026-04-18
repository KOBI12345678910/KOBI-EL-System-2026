"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const brainEngine_1 = require("../ai/brainEngine");
const connection_1 = require("../db/connection");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
// GET מצב המוח
router.get('/state', async (req, res) => {
    try {
        const cycle = await brainEngine_1.brainEngine.runFullCycle();
        res.json(cycle);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// GET דוח אחרון
router.get('/report/latest', async (req, res) => {
    try {
        const { rows } = await (0, connection_1.query)(`SELECT * FROM brain_reports ORDER BY created_at DESC LIMIT 1`);
        res.json(rows[0]?.report_data || {});
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// GET היסטוריית החלטות
router.get('/decisions', async (req, res) => {
    try {
        const { rows } = await (0, connection_1.query)(`SELECT * FROM brain_decisions ORDER BY created_at DESC LIMIT 50`);
        res.json(rows);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// GET יומן למידה
router.get('/learning', async (req, res) => {
    try {
        const { rows } = await (0, connection_1.query)(`SELECT * FROM brain_learning_log ORDER BY created_at DESC LIMIT 30`);
        res.json(rows);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// POST הפעל מחזור ידנית
router.post('/run', async (req, res) => {
    try {
        const result = await brainEngine_1.brainEngine.runFullCycle();
        res.json(result);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// GET בריפינג בוקר
router.get('/briefing/morning', async (req, res) => {
    try {
        const briefing = await brainEngine_1.brainEngine.sendDailyBriefing();
        res.json(briefing);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// GET agenda
router.get('/agenda', async (req, res) => {
    try {
        const agenda = await brainEngine_1.brainEngine.buildDailyAgenda();
        res.json(agenda);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// GET goals status
router.get('/goals', async (req, res) => {
    try {
        const goals = await brainEngine_1.brainEngine.getGoalsStatus();
        res.json(goals);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.default = router;
