import { WebSocket, WebSocketServer } from "ws";
import type { Server } from "http";
import type { AgentEvent } from "../agent/core";

export type WebSocketBroadcast = (data: Record<string, any>) => void;

export class AgentWebSocket {
  private wss: WebSocketServer;
  private clients: Set<WebSocket> = new Set();

  constructor(server: Server) {
    this.wss = new WebSocketServer({ server, path: "/ws" });

    this.wss.on("connection", (ws: WebSocket) => {
      this.clients.add(ws);
      console.log(`[WS] Client connected (${this.clients.size} total)`);

      ws.on("close", () => {
        this.clients.delete(ws);
        console.log(`[WS] Client disconnected (${this.clients.size} total)`);
      });

      ws.on("error", () => {
        this.clients.delete(ws);
      });

      ws.send(JSON.stringify({ type: "connected", message: "קובי Agent מחובר", timestamp: new Date() }));
    });
  }

  broadcast(event: AgentEvent | Record<string, any>) {
    const data = JSON.stringify(event);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        try { client.send(data); } catch {}
      }
    }
  }

  getClientCount(): number {
    return this.clients.size;
  }
}

let instance: AgentWebSocket | null = null;

export function initWebSocket(server: Server): AgentWebSocket {
  instance = new AgentWebSocket(server);
  return instance;
}

export function broadcast(data: Record<string, any>): void {
  if (instance) instance.broadcast(data);
}

export function getClientCount(): number {
  return instance ? instance.getClientCount() : 0;
}