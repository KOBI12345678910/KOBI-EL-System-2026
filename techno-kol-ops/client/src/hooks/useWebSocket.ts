import { useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';
import { WS_URL } from '../utils/format';

export function useWebSocket() {
  const { token, setWsConnected, setSnapshot, addAlert } = useStore();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout>>();

  function connect() {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(`${WS_URL}?token=${token}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsConnected(true);
      console.log('WS connected');
    };

    ws.onmessage = (event) => {
      try {
        const { type, payload } = JSON.parse(event.data);
        switch (type) {
          case 'FACTORY_SNAPSHOT':
            useStore.getState().setSnapshot(payload);
            break;
          case 'ALERT_CREATED':
            addAlert(payload);
            break;
          case 'ORDER_UPDATED':
            // handled by individual pages via refetch
            break;
        }
      } catch {}
    };

    ws.onclose = () => {
      setWsConnected(false);
      // Auto-reconnect after 3s
      reconnectRef.current = setTimeout(connect, 3000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }

  useEffect(() => {
    if (token) connect();
    return () => {
      wsRef.current?.close();
      clearTimeout(reconnectRef.current);
    };
  }, [token]);
}
