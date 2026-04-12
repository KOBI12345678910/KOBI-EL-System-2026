import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { theme } from '../lib/theme';

/**
 * ErrorBoundary — Palantir-dark fallback UI for any uncaught React error.
 *
 * Wrap the root (or a high-level route) to prevent a single broken page
 * from destroying the whole shell.
 *
 * Usage:
 *   <ErrorBoundary>
 *     <App />
 *   </ErrorBoundary>
 */

export interface ErrorBoundaryProps {
  children: ReactNode;
  /** Optional custom fallback; if omitted, the default Palantir panel is rendered. */
  fallback?: ReactNode | ((error: Error, reset: () => void) => ReactNode);
  /** Called whenever an error is caught — useful for logging / telemetry. */
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Log to console so devtools see it. In production, swap for a telemetry hook.
    if (typeof console !== 'undefined' && typeof console.error === 'function') {
      // eslint-disable-next-line no-console
      console.error('[ErrorBoundary] Uncaught error:', error, info);
    }
    this.props.onError?.(error, info);
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  handleReload = (): void => {
    if (typeof window !== 'undefined') window.location.reload();
  };

  render(): ReactNode {
    if (!this.state.hasError || !this.state.error) return this.props.children;

    const { fallback } = this.props;
    if (typeof fallback === 'function') {
      return (fallback as (error: Error, reset: () => void) => ReactNode)(
        this.state.error,
        this.handleReset
      );
    }
    if (fallback) return fallback;

    // Default Palantir-dark fallback
    return (
      <div
        role="alert"
        dir="rtl"
        lang="he"
        style={{
          minHeight: '100vh',
          background: theme.colors.bgElevated,
          color: theme.colors.text,
          fontFamily: theme.typography.fontFamily,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: theme.spacing.xl,
        }}
      >
        <div
          style={{
            maxWidth: 520,
            width: '100%',
            background: theme.colors.bgCard,
            border: `1px solid ${theme.colors.border}`,
            borderTop: `2px solid ${theme.colors.danger}`,
            padding: theme.spacing.xxl,
            boxShadow: theme.shadow.lg,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: theme.spacing.md,
              marginBottom: theme.spacing.lg,
            }}
          >
            <div
              style={{
                width: 12,
                height: 12,
                background: theme.colors.danger,
              }}
            />
            <div
              style={{
                fontSize: theme.typography.size.lg,
                fontWeight: theme.typography.weight.bold,
                letterSpacing: theme.typography.tracking.wide,
                color: theme.colors.text,
              }}
            >
              אירעה שגיאה במסך
            </div>
          </div>

          <div
            style={{
              color: theme.colors.textMuted,
              fontSize: theme.typography.size.base,
              lineHeight: theme.typography.lineHeight.relaxed,
              marginBottom: theme.spacing.lg,
            }}
          >
            המערכת זיהתה תקלה ברכיב הנוכחי. אפשר לנסות לשחזר את המסך או לרענן את
            הדף במלואו. אין השפעה על שאר המודולים.
          </div>

          <pre
            style={{
              background: theme.colors.bgDeep,
              color: theme.colors.danger,
              border: `1px solid ${theme.colors.border}`,
              padding: theme.spacing.md,
              fontSize: theme.typography.size.sm,
              fontFamily: theme.typography.fontMono,
              maxHeight: 160,
              overflow: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              direction: 'ltr',
              textAlign: 'left',
              marginBottom: theme.spacing.lg,
            }}
          >
            {this.state.error.name}: {this.state.error.message}
            {this.state.error.stack ? `\n\n${this.state.error.stack}` : ''}
          </pre>

          <div style={{ display: 'flex', gap: theme.spacing.sm, justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={this.handleReset}
              style={{
                background: 'transparent',
                border: `1px solid ${theme.colors.border}`,
                color: theme.colors.textMuted,
                padding: `${theme.spacing.sm}px ${theme.spacing.lg}px`,
                fontSize: theme.typography.size.base,
                fontFamily: theme.typography.fontFamily,
                cursor: 'pointer',
              }}
            >
              נסה שוב
            </button>
            <button
              type="button"
              onClick={this.handleReload}
              style={{
                background: theme.colors.accentSoft,
                border: `1px solid ${theme.colors.accent}`,
                color: theme.colors.accent,
                padding: `${theme.spacing.sm}px ${theme.spacing.lg}px`,
                fontSize: theme.typography.size.base,
                fontFamily: theme.typography.fontFamily,
                fontWeight: theme.typography.weight.semibold,
                cursor: 'pointer',
              }}
            >
              רענון מלא
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
