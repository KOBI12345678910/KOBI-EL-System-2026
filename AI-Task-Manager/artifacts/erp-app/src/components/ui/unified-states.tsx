import React, { Component, Suspense, useState, useEffect, type ReactNode, type ComponentType } from "react";
import { motion } from "framer-motion";
import { AlertCircle, RefreshCw, Inbox, Search, FileX, WifiOff, Plus, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

// ─── Loading Overlay (spinner + timed messages) ──────────────────────────────

export function LoadingOverlay({ className, children }: { className?: string; children?: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const t1 = setTimeout(() => setMessage("טוען נתונים..."), 3000);
    const t2 = setTimeout(() => setMessage("הטעינה לוקחת יותר מהרגיל..."), 10000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  return (
    <div className={cn("relative", className)}>
      {children}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none">
        <Loader2 className="w-6 h-6 animate-spin text-primary/70" />
        {message && (
          <motion.p
            key={message}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-xs text-muted-foreground"
          >
            {message}
          </motion.p>
        )}
      </div>
    </div>
  );
}

// ─── Empty State ────────────────────────────────────────────────────────────

interface EmptyStateProps {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  subtitle?: string;
  action?: { label: string; onClick: () => void; icon?: React.ComponentType<{ className?: string }> };
  ctaLabel?: string;
  onCtaClick?: () => void;
  ctaIcon?: React.ComponentType<{ className?: string }>;
  illustration?: React.ReactNode;
  className?: string;
  variant?: "default" | "search" | "file" | "offline";
}

const VARIANT_ICONS = {
  default: Inbox,
  search: Search,
  file: FileX,
  offline: WifiOff,
};

function DefaultTableIllustration() {
  return (
    <svg width="120" height="80" viewBox="0 0 120 80" fill="none" xmlns="http://www.w3.org/2000/svg" className="mb-2 opacity-40">
      <rect x="10" y="10" width="100" height="60" rx="8" fill="currentColor" fillOpacity="0.06" stroke="currentColor" strokeOpacity="0.15" strokeWidth="1.5"/>
      <rect x="10" y="10" width="100" height="16" rx="8" fill="currentColor" fillOpacity="0.1"/>
      <rect x="10" y="18" width="100" height="8" fill="currentColor" fillOpacity="0.08"/>
      <rect x="20" y="13" width="24" height="4" rx="2" fill="currentColor" fillOpacity="0.3"/>
      <rect x="52" y="13" width="18" height="4" rx="2" fill="currentColor" fillOpacity="0.3"/>
      <rect x="78" y="13" width="22" height="4" rx="2" fill="currentColor" fillOpacity="0.3"/>
      <rect x="20" y="34" width="32" height="3" rx="1.5" fill="currentColor" fillOpacity="0.15"/>
      <rect x="20" y="44" width="24" height="3" rx="1.5" fill="currentColor" fillOpacity="0.1"/>
      <rect x="20" y="54" width="28" height="3" rx="1.5" fill="currentColor" fillOpacity="0.1"/>
      <rect x="62" y="34" width="18" height="3" rx="1.5" fill="currentColor" fillOpacity="0.15"/>
      <rect x="62" y="44" width="22" height="3" rx="1.5" fill="currentColor" fillOpacity="0.1"/>
      <rect x="62" y="54" width="16" height="3" rx="1.5" fill="currentColor" fillOpacity="0.1"/>
      <rect x="90" y="34" width="14" height="3" rx="1.5" fill="currentColor" fillOpacity="0.15"/>
      <rect x="90" y="44" width="12" height="3" rx="1.5" fill="currentColor" fillOpacity="0.1"/>
      <rect x="90" y="54" width="16" height="3" rx="1.5" fill="currentColor" fillOpacity="0.1"/>
    </svg>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  subtitle,
  action,
  ctaLabel,
  onCtaClick,
  ctaIcon: CtaIcon,
  illustration,
  className,
  variant = "default",
}: EmptyStateProps) {
  const DefaultIcon = Icon || VARIANT_ICONS[variant];
  const desc = description || subtitle;
  const ctaAction = action || (ctaLabel && onCtaClick ? { label: ctaLabel, onClick: onCtaClick, icon: CtaIcon } : undefined);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "flex flex-col items-center justify-center py-16 px-6 text-center",
        className
      )}
    >
      {illustration !== undefined ? illustration : <DefaultTableIllustration />}
      <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4 border border-border/50">
        <DefaultIcon className="w-8 h-8 text-muted-foreground/60" />
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-2">{title}</h3>
      {desc && (
        <p className="text-sm text-muted-foreground max-w-sm mb-6">{desc}</p>
      )}
      {ctaAction && (
        <Button onClick={ctaAction.onClick} size="sm" className="gap-2">
          {ctaAction.icon ? <ctaAction.icon className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {ctaAction.label}
        </Button>
      )}
    </motion.div>
  );
}

// ─── Loading Skeleton ────────────────────────────────────────────────────────

interface LoadingSkeletonProps {
  variant?: "table" | "cards" | "form" | "dashboard" | "list" | "page";
  rows?: number;
  className?: string;
}

export function LoadingSkeleton({ variant = "table", rows = 5, className }: LoadingSkeletonProps) {
  if (variant === "page") {
    return (
      <LoadingOverlay className={cn("flex flex-col gap-4 p-6 min-h-[200px]", className)}>
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-6 w-24 rounded-full" />
        </div>
        <div className="flex gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-24 rounded-lg" />
          ))}
        </div>
        <div className="space-y-3">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="flex gap-4 items-center p-3 rounded-xl border border-border bg-card">
              <Skeleton className="h-10 w-10 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
              <Skeleton className="h-8 w-20" />
            </div>
          ))}
        </div>
      </LoadingOverlay>
    );
  }

  if (variant === "cards") {
    return (
      <LoadingOverlay className={cn("min-h-[150px]", className)}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-4 space-y-3">
              <div className="flex items-center gap-3">
                <Skeleton className="w-10 h-10 rounded-lg" />
                <Skeleton className="h-4 flex-1" />
              </div>
              <Skeleton className="h-8 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      </LoadingOverlay>
    );
  }

  if (variant === "dashboard") {
    return (
      <LoadingOverlay className={cn("min-h-[300px]", className)}>
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-border bg-card p-4 space-y-3">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-10 w-1/2" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-xl border border-border bg-card p-4 space-y-3 h-48">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-32" />
            </div>
            <div className="rounded-xl border border-border bg-card p-4 space-y-3 h-48">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-32" />
            </div>
          </div>
        </div>
      </LoadingOverlay>
    );
  }

  if (variant === "form") {
    return (
      <LoadingOverlay className={cn("min-h-[150px]", className)}>
        <div className="space-y-4">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-4 w-1/4" />
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
        </div>
      </LoadingOverlay>
    );
  }

  if (variant === "list") {
    return (
      <LoadingOverlay className={cn("min-h-[150px]", className)}>
        <div className="space-y-2">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card">
              <Skeleton className="w-8 h-8 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
              <Skeleton className="h-6 w-16" />
            </div>
          ))}
        </div>
      </LoadingOverlay>
    );
  }

  return (
    <LoadingOverlay className={cn("min-h-[150px]", className)}>
      <div className="space-y-0 rounded-xl border border-border overflow-hidden">
        <div className="border-b border-border bg-muted/30 p-3 flex gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-4 flex-1" />
          ))}
        </div>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="border-b border-border/50 p-3 flex gap-4 last:border-0">
            <Skeleton className="h-4 w-4 rounded" />
            {Array.from({ length: 4 }).map((_, j) => (
              <Skeleton key={j} className={`h-4 ${j === 0 ? "w-1/4" : j === 3 ? "w-16" : "flex-1"}`} />
            ))}
          </div>
        ))}
      </div>
    </LoadingOverlay>
  );
}

