import React, { useEffect, useState, useRef } from 'react';
import { useApi, api } from '../hooks/useApi';

// Leaflet — מפה חיה
// npm install leaflet react-leaflet @types/leaflet

import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const FACTORY_LAT = 32.0750;
const FACTORY_LNG = 34.7775;

const STATUS_COLOR: Record<string, string> = {
  active: '#3DCC91',
  offline: '#5C7080',
  on_way: '#48AFF0',
  in_progress: '#FFA500',
};

function createIcon(color: string, name: string) {
  return L.divIcon({
    html: `
      <div style="
        background:${color};
        border:2px solid #fff;
        border-radius:50%;
        width:36px;height:36px;
        display:flex;align-items:center;justify-content:center;
        font-size:11px;font-weight:700;color:#fff;
        font-family:sans-serif;
        box-shadow:0 2px 8px rgba(0,0,0,0.5);
      ">
        ${name.charAt(0)}
      </div>
    `,
    className: '',
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
}

function factoryIcon() {
  return L.divIcon({
    html: `
      <div style="
        background:#FFA500;
        border:3px solid #fff;
        border-radius:4px;
        width:40px;height:40px;
        display:flex;align-items:center;justify-content:center;
        font-size:18px;
        box-shadow:0 2px 12px rgba(255,165,0,0.6);
      ">🏭</div>
    `,
    className: '',
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });
}

export function LiveMap() {
  const { data: locations, fetch } = useApi<any[]>('/api/gps/current');
  const { data: tasks, fetch: fetchTasks } = useApi<any[]>('/api/tasks');
  const [selected, setSelected] = useState<any | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [filter, setFilter] = useState<string>('all');
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    fetch();
    fetchTasks({ date: new Date().toISOString().slice(0, 10) });

    // Auto-refresh every 15 seconds
    intervalRef.current = setInterval(() => {
      fetch();
    }, 15000);

    return () => clearInterval(intervalRef.current);
  }, []);

  const fetchHistory = async (empId: string) => {
    try {
      const res = await api.get(`/api/gps/history/${empId}`);
      setHistory(res.data || []);
    } catch {
      setHistory([]);
    }
  };

  const active = (locations || []).filter(l =>
    filter === 'all' || l.department === filter || l.status === filter
  );

  const todayTasks = (tasks || []).filter(t => t.lat && t.lng);

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      {/* HEADER */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <h1 style={{ color: '#F6F7F9', fontSize: 18, fontWeight: 600, margin: 0 }}>מפה חיה</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#3DCC91', animation: 'pulse 2s infinite' }} />
          <span style={{ fontSize: 11, color: '#3DCC91' }}>LIVE · מתעדכן כל 15 שניות</span>
        </div>
        <div style={{ flex: 1 }} />

        {/* FILTERS */}
        {['all', 'production', 'installation'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? 'rgba(255,165,0,0.15)' : 'transparent',
            border: `1px solid ${filter === f ? '#FFA500' : 'rgba(255,255,255,0.1)'}`,
            color: filter === f ? '#FFA500' : '#ABB3BF',
            padding: '5px 12px', cursor: 'pointer', fontSize: 11
          }}>
            {({ all: 'הכל', production: 'מפעל', installation: 'מתקינים' } as any)[f]}
          </button>
        ))}
      </div>

      {/* STATS ROW */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12 }}>
        {[
          { label: 'בשטח', value: (locations || []).filter(l => l.status === 'active').length, color: '#3DCC91' },
          { label: 'משימות היום', value: (tasks || []).length, color: '#48AFF0' },
          { label: 'הושלמו', value: (tasks || []).filter(t => t.status === 'done').length, color: '#3DCC91' },
          { label: 'ממתינות', value: (tasks || []).filter(t => t.status === 'pending').length, color: '#FFB366' },
        ].map(s => (
          <div key={s.label} style={{ background: '#2F343C', border: '1px solid rgba(255,255,255,0.08)', borderTop: `2px solid ${s.color}`, padding: '10px 14px' }}>
            <div style={{ fontSize: 9, color: '#5C7080', letterSpacing: '0.12em', marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* MAP + SIDEBAR */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 8, height: 'calc(100vh - 280px)' }}>
        {/* MAP */}
        <div style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
          <MapContainer
            center={[FACTORY_LAT, FACTORY_LNG]}
            zoom={13}
            style={{ height: '100%', width: '100%' }}
          >
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              attribution='&copy; CartoDB'
            />

            {/* Factory marker */}
            <Marker position={[FACTORY_LAT, FACTORY_LNG]} icon={factoryIcon()}>
              <Popup>
                <div style={{ fontFamily: 'sans-serif', fontSize: 12 }}>
                  <strong>TECHNO-KOL — מפעל</strong><br />
                  המפעל הראשי
                </div>
              </Popup>
            </Marker>

            {/* Employee markers */}
            {active.map((emp: any) => (
              <Marker
                key={emp.employee_id}
                position={[parseFloat(emp.lat), parseFloat(emp.lng)]}
                icon={createIcon(
                  STATUS_COLOR[emp.task_status || emp.status] || '#5C7080',
                  emp.name
                )}
                eventHandlers={{
                  click: () => {
                    setSelected(emp);
                    fetchHistory(emp.employee_id);
                  }
                }}
              >
                <Popup>
                  <div style={{ fontFamily: 'sans-serif', fontSize: 12, minWidth: 160 }}>
                    <strong>{emp.name}</strong><br />
                    <span style={{ color: '#666' }}>{emp.role}</span><br />
                    {emp.current_task && <><strong>משימה:</strong> {emp.current_task}<br /></>}
                    {emp.task_address && <><strong>כתובת:</strong> {emp.task_address}<br /></>}
                    {emp.speed > 0 && <><strong>מהירות:</strong> {Math.round(emp.speed)} קמ"ש<br /></>}
                    {emp.battery_level && <><strong>סוללה:</strong> {emp.battery_level}%<br /></>}
                    <span style={{ color: '#999', fontSize: 10 }}>
                      לפני {Math.round(emp.seconds_ago / 60)} דק׳
                    </span>
                  </div>
                </Popup>
              </Marker>
            ))}

            {/* Task markers */}
            {todayTasks.map((task: any) => (
              <Circle
                key={task.id}
                center={[parseFloat(task.lat), parseFloat(task.lng)]}
                radius={80}
                pathOptions={{
                  color: task.status === 'done' ? '#3DCC91' : '#FFA500',
                  fillOpacity: 0.2,
                  weight: 2
                }}
              >
                <Popup>
                  <div style={{ fontFamily: 'sans-serif', fontSize: 12 }}>
                    <strong>{task.title}</strong><br />
                    {task.address}<br />
                    <span style={{ color: '#666' }}>{task.employee_name}</span>
                  </div>
                </Popup>
              </Circle>
            ))}

            {/* Selected employee trail */}
            {selected && history.length > 1 && (
              <Polyline
                positions={history.map((h: any) => [parseFloat(h.lat), parseFloat(h.lng)])}
                pathOptions={{ color: '#FFA500', weight: 2, opacity: 0.7, dashArray: '5 5' }}
              />
            )}
          </MapContainer>
        </div>

        {/* SIDEBAR */}
        <div style={{ background: '#2F343C', border: '1px solid rgba(255,255,255,0.08)', overflowY: 'auto' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)', background: '#383E47', fontSize: 10, color: '#ABB3BF', letterSpacing: '0.12em' }}>
            עובדים בשטח
          </div>

          {active.map((emp: any) => (
            <div
              key={emp.employee_id}
              onClick={() => { setSelected(emp); fetchHistory(emp.employee_id); }}
              style={{
                padding: '12px 14px',
                borderBottom: '1px solid rgba(255,255,255,0.04)',
                cursor: 'pointer',
                background: selected?.employee_id === emp.employee_id ? 'rgba(255,165,0,0.08)' : 'transparent'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%',
                  background: STATUS_COLOR[emp.status] || '#5C7080',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0
                }}>
                  {emp.name?.charAt(0)}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, color: '#F6F7F9', fontWeight: 500 }}>{emp.name}</div>
                  <div style={{ fontSize: 10, color: '#5C7080' }}>{emp.role}</div>
                </div>
                <div style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: emp.status === 'active' ? '#3DCC91' : '#5C7080'
                }} />
              </div>

              {emp.current_task && (
                <div style={{ fontSize: 10, color: '#FFA500', marginBottom: 2 }}>
                  📍 {emp.current_task}
                </div>
              )}

              <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
                {emp.speed > 0 && (
                  <span style={{ fontSize: 9, color: '#5C7080' }}>🚗 {Math.round(emp.speed)} קמ"ש</span>
                )}
                {emp.battery_level && (
                  <span style={{ fontSize: 9, color: emp.battery_level < 20 ? '#FC8585' : '#5C7080' }}>
                    🔋 {emp.battery_level}%
                  </span>
                )}
                <span style={{ fontSize: 9, color: '#3D4F6A' }}>
                  {Math.round((emp.seconds_ago || 0) / 60)} דק׳
                </span>
              </div>
            </div>
          ))}

          {/* TASKS TODAY */}
          <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)', borderTop: '1px solid rgba(255,255,255,0.08)', background: '#383E47', fontSize: 10, color: '#ABB3BF', letterSpacing: '0.12em', marginTop: 8 }}>
            משימות היום
          </div>

          {(tasks || []).map((task: any) => (
            <div key={task.id} style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: 11, color: '#F6F7F9', fontWeight: 500 }}>{task.title}</span>
                <span style={{
                  fontSize: 9,
                  color: task.status === 'done' ? '#3DCC91' : task.status === 'in_progress' ? '#FFA500' : '#5C7080',
                  border: `1px solid ${task.status === 'done' ? '#3DCC9140' : task.status === 'in_progress' ? '#FFA50040' : 'rgba(255,255,255,0.1)'}`,
                  padding: '1px 5px'
                }}>
                  {({ pending: 'ממתין', on_way: 'בדרך', arrived: 'הגיע', in_progress: 'בביצוע', done: 'הושלם' } as any)[task.status] || task.status}
                </span>
              </div>
              <div style={{ fontSize: 10, color: '#5C7080' }}>{task.employee_name} · {task.address}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
