/**
 * useRealtime — WebSocket hook for payroll-autonomous
 * Connects to techno-kol-ops WS at ws://localhost:3200/ws
 * Auto-reconnects with exponential backoff: 1s, 2s, 4s, 8s … max 30s
 * Events: 'notification', 'alert', 'work_order_update', 'project_update', 'snapshot_update'
 */
import { useEffect, useRef, useState, useCallback } from 'react';

type EventHandler = (data: any) => void;

const WS_URL =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_WS_URL) ||
  'ws://localhost:3200/ws';

// Module-level event handler registry
const eventHandlers = new Map<string, Set<EventHandler>>();

function dispatchEvent(event: string, data: any) {
  eventHandlers.get(event)?.forEach(h => { try { h(data); } catch {} });
  eventHandlers.get('*')?.forEach(h => { try { h({ event, data }); } catch {} });
}

// Singleton WS state
let sharedWs: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let backoffDelay = 1000;
let isConnecting = false;
const connectedListeners = new Set<(connected: boolean) => void>();

function notifyConnected(connected: boolean) {
  connectedListeners.forEach(fn => fn(connected));
}

const EVENT_MAP: Record<string, string> = {
  FACTORY_SNAPSHOT:  'snapshot_update',
  ALERT_CREATED:     'alert',
  ORDER_UPDATED:     'work_order_update',
  PROJECT_UPDATED:   'project_update',
  NOTIFICATION:      'notification',
  snapshot_update:   'snapshot_update',
  alert:             'alert',
  work_order_update: 'work_order_update',
  project_update:    'project_update',
  notification:      'notification',
};

function connectWs() {
  if (isConnecting) return;
  if (sharedWs?.readyState === WebSocket.OPEN) return;

  isConnecting = true;
  const ws = new WebSocket(WS_URL);
  sharedWs = ws;

  ws.onopen = () => {
    isConnecting = false;
    backoffDelay = 1000;
    notifyConnected(true);
  };

  ws.onmessage = (event) => {
    try {
      const { type, payload } = JSON.parse(event.data);
      const mapped = EVENT_MAP[type] ?? type;
      dispatchEvent(mapped, payload);
    } catch {}
  };

  ws.onclose = () => {
    isConnecting = false;
    notifyConnected(false);
    sharedWs = null;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      backoffDelay = Math.min(backoffDelay * 2, 30000);
      connectWs();
    }, backoffDelay);
  };

  ws.onerror = () => { ws.close(); };
}

export function useRealtime() {
  const [connected, setConnected] = useState(sharedWs?.readyState === WebSocket.OPEN);
  const [lastEvent, setLastEvent] = useState<any>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const listener = (c: boolean) => { if (mountedRef.current) setConnected(c); };
    connectedListeners.add(listener);

    if (!sharedWs || sharedWs.readyState === WebSocket.CLOSED || sharedWs.readyState === WebSocket.CLOSING) {
      backoffDelay = 1000;
      connectWs();
    }

    return () => {
      mountedRef.current = false;
      connectedListeners.delete(listener);
    };
  }, []);

  const subscribe = useCallback((event: string, handler: EventHandler) => {
    if (!eventHandlers.has(event)) eventHandlers.set(event, new Set());
    eventHandlers.get(event)!.add(handler);
    return () => { eventHandlers.get(event)?.delete(handler); };
  }, []);

  return { connected, lastEvent, subscribe };
}

export function useRealtimeEvent(event: string, handler: EventHandler) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const stable = (data: any) => handlerRef.current(data);
    if (!eventHandlers.has(event)) eventHandlers.set(event, new Set());
    eventHandlers.get(event)!.add(stable);
    return () => { eventHandlers.get(event)?.delete(stable); };
  }, [event]);
}
