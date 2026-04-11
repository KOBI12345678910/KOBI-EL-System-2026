import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { useStore } from './store/useStore';
import { useWebSocket } from './hooks/useWebSocket';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './pages/Dashboard';
import { WorkOrders } from './pages/WorkOrders';
import { ProductionFloor } from './pages/ProductionFloor';
import { Materials } from './pages/Materials';
import { Employees } from './pages/Employees';
import { Clients } from './pages/Clients';
import { Finance } from './pages/Finance';
import { AlertCenter } from './pages/AlertCenter';
import { Pipeline } from './pages/Pipeline';
import { LiveMap } from './pages/LiveMap';
import { MobileApp } from './pages/MobileApp';
import { Intelligence } from './pages/Intelligence';
import { SupplyChain } from './pages/SupplyChain';

function Layout() {
  useWebSocket();
  const { sidebarOpen } = useStore();

  return (
    <div style={{ background: '#252A31', minHeight: '100vh', direction: 'rtl' }}>
      <Navbar />
      <Sidebar />
      <div style={{
        marginTop: 48,
        marginRight: sidebarOpen ? 240 : 0,
        padding: 16,
        minHeight: 'calc(100vh - 48px)',
        transition: 'margin-right 0.2s'
      }}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/intelligence" element={<Intelligence />} />
          <Route path="/supply-chain" element={<SupplyChain />} />
          <Route path="/work-orders" element={<WorkOrders />} />
          <Route path="/production" element={<ProductionFloor />} />
          <Route path="/pipeline" element={<Pipeline />} />
          <Route path="/map" element={<LiveMap />} />
          <Route path="/materials" element={<Materials />} />
          <Route path="/employees" element={<Employees />} />
          <Route path="/clients" element={<Clients />} />
          <Route path="/finance" element={<Finance />} />
          <Route path="/alerts" element={<AlertCenter />} />
          <Route path="/mobile" element={<MobileApp />} />
        </Routes>
      </div>
    </div>
  );
}

function Login() {
  const { setAuth } = useStore();
  const [form, setForm] = React.useState({ username: '', password: '' });
  const [error, setError] = React.useState('');

  const handleLogin = async () => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      const data = await res.json();
      if (data.token) setAuth(data.token, data.user);
      else setError(data.error || 'שגיאה');
    } catch {
      setError('שגיאת התחברות');
    }
  };

  return (
    <div style={{
      background: '#1C2127', minHeight: '100vh', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', direction: 'rtl'
    }}>
      <div style={{ background: '#2F343C', border: '1px solid rgba(255,255,255,0.1)', padding: 40, width: 360 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32 }}>
          <div style={{ width: 12, height: 12, background: '#FFA500' }} />
          <span style={{ color: '#F6F7F9', fontSize: 16, fontWeight: 700, letterSpacing: '0.1em' }}>TECHNO-KOL OPS</span>
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 10, color: '#5C7080', display: 'block', marginBottom: 5, letterSpacing: '0.12em' }}>שם משתמש</label>
          <input
            value={form.username}
            onChange={e => setForm(p => ({ ...p, username: e.target.value }))}
            style={{ width: '100%', background: '#383E47', border: '1px solid rgba(255,255,255,0.1)', color: '#F6F7F9', padding: '9px 12px', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
          />
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 10, color: '#5C7080', display: 'block', marginBottom: 5, letterSpacing: '0.12em' }}>סיסמה</label>
          <input
            type="password"
            value={form.password}
            onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            style={{ width: '100%', background: '#383E47', border: '1px solid rgba(255,255,255,0.1)', color: '#F6F7F9', padding: '9px 12px', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
          />
        </div>
        {error && <div style={{ color: '#FC8585', fontSize: 11, marginBottom: 12 }}>{error}</div>}
        <button
          onClick={handleLogin}
          style={{ width: '100%', background: 'rgba(255,165,0,0.15)', border: '1px solid #FFA500', color: '#FFA500', padding: '10px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
        >
          כניסה למערכת
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const { token } = useStore();
  return token ? <Layout /> : <Login />;
}
