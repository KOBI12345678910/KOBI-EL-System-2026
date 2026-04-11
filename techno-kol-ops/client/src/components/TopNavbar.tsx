import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Popover, Menu, MenuItem, Icon } from '@blueprintjs/core';
import { theme } from '../styles/theme';
import { useAuth } from '../hooks/useAuth';
import { useWebSocket } from '../hooks/useWebSocket';

const TopNavbar: React.FC = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { connected } = useWebSocket();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const userMenu = (
    <Menu>
      <MenuItem icon="user" text={user?.displayName ?? user?.username ?? 'משתמש'} disabled />
      <MenuItem icon="cog" text="הגדרות" onClick={() => setMenuOpen(false)} />
      <MenuItem icon="log-out" text="התנתק" intent="danger" onClick={handleLogout} />
    </Menu>
  );

  return (
    <header
      dir="rtl"
      style={{
        height: 48,
        minHeight: 48,
        background: theme.bg.sidebar,
        borderBottom: `1px solid ${theme.border}`,
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}
    >
      {/* Right: Logo + title (RTL right side = start) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div
          style={{
            width: 32,
            height: 32,
            background: theme.accent.primary,
            color: '#1C2127',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 800,
            fontSize: 13,
            borderRadius: 2,
            letterSpacing: 0.5,
          }}
        >
          TK
        </div>
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: theme.text.primary,
            letterSpacing: 0.3,
          }}
        >
          Techno-Kol Operations
        </div>
      </div>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Left: connection indicator + user menu */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div
          title={connected ? 'מחובר' : 'מנותק'}
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: theme.text.secondary }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 2,
              background: connected ? theme.accent.primary : theme.accent.danger,
              boxShadow: connected ? `0 0 6px ${theme.accent.primary}` : 'none',
              display: 'inline-block',
            }}
          />
          <span>{connected ? 'מחובר' : 'מנותק'}</span>
        </div>

        <Popover content={userMenu} isOpen={menuOpen} onInteraction={setMenuOpen} placement="bottom-end">
          <Button minimal small style={{ color: theme.text.primary, borderRadius: 2 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Icon icon="user" size={14} />
              <span>{user?.displayName ?? user?.username ?? 'משתמש'}</span>
              <Icon icon="caret-down" size={12} />
            </span>
          </Button>
        </Popover>

        <Button minimal small icon="log-out" title="התנתק" onClick={handleLogout} style={{ color: theme.text.secondary, borderRadius: 2 }} />
      </div>
    </header>
  );
};

export default TopNavbar;
