import React, { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  info: ErrorInfo | null;
}

const isDev = import.meta.env.DEV;

export class GlobalErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, info: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, info: null };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[GlobalErrorBoundary] Uncaught error:', error, info);
    this.setState({ info });
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null, info: null });
  };

  render(): ReactNode {
    if (!this.state.hasError || !this.state.error) return this.props.children;

    return (
      <div
        role="alert"
        dir="rtl"
        lang="he"
        style={{
          minHeight: '100vh',
          background: '#0b0d10',
          color: '#e6edf3',
          fontFamily: "-apple-system, 'Segoe UI', Heebo, Arial, sans-serif",
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
        }}
      >
        <div
          style={{
            maxWidth: 560,
            width: '100%',
            background: '#13171c',
            border: '1px solid #2a3340',
            borderTop: '3px solid #f85149',
            padding: 40,
            borderRadius: 6,
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div style={{ width: 12, height: 12, background: '#f85149', borderRadius: '50%', flexShrink: 0 }} />
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#f85149' }}>
              משהו השתבש 😓
            </h1>
          </div>

          {/* Description */}
          <p style={{ color: '#8b96a5', fontSize: 14, lineHeight: 1.6, margin: '0 0 20px 0' }}>
            המערכת נתקלה בשגיאה בלתי צפויה. ניתן לנסות שוב או לרענן את הדף.
          </p>

          {/* Error message */}
          <div
            style={{
              background: '#1a2028',
              border: '1px solid #2a3340',
              borderRight: '3px solid #f85149',
              padding: '12px 16px',
              marginBottom: 20,
              borderRadius: 4,
              color: '#f85149',
              fontSize: 13,
              fontFamily: 'monospace',
              direction: 'ltr',
              textAlign: 'left',
              wordBreak: 'break-word',
            }}
          >
            {this.state.error.name}: {this.state.error.message}
          </div>

          {/* Stack trace — dev only */}
          {isDev && this.state.error.stack && (
            <pre
              style={{
                background: '#0b0d10',
                border: '1px solid #2a3340',
                padding: 12,
                borderRadius: 4,
                fontSize: 11,
                fontFamily: 'monospace',
                color: '#8b96a5',
                maxHeight: 200,
                overflow: 'auto',
                direction: 'ltr',
                textAlign: 'left',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                marginBottom: 20,
              }}
            >
              {this.state.error.stack}
              {this.state.info?.componentStack
                ? '\n\nComponent Stack:' + this.state.info.componentStack
                : ''}
            </pre>
          )}

          {/* Buttons */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-start', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={this.handleReset}
              style={{
                background: '#4a9eff',
                color: '#fff',
                border: '1px solid #4a9eff',
                padding: '10px 24px',
                borderRadius: 4,
                fontSize: 14,
                fontFamily: 'inherit',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              נסה שוב
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                background: 'transparent',
                color: '#8b96a5',
                border: '1px solid #2a3340',
                padding: '10px 24px',
                borderRadius: 4,
                fontSize: 14,
                fontFamily: 'inherit',
                cursor: 'pointer',
              }}
            >
              רענן דף
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default GlobalErrorBoundary;
