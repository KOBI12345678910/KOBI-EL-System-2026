"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const intelligenceEngine_1 = require("../ai/intelligenceEngine");
const qualityControl_1 = require("../ai/qualityControl");
const whatsappBot_1 = require("../ai/whatsappBot");
const router = (0, express_1.Router)();
// ── DASHBOARD KPIs
router.get('/kpis', auth_1.authenticate, async (req, res) => {
    try {
        res.json(await intelligenceEngine_1.intelligenceEngine.getRealtimeKPIs());
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ── AUTO QUOTE
router.post('/quote', auth_1.authenticate, async (req, res) => {
    try {
        res.json(await intelligenceEngine_1.intelligenceEngine.generateQuote(req.body));
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ── ANOMALIES
router.get('/anomalies', auth_1.authenticate, async (req, res) => {
    try {
        res.json(await intelligenceEngine_1.intelligenceEngine.detectAnomalies());
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ── REVENUE FORECAST
router.get('/forecast/revenue', auth_1.authenticate, async (req, res) => {
    try {
        res.json(await intelligenceEngine_1.intelligenceEngine.forecastRevenue());
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ── MATERIAL FORECAST
router.get('/forecast/materials', auth_1.authenticate, async (req, res) => {
    try {
        res.json(await intelligenceEngine_1.intelligenceEngine.forecastMaterials());
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ── EMPLOYEE ROI
router.get('/roi/employees', auth_1.authenticate, async (req, res) => {
    try {
        res.json(await intelligenceEngine_1.intelligenceEngine.employeeROI());
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ── CLIENT SCORING
router.get('/scoring/clients', auth_1.authenticate, async (req, res) => {
    try {
        res.json(await intelligenceEngine_1.intelligenceEngine.clientScoring());
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ── CASH FLOW FORECAST
router.get('/cashflow', auth_1.authenticate, async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 30;
        res.json(await intelligenceEngine_1.intelligenceEngine.cashFlowForecast(days));
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ── SCHEDULE OPTIMIZATION
router.get('/optimize/schedule', auth_1.authenticate, async (req, res) => {
    try {
        const date = req.query.date || new Date().toISOString().slice(0, 10);
        res.json(await intelligenceEngine_1.intelligenceEngine.optimizeSchedule(date));
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ── QUALITY CHECKLIST
router.get('/quality/checklist', auth_1.authenticate, async (req, res) => {
    try {
        const { stage, category } = req.query;
        const checklist = qualityControl_1.qualityEngine.getQualityChecklist(stage, category);
        res.json({ checklist });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ── WHATSAPP WEBHOOK (Twilio) — public (no auth)
router.post('/whatsapp/webhook', async (req, res) => {
    try {
        const { From, Body } = req.body;
        const reply = await whatsappBot_1.whatsappBot.handleIncoming(From, Body);
        res.set('Content-Type', 'text/xml');
        res.send(`<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  <Message>${reply}</Message>\n</Response>`);
    }
    catch (err) {
        res.set('Content-Type', 'text/xml');
        res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>שגיאה במערכת. נסה שוב.</Message></Response>`);
    }
});
exports.default = router;