// ─── Error Boundary ──────────────────────────────────────────────────────────

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  fallbackRender?: (props: { error: Error | null; onReset: () => void }) => ReactNode;
  onReset?: () => void;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info);
  }

  handleReset = () => {
    this.props.onReset?.();
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallbackRender) {
        return this.props.fallbackRender({ error: this.state.error, onReset: this.handleReset });
      }
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
          <div className="w-14 h-14 rounded-2xl bg-destructive/10 flex items-center justify-center mb-4 border border-destructive/20">
            <AlertCircle className="w-7 h-7 text-destructive" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-2">אירעה שגיאה</h3>
          <p className="text-sm text-muted-foreground max-w-sm mb-6">
            {this.state.error?.message || "שגיאה לא צפויה אירעה. אנא נסה שוב."}
          </p>
          <div className="flex gap-3 flex-wrap justify-center">
            <Button onClick={this.handleReset} variant="outline" size="sm" className="gap-2">
              <RefreshCw className="w-4 h-4" />
              נסה שוב
            </Button>
            <Button onClick={() => window.history.back()} variant="outline" size="sm">
              חזור אחורה
            </Button>
            <Button onClick={() => { window.location.href = import.meta.env.BASE_URL; }} variant="outline" size="sm">
              חזור לדף הבית
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Inline Error Message ────────────────────────────────────────────────────

