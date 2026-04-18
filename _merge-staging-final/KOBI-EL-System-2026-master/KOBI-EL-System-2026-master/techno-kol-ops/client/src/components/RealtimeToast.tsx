import React, { useEffect, useState } from 'react';
import { useStore } from '../store/useStore';

interface Toast {
  id: string;
  type: 'success' | 'warning' | 'danger' | 'info';
  title: string;
  message?: string;
  timestamp: Date;
}

const COLORS = {
  success: '#3DCC91',
  warning: '#FFB366',
  danger: '#FC8585',
  info: '#48AFF0'
};

let toastQueue: ((t: Toast) => void)[] = [];
export function addToast(toast: Omit<Toast, 'id' | 'timestamp'>) {
  const t = { ...toast, id: Math.random().toString(36).slice(2), timestamp: new Date() };
  toastQueue.forEach(fn => fn(t));
}

export function RealtimeToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const { snapshot } = useStore();

  useEffect(() => {
    const handler = (t: Toast) => {
      setToasts(prev => [t, ...prev.slice(0, 4)]);
      setTimeout(() => {
        setToasts(prev => prev.filter(x => x.id !== t.id));
      }, 5000);
    };
    toastQueue.push(handler);
    return () => { toastQueue = toastQueue.filter(f => f !== handler); };
  }, []);

  // הפעל toasts על אירועי WebSocket
  useEffect(() => {
    if (!snapshot) return;
    // Triggered by brain updates
  }, [snapshot]);

  if (toasts.length === 0) return null;

  return (
    <div style={{
      position: 'fixed', bottom: 20, left: 20,
      display: 'flex', flexDirection: 'column-reverse',
      gap: 8, zIndex: 9999
    }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          background: '#2F343C',
          border: `1px solid ${COLORS[t.type]}40`,
          borderRight: `3px solid ${COLORS[t.type]}`,
          padding: '10px 16px',
          minWidth: 280,
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          animation: 'slideIn 0.2s ease'
        }}>
          <div style={{ fontSize: 12, color: COLORS[t.type], fontWeight: 600, marginBottom: 2 }}>
            {t.title}
          </div>
          {t.message && (
            <div style={{ fontSize: 11, color: '#ABB3BF' }}>{t.message}</div>
          )}
          <div style={{ fontSize: 9, color: '#3D4F6A', marginTop: 4 }}>
            {t.timestamp.toLocaleTimeString('he-IL')}
          </div>
        </div>
      ))}
      <style>{`
        @keyframes slideIn {
          from { transform: translateX(-100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
