import React from 'react';
import { useNavigate } from 'react-router-dom';

export function NotFound() {
  const navigate = useNavigate();

  return (
    <div
      dir="rtl"
      lang="he"
      style={{
        minHeight: '100vh',
        background: '#1C2127',
        color: '#F6F7F9',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        padding: 24,
      }}
    >
      <div
        style={{
          textAlign: 'center',
          maxWidth: 480,
        }}
      >
        {/* 404 number */}
        <div
          style={{
            fontSize: 96,
            fontWeight: 700,
            color: '#2F343C',
            lineHeight: 1,
            marginBottom: 8,
            letterSpacing: '-0.04em',
          }}
        >
          404
        </div>

        {/* Orange indicator */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            marginBottom: 20,
          }}
        >
          <div style={{ width: 10, height: 10, background: '#FFA500', borderRadius: '50%' }} />
          <h1
            style={{
              margin: 0,
              fontSize: 22,
              fontWeight: 700,
              color: '#F6F7F9',
              letterSpacing: '0.02em',
            }}
          >
            הדף לא נמצא 404
          </h1>
        </div>

        {/* Subtext */}
        <p
          style={{
            color: '#5C7080',
            fontSize: 14,
            lineHeight: 1.7,
            margin: '0 0 32px 0',
          }}
        >
          הדף שחיפשת לא קיים במערכת.
          <br />
          ייתכן שהקישור שגוי או שהדף הוסר.
        </p>

        {/* Back to dashboard button */}
        <button
          type="button"
          onClick={() => navigate('/')}
          style={{
            background: 'rgba(255, 165, 0, 0.15)',
            border: '1px solid #FFA500',
            color: '#FFA500',
            padding: '11px 32px',
            fontSize: 14,
            fontWeight: 600,
            fontFamily: 'inherit',
            cursor: 'pointer',
            borderRadius: 2,
            letterSpacing: '0.05em',
          }}
        >
          חזור לדשבורד
        </button>
      </div>
    </div>
  );
}

export default NotFound;