export function InlineError({ message, className }: { message: string; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "flex items-center gap-2 px-3 py-2 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive",
        className
      )}
    >
      <AlertCircle className="w-4 h-4 flex-shrink-0" />
      {message}
    </motion.div>
  );
}

// ─── Page-level ErrorBoundary fallback ──────────────────────────────────────

function PageErrorFallback({ error, onReset, onBack }: { error: Error | null; onReset: () => void; onBack: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-5 p-8 text-center">
      <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center border border-destructive/20">
        <AlertCircle className="w-8 h-8 text-destructive" />
      </div>
      <div className="space-y-2 max-w-sm">
        <h2 className="text-xl font-semibold text-foreground">אירעה שגיאה בדף</h2>
        <p className="text-sm text-muted-foreground">
          {error?.message && error.message.length < 150 ? error.message : "הדף נתקל בשגיאה לא צפויה. ניתן לנסות שוב."}
        </p>
      </div>
      <div className="flex gap-3 flex-wrap justify-center">
        <Button onClick={onReset} size="sm" className="gap-2">
          <RefreshCw className="w-4 h-4" />
          נסה שוב
        </Button>
        <Button onClick={onBack} variant="outline" size="sm">
          חזור אחורה
        </Button>
        <Button onClick={() => { window.location.href = import.meta.env.BASE_URL; }} variant="outline" size="sm">
          חזור לדף הבית
        </Button>
      </div>
    </div>
  );
}

// ─── Page Skeleton (lazy suspense fallback) ───────────────────────────────────

function PageSkeleton() {
  return (
    <LoadingOverlay className="min-h-[400px]">
      <div className="space-y-4 p-6 animate-pulse">
        <div className="flex items-center justify-between">
          <div className="h-8 w-48 bg-muted/50 rounded-lg" />
          <div className="flex gap-2">
            <div className="h-9 w-24 bg-muted/40 rounded-lg" />
            <div className="h-9 w-20 bg-muted/40 rounded-lg" />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="rounded-xl border border-border bg-card p-4 space-y-3">
              <div className="h-4 w-3/4 bg-muted/50 rounded" />
              <div className="h-10 w-1/2 bg-muted/50 rounded" />
              <div className="h-3 w-2/3 bg-muted/40 rounded" />
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="border-b border-border bg-muted/30 p-3 flex gap-4">
            {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-4 flex-1 bg-muted/50 rounded" />)}
          </div>
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="border-b border-border/50 p-3 flex gap-4 last:border-0">
              <div className="h-4 w-4 bg-muted/40 rounded" />
              {[1, 2, 3, 4].map(j => <div key={j} className={`h-4 bg-muted/40 rounded ${j === 0 ? "w-1/4" : j === 3 ? "w-16" : "flex-1"}`} />)}
            </div>
          ))}
        </div>
      </div>
    </LoadingOverlay>
  );
}

// ─── Page Load Timeout ────────────────────────────────────────────────────────

const PAGE_LOAD_TIMEOUT_MS = 15_000;

