import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import jwt from 'jsonwebtoken';

interface Client {
  ws: WebSocket;
  userId: string;
  rooms: Set<string>;
}

const clients = new Map<string, Client>();

export function initWebSocket(server: Server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url!, `http://${req.headers.host}`);
    const token = url.searchParams.get('token');

    let userId = 'anonymous';
    try {
      if (token) {
        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
        userId = decoded.id;
      }
    } catch {}

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
      } catch {}
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

export function broadcast(room: string, event: string, payload: any) {
  const message = JSON.stringify({
    type: event,
    payload,
    timestamp: new Date().toISOString()
  });

  clients.forEach((client) => {
    if (client.rooms.has(room) && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(message);
    }
  });
}

export function broadcastToAll(event: string, payload: any) {
  broadcast('global', event, payload);
}

export function getConnectedCount() {
  return clients.size;
}
