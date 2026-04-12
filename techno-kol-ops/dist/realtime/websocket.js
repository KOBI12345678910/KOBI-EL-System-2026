"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initWebSocket = initWebSocket;
exports.broadcast = broadcast;
exports.broadcastToAll = broadcastToAll;
exports.getConnectedCount = getConnectedCount;
const ws_1 = require("ws");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const clients = new Map();
function initWebSocket(server) {
    const wss = new ws_1.WebSocketServer({ server, path: '/ws' });
    wss.on('connection', (ws, req) => {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const token = url.searchParams.get('token');
        let userId = 'anonymous';
        try {
            if (token) {
                const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET);
                userId = decoded.id;
            }
        }
        catch { }
        const clientId = `${userId}_${Date.now()}`;
        clients.set(clientId, { ws, userId, rooms: new Set(['global']) });
        ws.send(JSON.stringify({
            type: 'CONNECTED',
            payload: { clientId, timestamp: new Date().toISOString() }
        }));
        ws.on('message', (data) => {
            try {
                const msg = JSON.parse(data.toString());
                if (msg.type === 'JOIN_ROOM') {
                    clients.get(clientId)?.rooms.add(msg.room);
                }
                if (msg.type === 'LEAVE_ROOM') {
                    clients.get(clientId)?.rooms.delete(msg.room);
                }
            }
            catch { }
        });
        ws.on('close', () => {
            clients.delete(clientId);
        });
        ws.on('error', () => {
            clients.delete(clientId);
        });
    });
    return wss;
}
function broadcast(room, event, payload) {
    const message = JSON.stringify({
        type: event,
        payload,
        timestamp: new Date().toISOString()
    });
    clients.forEach((client) => {
        if (client.rooms.has(room) && client.ws.readyState === ws_1.WebSocket.OPEN) {
            client.ws.send(message);
        }
    });
}
function broadcastToAll(event, payload) {
    broadcast('global', event, payload);
}
function getConnectedCount() {
    return clients.size;
}
