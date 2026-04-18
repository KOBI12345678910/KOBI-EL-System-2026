import React from 'react';
import { useStore } from '../store/useStore';
import { formatCurrency } from '../utils/format';

export function Navbar() {
  const { wsConnected, snapshot, user, logout, setSidebarOpen, sidebarOpen } = useStore();

  return (
    <nav style={{
      height: 48,
      background: '#1C2127',
      borderBottom: '2px solid #FFA500',
      display: 'flex',
      alignItems: 'center',
      padding: '0 16px',
      gap: 16,
      position: 'fixed',
      top: 0, left: 0, right: 0,
      zIndex: 100,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    }}>
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        style={{ background: 'none', border: 'none', color: '#ABB3BF', cursor: 'pointer', fontSize: 18, padding: '0 4px' }}
      >
        ☰
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 8, height: 8, background: '#FFA500', borderRadius: 1 }} />
        <span style={{ color: '#F6F7F9', fontWeight: 600, fontSize: 14, letterSpacing: '0.05em' }}>
          TECHNO-KOL
        </span>
        <span style={{ color: '#ABB3BF', fontSize: 11 }}>OPS CENTER</span>
      </div>

      <div style={{ flex: 1 }} />

      {snapshot && (
        <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
          <Stat label="הכנסה חודשית" value={formatCurrency(snapshot.monthlyRevenue)} color="#3DCC91" />
          <Stat label="הזמנות פעילות" value={String(snapshot.activeOrders.length)} color="#FFA500" />
          <Stat
            label="אזהרות"
            value={String(snapshot.openAlerts.filter(a => !a.is_resolved).length)}
            color={snapshot.openAlerts.filter(a => !a.is_resolved).length > 0 ? '#FC8585' : '#3DCC91'}
          />
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{
          width: 8, height: 8, borderRadius: '50%',
          background: wsConnected ? '#3DCC91' : '#FC8585',
          boxShadow: wsConnected ? '0 0 6px #3DCC91' : 'none'
        }} />
        <span style={{ fontSize: 10, color: '#ABB3BF' }}>
          {wsConnected ? 'LIVE' : 'OFFLINE'}
        </span>
      </div>

      <div style={{ color: '#ABB3BF', fontSize: 12 }}>{user?.username}</div>
      <button
        onClick={logout}
        style={{ background: 'none', border: '1px solid #383E47', color: '#ABB3BF', padding: '4px 10px', cursor: 'pointer', fontSize: 11 }}
      >
        יציאה
      </button>
    </nav>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 9, color: '#ABB3BF', letterSpacing: '0.1em', marginBottom: 1 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  );
}
