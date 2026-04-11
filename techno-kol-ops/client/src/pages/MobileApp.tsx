import React, { useEffect, useState, useRef } from 'react';
import { api } from '../hooks/useApi';
import { useStore } from '../store/useStore';

// זו האפליקציה שהעובד בשטח רואה בנייד

export function MobileApp() {
  const { user } = useStore();
  const [tasks, setTasks] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [tracking, setTracking] = useState(false);
  const [battery, setBattery] = useState<number | null>(null);
  const watchRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  // LOAD TASKS
  useEffect(() => {
    loadTasks();
    loadMessages();

    // Get battery level
    (navigator as any).getBattery?.().then((b: any) => {
      setBattery(Math.round(b.level * 100));
      b.addEventListener('levelchange', () => setBattery(Math.round(b.level * 100)));
    });
  }, []);

  const loadTasks = async () => {
    const today = new Date().toISOString().slice(0, 10);
    const res = await api.get(`/api/tasks?employee_id=${user?.employee_id}&date=${today}`);
    setTasks(res.data);
  };

  const loadMessages = async () => {
    const res = await api.get(`/api/messages/${user?.employee_id}`);
    setMessages(res.data);
  };

  // START GPS TRACKING
  const startTracking = () => {
    if (!navigator.geolocation) return;

    setTracking(true);

    // Watch position
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => sendLocation(pos),
      (err) => console.error('GPS error:', err),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
    );

    // Also send every 30s even if no movement
    intervalRef.current = setInterval(() => {
      navigator.geolocation.getCurrentPosition(sendLocation);
    }, 30000);
  };

  const stopTracking = () => {
    setTracking(false);
    if (watchRef.current) navigator.geolocation.clearWatch(watchRef.current);
    clearInterval(intervalRef.current);
  };

  const sendLocation = async (pos: GeolocationPosition) => {
    await api.post('/api/gps/update', {
      employee_id: user?.employee_id,
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
      speed: pos.coords.speed || 0,
      heading: pos.coords.heading || 0,
      battery_level: battery
    });
  };

  const updateTaskStatus = async (taskId: string, status: string) => {
    await api.put(`/api/tasks/${taskId}/status`, { status });
    loadTasks();
  };

  const STATUS_FLOW: Record<string, string> = {
    pending: 'on_way',
    on_way: 'arrived',
    arrived: 'in_progress',
    in_progress: 'done'
  };

  const STATUS_LABEL: Record<string, string> = {
    pending: 'התחל נסיעה',
    on_way: 'הגעתי',
    arrived: 'התחל עבודה',
    in_progress: 'סיימתי',
    done: '✓ הושלם'
  };

  return (
    <div style={{
      background: '#1C2127',
      minHeight: '100vh',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      direction: 'rtl',
      color: '#F6F7F9'
    }}>
      {/* HEADER */}
      <div style={{
        background: '#2F343C',
        padding: '16px',
        borderBottom: '2px solid #FFA500',
        display: 'flex',
        alignItems: 'center',
        gap: 12
      }}>
        <div style={{ width: 10, height: 10, background: '#FFA500' }} />
        <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: '0.05em' }}>TECHNO-KOL</span>
        <div style={{ flex: 1 }} />
        {battery !== null && (
          <span style={{ fontSize: 12, color: battery < 20 ? '#FC8585' : '#5C7080' }}>
            🔋 {battery}%
          </span>
        )}
      </div>

      {/* GPS TOGGLE */}
      <div style={{ padding: 16 }}>
        <button
          onClick={tracking ? stopTracking : startTracking}
          style={{
            width: '100%',
            background: tracking ? 'rgba(61,204,145,0.15)' : 'rgba(255,165,0,0.15)',
            border: `2px solid ${tracking ? '#3DCC91' : '#FFA500'}`,
            color: tracking ? '#3DCC91' : '#FFA500',
            padding: '14px',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
            borderRadius: 4
          }}
        >
          {tracking ? '● מעקב GPS פעיל — לחץ לעצור' : '▶ הפעל מעקב GPS'}
        </button>
      </div>

      {/* TASKS */}
      <div style={{ padding: '0 16px' }}>
        <div style={{ fontSize: 10, color: '#5C7080', letterSpacing: '0.15em', marginBottom: 10 }}>
          המשימות שלי היום
        </div>

        {tasks.length === 0 && (
          <div style={{ textAlign: 'center', color: '#5C7080', padding: 32, fontSize: 13 }}>
            אין משימות להיום
          </div>
        )}

        {tasks.map((task: any) => (
          <div key={task.id} style={{
            background: '#2F343C',
            border: `1px solid ${task.status === 'done' ? 'rgba(61,204,145,0.3)' : 'rgba(255,255,255,0.08)'}`,
            borderRight: `3px solid ${task.status === 'done' ? '#3DCC91' : '#FFA500'}`,
            padding: 14,
            marginBottom: 10
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{task.title}</span>
              <span style={{
                fontSize: 10,
                color: task.status === 'done' ? '#3DCC91' : '#FFA500',
                border: `1px solid ${task.status === 'done' ? '#3DCC9140' : '#FFA50040'}`,
                padding: '2px 7px'
              }}>
                {({ pending: 'ממתין', on_way: 'בנסיעה', arrived: 'הגעתי', in_progress: 'בביצוע', done: 'הושלם' } as any)[task.status]}
              </span>
            </div>

            <div style={{ fontSize: 12, color: '#ABB3BF', marginBottom: 4 }}>
              📍 {task.address}
            </div>

            {task.client_name && (
              <div style={{ fontSize: 11, color: '#5C7080', marginBottom: 10 }}>
                👤 {task.client_name}
                {task.client_phone && (
                  <a href={`tel:${task.client_phone}`} style={{ color: '#48AFF0', marginRight: 8 }}>
                    📞 {task.client_phone}
                  </a>
                )}
              </div>
            )}

            {task.address && (
              <a
                href={`https://waze.com/ul?q=${encodeURIComponent(task.address)}`}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'inline-block',
                  background: 'rgba(72,175,240,0.1)',
                  border: '1px solid rgba(72,175,240,0.3)',
                  color: '#48AFF0',
                  padding: '6px 12px',
                  fontSize: 12,
                  textDecoration: 'none',
                  marginBottom: 10,
                  marginLeft: 8
                }}
              >
                נווט ב-Waze
              </a>
            )}

            {task.status !== 'done' && STATUS_FLOW[task.status] && (
              <button
                onClick={() => updateTaskStatus(task.id, STATUS_FLOW[task.status])}
                style={{
                  width: '100%',
                  background: 'rgba(255,165,0,0.1)',
                  border: '1px solid #FFA500',
                  color: '#FFA500',
                  padding: '10px',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                {STATUS_LABEL[task.status]}
              </button>
            )}
          </div>
        ))}
      </div>

      {/* MESSAGES */}
      <div style={{ padding: '0 16px 32px' }}>
        <div style={{ fontSize: 10, color: '#5C7080', letterSpacing: '0.15em', marginBottom: 10, marginTop: 16 }}>
          הודעות
          {messages.filter(m => !m.is_read).length > 0 && (
            <span style={{ background: '#FC8585', color: '#fff', fontSize: 9, padding: '1px 5px', marginRight: 6, borderRadius: 2 }}>
              {messages.filter(m => !m.is_read).length}
            </span>
          )}
        </div>

        {messages.slice(0, 5).map((msg: any) => (
          <div key={msg.id} style={{
            background: '#2F343C',
            border: `1px solid ${msg.is_read ? 'rgba(255,255,255,0.06)' : 'rgba(255,165,0,0.3)'}`,
            padding: '10px 14px',
            marginBottom: 8,
            fontSize: 12
          }}>
            <div style={{ color: '#5C7080', fontSize: 10, marginBottom: 4 }}>{msg.from_name}</div>
            <div style={{ color: '#F6F7F9' }}>{msg.content}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
