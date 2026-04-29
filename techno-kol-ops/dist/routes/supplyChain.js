"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const supplyChainIntelligence_1 = require("../ai/supplyChainIntelligence");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
// Full dashboard — single call, all 9 metrics computed from REAL data
router.get('/dashboard', async (req, res) => {
    try {
        const [suppliers, eoq, bottlenecks, leadTime, stockoutRisk, abc, carryingCost, turnover, deadStock,] = await Promise.all([
            supplyChainIntelligence_1.supplyChainIntelligence.scoreSuppliers(),
            supplyChainIntelligence_1.supplyChainIntelligence.computeEOQ(),
            supplyChainIntelligence_1.supplyChainIntelligence.detectBottlenecks(),
            supplyChainIntelligence_1.supplyChainIntelligence.leadTimeVariance(),
            supplyChainIntelligence_1.supplyChainIntelligence.stockoutRisk(),
            supplyChainIntelligence_1.supplyChainIntelligence.abcAnalysis(),
            supplyChainIntelligence_1.supplyChainIntelligence.carryingCost(),
            supplyChainIntelligence_1.supplyChainIntelligence.inventoryTurnover(),
            supplyChainIntelligence_1.supplyChainIntelligence.deadStock(90),
        ]);
        res.json({
            suppliers, eoq, bottlenecks, leadTime, stockoutRisk,
            abc, carryingCost, turnover, deadStock,
            generatedAt: new Date().toISOString(),
        });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
router.get('/suppliers', async (_req, res) => {
    try {
        res.json(await supplyChainIntelligence_1.supplyChainIntelligence.scoreSuppliers());
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
router.get('/eoq', async (_req, res) => {
    try {
        res.json(await supplyChainIntelligence_1.supplyChainIntelligence.computeEOQ());
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
router.get('/bottlenecks', async (_req, res) => {
    try {
        res.json(await supplyChainIntelligence_1.supplyChainIntelligence.detectBottlenecks());
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
router.get('/lead-time', async (_req, res) => {
    try {
        res.json(await supplyChainIntelligence_1.supplyChainIntelligence.leadTimeVariance());
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
router.get('/stockout-risk', async (_req, res) => {
    try {
        res.json(await supplyChainIntelligence_1.supplyChainIntelligence.stockoutRisk());
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
router.get('/abc', async (_req, res) => {
    try {
        res.json(await supplyChainIntelligence_1.supplyChainIntelligence.abcAnalysis());
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
router.get('/carrying-cost', async (_req, res) => {
    try {
        res.json(await supplyChainIntelligence_1.supplyChainIntelligence.carryingCost());
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
router.get('/turnover', async (_req, res) => {
    try {
        res.json(await supplyChainIntelligence_1.supplyChainIntelligence.inventoryTurnover());
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
router.get('/dead-stock', async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 90;
        res.json(await supplyChainIntelligence_1.supplyChainIntelligence.deadStock(days));
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.default = router;
