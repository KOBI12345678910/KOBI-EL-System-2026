import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import TopNavbar from './TopNavbar';
import { theme } from '../styles/theme';

const Layout: React.FC = () => {
  return (
    <div
      dir="rtl"
      style={{
        display: 'flex',
        flexDirection: 'row',
        minHeight: '100vh',
        width: '100%',
        background: theme.bg.main,
        color: theme.text.primary,
      }}
    >
      <Sidebar />
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
        <TopNavbar />
        <main
          style={{
            flex: 1,
            padding: 16,
            overflowY: 'auto',
            background: theme.bg.main,
          }}
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default Layout;
