import { useEffect, useCallback } from 'react';
import { useStore } from '../store/useStore';

type EventHandler = (payload: any) => void;
const handlers = new Map<string, Set<EventHandler>>();

export function useRealtimeEvent(event: string, handler: EventHandler) {
  useEffect(() => {
    if (!handlers.has(event)) handlers.set(event, new Set());
    handlers.get(event)!.add(handler);

    return () => {
      handlers.get(event)?.delete(handler);
    };
  }, [event, handler]);
}

// גלובלי — מאזין לכל האירועים מה-WebSocket
export function setupRealtimeRouter(ws: WebSocket) {
  ws.onmessage = (event) => {
    try {
      const { type, payload } = JSON.parse(event.data);

      // הפעל handlers רשומים
      if (handlers.has(type)) {
        handlers.get(type)!.forEach(h => h(payload));
      }

      // handlers גלובליים
      if (handlers.has('*')) {
        handlers.get('*')!.forEach(h => h({ type, payload }));
      }
    } catch {}
  };
}
