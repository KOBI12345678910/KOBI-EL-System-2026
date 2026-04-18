import { useState, useEffect } from 'react';
import api from '../../api/client';

export default function TopBar({ onMenuClick }) {
  const [notifications, setNotifications] = useState({ notifications: [], unreadCount: 0 });
  const [showNotifications, setShowNotifications] = useState(false);

  useEffect(() => {
    loadNotifications();
    const interval = setInterval(loadNotifications, 30000);
    return () => clearInterval(interval);
  }, []);

  async function loadNotifications() {
    try {
      const { data } = await api.get('/notifications?limit=10');
      setNotifications(data);
    } catch (err) {
      // Server might not be running
    }
  }

  async function markAllRead() {
    await api.patch('/notifications/read-all');
    loadNotifications();
  }

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6">
      {/* Mobile menu button */}
      <button onClick={onMenuClick} className="lg:hidden p-2 rounded-md hover:bg-gray-100">
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      <div className="flex-1" />

      {/* Notifications */}
      <div className="relative">
        <button
          onClick={() => setShowNotifications(!showNotifications)}
          className="relative p-2 rounded-full hover:bg-gray-100"
        >
          <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          {notifications.unreadCount > 0 && (
            <span className="absolute -top-1 -left-1 bg-red-500 text-white text-xs w-5 h-5 flex items-center justify-center rounded-full">
              {notifications.unreadCount}
            </span>
          )}
        </button>

        {showNotifications && (
          <div className="absolute left-0 mt-2 w-80 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
            <div className="p-3 border-b border-gray-200 flex items-center justify-between">
              <h3 className="font-semibold text-gray-800">התראות</h3>
              {notifications.unreadCount > 0 && (
                <button onClick={markAllRead} className="text-xs text-primary-600 hover:underline">
                  סמן הכל כנקרא
                </button>
              )}
            </div>
            <div className="max-h-96 overflow-auto">
              {notifications.notifications.length === 0 ? (
                <div className="p-4 text-center text-gray-400 text-sm">אין התראות</div>
              ) : (
                notifications.notifications.map(n => (
                  <div key={n.id} className={`p-3 border-b border-gray-100 text-sm ${n.is_read ? 'bg-white' : 'bg-blue-50'}`}>
                    <p className="text-gray-700">{n.message}</p>
                    <p className="text-xs text-gray-400 mt-1">{new Date(n.created_at).toLocaleString('he-IL')}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
