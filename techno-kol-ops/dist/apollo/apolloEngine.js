"use strict";
// ════════════════════════════════════════════════════════════
//
//   TECHNO-KOL APOLLO ENGINE
//   שכבת הפריסה — סנכרון, גרסאות, deployment
//
// ════════════════════════════════════════════════════════════
Object.defineProperty(exports, "__esModule", { value: true });
exports.apolloEngine = void 0;
const connection_1 = require("../db/connection");
const websocket_1 = require("../realtime/websocket");
exports.apolloEngine = {
    targets: [
        { name: 'מפעל — ראשי', type: 'factory_floor', last_sync: new Date(), status: 'online', version: '2.0.0' },
        { name: 'אפליקציית שטח', type: 'mobile', last_sync: new Date(), status: 'online', version: '2.0.0' },
        { name: 'משרד ניהול', type: 'office', last_sync: new Date(), status: 'online', version: '2.0.0' },
        { name: 'גיבוי ענן', type: 'cloud', last_sync: new Date(), status: 'online', version: '2.0.0' },
    ],
    // גרסה נוכחית
    currentVersion: '2.0.0',
    // Push עדכון לכל הסביבות
    async pushUpdate(data, targets = ['all']) {
        const affectedTargets = targets[0] === 'all'
            ? this.targets
            : this.targets.filter(t => targets.includes(t.name));
        for (const target of affectedTargets) {
            target.status = 'syncing';
            (0, websocket_1.broadcastToAll)('APOLLO_SYNC', {
                target: target.name,
                status: 'syncing',
                data_type: data.type
            });
            // סמולציה — בפרודקשן: WebSocket push / REST API
            await new Promise(r => setTimeout(r, 50));
            target.status = 'online';
            target.last_sync = new Date();
            (0, websocket_1.broadcastToAll)('APOLLO_SYNC', {
                target: target.name,
                status: 'online',
                synced_at: new Date().toISOString()
            });
        }
        await (0, connection_1.query)(`
      INSERT INTO apollo_deployments (version, targets, data_type, deployed_at)
      VALUES ($1, $2, $3, NOW())
    `, [this.currentVersion, JSON.stringify(targets), data.type]).catch(() => { });
    },
    // בדיקת בריאות כל הסביבות
    async healthCheck() {
        const results = this.targets.map(t => ({
            name: t.name,
            type: t.type,
            status: t.status,
            last_sync: t.last_sync,
            version: t.version,
            lag_seconds: Math.floor((Date.now() - t.last_sync.getTime()) / 1000)
        }));
        (0, websocket_1.broadcastToAll)('APOLLO_HEALTH', { targets: results });
        return results;
    },
    // sync נתון ספציפי לכל הסביבות
    async syncEntity(entityType, entityId, data) {
        await this.pushUpdate({ type: `entity_update:${entityType}`, id: entityId, data });
    }
};
