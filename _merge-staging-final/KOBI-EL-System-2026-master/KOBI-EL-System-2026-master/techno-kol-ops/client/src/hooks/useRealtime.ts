/**
 * useRealtime — WebSocket hook with exponential backoff reconnect
 * Events: 'notification', 'alert', 'work_order_update', 'project_update', 'snapshot_update'
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { useStore } from '../store/useStore';
import { WS_URL } from '../utils/format';

type EventHandler = (data: any) => void;

// Module-level event handler registry (shared across hook instances)
const eventHandlers = new Map<string, Set<EventHandler>>();

function dispatchEvent(event: string, data: any) {
  eventHandlers.get(event)?.forEach(h => {
    try { h(data); } catch {}
  });
  // wildcard
  eventHandlers.get('*')?.forEach(h => {
    try { h({ event, data }); } catch {}
  });
}

// Singleton WS manager so only one connection is ever open
let sharedWs: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let backoffDelay = 1000; // ms — doubles on each failure, max 30s
let isConnecting = false;
const connectedListeners = new Set<(connected: boolean) => void>();

function notifyConnected(connected: boolean) {
  connectedListeners.forEach(fn => fn(connected));
}

function connectWs(token: string | null) {
  if (isConnecting) return;
  if (sharedWs?.readyState === WebSocket.OPEN) return;

  isConnecting = true;
  const url = `${WS_URL}?token=${token ?? ''}`;
  const ws = new WebSocket(url);
  sharedWs = ws;

  ws.onopen = () => {
    isConnecting = false;
    backoffDelay = 1000; // reset backoff on success
    notifyConnected(true);
  };

  ws.onmessage = (event) => {
    try {
      const { type, payload } = JSON.parse(event.data);
      // Map server event names to hook event names
      const eventMap: Record<string, string> = {
        FACTORY_SNAPSHOT:  'snapshot_update',
        ALERT_CREATED:     'alert',
        ORDER_UPDATED:     'work_order_update',
        PROJECT_UPDATED:   'project_update',
        NOTIFICATION:      'notification',
        // also support lowercase / new naming directly
        snapshot_update:   'snapshot_update',
        alert:             'alert',
        work_order_update: 'work_order_update',
        project_update:    'project_update',
        notification:      'notification',
      };
      const mapped = eventMap[type] ?? type;
      dispatchEvent(mapped, payload);
    } catch {}
  };

  ws.onclose = () => {
    isConnecting = false;
    notifyConnected(false);
    sharedWs = null;
    // Exponential backoff: 1s → 2s → 4s → 8s → max 30s
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      backoffDelay = Math.min(backoffDelay * 2, 30000);
      connectWs(token);
    }, backoffDelay);
  };

  ws.onerror = () => {
    ws.close();
  };
}

export function useRealtime() {
  const { token } = useStore();
  const [connected, setConnected] = useState(sharedWs?.readyState === WebSocket.OPEN);
  const [lastEvent, setLastEvent] = useState<any>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const listener = (c: boolean) => {
      if (mountedRef.current) setConnected(c);
    };
    connectedListeners.add(listener);

    // Start connection if not already alive
    if (!sharedWs || sharedWs.readyState === WebSocket.CLOSED || sharedWs.readyState === WebSocket.CLOSING) {
      backoffDelay = 1000;
      connectWs(token);
    }

    return () => {
      mountedRef.current = false;
      connectedListeners.delete(listener);
    };
  }, [token]);

  const subscribe = useCallback((event: string, handler: EventHandler) => {
    if (!eventHandlers.has(event)) eventHandlers.set(event, new Set());
    eventHandlers.get(event)!.add(handler);
    return () => {
      eventHandlers.get(event)?.delete(handler);
    };
  }, []);

  return { connected, lastEvent, subscribe };
}

/**
 * Convenience hook — subscribe to a single event type.
 * Handler is stable-ified via ref so callers don't need useCallback.
 */
export function useRealtimeEvent(event: string, handler: EventHandler) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const stable = (data: any) => handlerRef.current(data);
    if (!eventHandlers.has(event)) eventHandlers.set(event, new Set());
    eventHandlers.get(event)!.add(stable);
    return () => {
      eventHandlers.get(event)?.delete(stable);
    };
  }, [event]);
}