function PageLoadTimeoutFallback() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-5 p-8 text-center">
      <div className="w-16 h-16 rounded-2xl bg-amber-500/10 flex items-center justify-center border border-amber-500/20">
        <AlertCircle className="w-8 h-8 text-amber-500" />
      </div>
      <div className="space-y-2 max-w-sm">
        <h2 className="text-xl font-semibold text-foreground">הטעינה נמשכת זמן רב</h2>
        <p className="text-sm text-muted-foreground">
          הדף לא הצליח להיטען תוך 15 שניות. ייתכן שיש בעיית רשת. אנא נסה לרענן.
        </p>
      </div>
      <Button onClick={() => window.location.reload()} size="sm" className="gap-2">
        <RefreshCw className="w-4 h-4" />
        רענן דף
      </Button>
    </div>
  );
}

function TimedFallback({ onTimeout, children }: { onTimeout: () => void; children: ReactNode }) {
  useEffect(() => {
    const timer = setTimeout(onTimeout, PAGE_LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [onTimeout]);
  return <>{children}</>;
}

function SuspenseWithTimeout({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const [timedOut, setTimedOut] = useState(false);

  const handleTimeout = React.useCallback(() => setTimedOut(true), []);

  if (timedOut) {
    return <PageLoadTimeoutFallback />;
  }

  return (
    <Suspense
      fallback={<TimedFallback onTimeout={handleTimeout}>{fallback}</TimedFallback>}
    >
      {children}
    </Suspense>
  );
}

// ─── withPage: HOC to wrap a lazy page component with ErrorBoundary + Suspense ─

interface PageBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class PageBoundary extends Component<{ children: ReactNode; navigate: (to: string) => void }, PageBoundaryState> {
  state: PageBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): PageBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[PageBoundary] Caught error:", error.message, info.componentStack?.slice(0, 200));
  }

  handleReset = () => window.location.reload();

  handleBack = () => window.history.back();

  render() {
    if (this.state.hasError) {
      return <PageErrorFallback error={this.state.error} onReset={this.handleReset} onBack={this.handleBack} />;
    }
    return this.props.children;
  }
}

export function withPage<P extends object>(
  Component: ComponentType<P>
) {
  const Wrapped = (props: P) => {
    const [location, navigate] = useLocation();
    return (
      <PageBoundary key={location} navigate={navigate}>
        <SuspenseWithTimeout key={location} fallback={<PageSkeleton />}>
          <Component {...props} />
        </SuspenseWithTimeout>
      </PageBoundary>
    );
  };
  Wrapped.displayName = `withPage(${Component.displayName || Component.name || "Component"})`;
  return Wrapped;
}

// ─── ErrorState: page-level error with retry ─────────────────────────────────

interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({
  title = "לא הצלחנו לטעון את הנתונים",
  description,
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "flex flex-col items-center justify-center min-h-[40vh] gap-5 p-8 text-center",
        className
      )}
      dir="rtl"
    >
      <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center border border-destructive/20">
        <AlertCircle className="w-8 h-8 text-destructive" />
      </div>
      <div className="space-y-2 max-w-sm">
        <h3 className="text-lg font-semibold text-foreground">{title}</h3>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {onRetry && (
        <Button onClick={onRetry} size="sm" className="gap-2">
          <RefreshCw className="w-4 h-4" />
          נסה שוב
        </Button>
      )}
    </motion.div>
  );
}

// ─── QueryError: render an error when a query fails ────────────────────────

export function QueryError({ error, onRetry, className }: { error: Error | string | unknown; onRetry?: () => void; className?: string }) {
  const rawMsg = error instanceof Error ? error.message : typeof error === "string" ? error : null;
  const displayMsg = rawMsg && rawMsg.length > 0
    ? rawMsg.length > 150 ? rawMsg.slice(0, 150) + "..." : rawMsg
    : "שגיאה בטעינת הנתונים";
  return (
    <div className={cn("flex flex-col items-center gap-4 py-10 px-6 text-center", className)}>
      <div className="w-12 h-12 rounded-xl bg-destructive/10 flex items-center justify-center border border-destructive/20">
        <AlertCircle className="w-6 h-6 text-destructive" />
      </div>
      <div className="space-y-1">
        <p className="font-medium text-foreground text-sm">שגיאה בטעינת הנתונים</p>
        <p className="text-xs text-muted-foreground max-w-xs">{displayMsg}</p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} className="gap-2">
          <RefreshCw className="w-3 h-3" />
          נסה שוב
        </Button>
      )}
    </div>
  );
}
