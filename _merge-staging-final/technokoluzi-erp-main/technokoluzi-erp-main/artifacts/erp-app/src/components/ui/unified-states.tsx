import React, { Component, Suspense, type ReactNode, type ComponentType } from "react";
import { motion } from "framer-motion";
import { AlertCircle, RefreshCw, Inbox, Search, FileX, WifiOff, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

// ─── Empty State ────────────────────────────────────────────────────────────

interface EmptyStateProps {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void; icon?: React.ComponentType<{ className?: string }> };
  className?: string;
  variant?: "default" | "search" | "file" | "offline";
}

const VARIANT_ICONS = {
  default: Inbox,
  search: Search,
  file: FileX,
  offline: WifiOff,
};

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  variant = "default",
}: EmptyStateProps) {
  const DefaultIcon = Icon || VARIANT_ICONS[variant];
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "flex flex-col items-center justify-center py-16 px-6 text-center",
        className
      )}
    >
      <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4 border border-border/50">
        <DefaultIcon className="w-8 h-8 text-muted-foreground/60" />
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-2">{title}</h3>
      {description && (
        <p className="text-sm text-muted-foreground max-w-sm mb-6">{description}</p>
      )}
      {action && (
        <Button onClick={action.onClick} size="sm" className="gap-2">
          {action.icon ? <action.icon className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {action.label}
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
      <div className={cn("flex flex-col gap-4 p-6", className)}>
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
      </div>
    );
  }

  if (variant === "cards") {
    return (
      <div className={cn("grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4", className)}>
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
    );
  }

  if (variant === "dashboard") {
    return (
      <div className={cn("space-y-6", className)}>
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
    );
  }

  if (variant === "form") {
    return (
      <div className={cn("space-y-4", className)}>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="h-10 w-full" />
          </div>
        ))}
      </div>
    );
  }

  if (variant === "list") {
    return (
      <div className={cn("space-y-2", className)}>
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
    );
  }

  return (
    <div className={cn("space-y-0 rounded-xl border border-border overflow-hidden", className)}>
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
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
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
          <Button onClick={this.handleReset} variant="outline" size="sm" className="gap-2">
            <RefreshCw className="w-4 h-4" />
            נסה שוב
          </Button>
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

function PageErrorFallback({ error, onReset }: { error: Error | null; onReset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-5 p-8 text-center" dir="rtl">
      <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center border border-destructive/20">
        <AlertCircle className="w-8 h-8 text-destructive" />
      </div>
      <div className="space-y-2 max-w-sm">
        <h2 className="text-xl font-semibold text-foreground">אירעה שגיאה בדף</h2>
        <p className="text-sm text-muted-foreground">
          {error?.message && error.message.length < 150 ? error.message : "הדף נתקל בשגיאה לא צפויה. ניתן לנסות שוב."}
        </p>
      </div>
      <div className="flex gap-3">
        <Button onClick={onReset} size="sm" className="gap-2">
          <RefreshCw className="w-4 h-4" />
          נסה שוב
        </Button>
        <Button onClick={() => window.history.back()} variant="outline" size="sm">
          חזור אחורה
        </Button>
      </div>
    </div>
  );
}

// ─── Page Skeleton (lazy suspense fallback) ───────────────────────────────────

function PageSkeleton() {
  return (
    <div className="space-y-4 p-6 animate-pulse" dir="rtl">
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
  );
}

// ─── withPage: HOC to wrap a lazy page component with ErrorBoundary + Suspense ─

interface PageBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class PageBoundary extends Component<{ children: ReactNode }, PageBoundaryState> {
  state: PageBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): PageBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[PageBoundary] Caught error:", error.message, info.componentStack?.slice(0, 200));
  }

  handleReset = () => this.setState({ hasError: false, error: null });

  render() {
    if (this.state.hasError) {
      return <PageErrorFallback error={this.state.error} onReset={this.handleReset} />;
    }
    return this.props.children;
  }
}

export function withPage<P extends object>(
  Component: ComponentType<P>
) {
  const Wrapped = (props: P) => (
    <PageBoundary>
      <Suspense fallback={<PageSkeleton />}>
        <Component {...props} />
      </Suspense>
    </PageBoundary>
  );
  Wrapped.displayName = `withPage(${Component.displayName || Component.name || "Component"})`;
  return Wrapped;
}

// ─── QueryError: render an error when a query fails ────────────────────────

export function QueryError({ error, onRetry, className }: { error: Error | string | unknown; onRetry?: () => void; className?: string }) {
  const rawMsg = error instanceof Error ? error.message : typeof error === "string" ? error : null;
  const displayMsg = rawMsg && rawMsg.length > 0
    ? rawMsg.length > 150 ? rawMsg.slice(0, 150) + "..." : rawMsg
    : "שגיאה בטעינת הנתונים";
  return (
    <div className={cn("flex flex-col items-center gap-4 py-10 px-6 text-center", className)} dir="rtl">
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
