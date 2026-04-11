import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

// ═══════════════════════════════════════════════
// WINDOW.STORAGE COMPATIBILITY SHIM
// App.jsx uses window.storage.get/set (Base44 API).
// Map it to localStorage for standalone environments.
// ═══════════════════════════════════════════════
if (typeof window !== 'undefined' && !window.storage) {
  window.storage = {
    get: async (key) => {
      try {
        const value = localStorage.getItem(key);
        return value !== null ? { key, value } : null;
      } catch (e) {
        console.error('[storage.get]', e);
        return null;
      }
    },
    set: async (key, value) => {
      try {
        localStorage.setItem(key, value);
        return { key, value };
      } catch (e) {
        console.error('[storage.set]', e);
        throw e;
      }
    },
    remove: async (key) => {
      try {
        localStorage.removeItem(key);
        return true;
      } catch (e) {
        console.error('[storage.remove]', e);
        return false;
      }
    },
    clear: async () => {
      try {
        localStorage.clear();
        return true;
      } catch (e) {
        console.error('[storage.clear]', e);
        return false;
      }
    }
  };
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
