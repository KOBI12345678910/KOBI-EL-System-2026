import React from "react";
import { motion } from "framer-motion";
import { LoadingOverlay } from "@/components/ui/unified-states";

export function SkeletonCard({ className = "", standalone = true }: { className?: string; standalone?: boolean }) {
  const inner = (
    <div className="space-y-4 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-muted/20" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-1/3 rounded bg-muted/20" />
          <div className="h-3 w-1/2 rounded bg-muted/15" />
        </div>
      </div>
      <div className="space-y-2">
        <div className="h-3 w-full rounded bg-muted/15" />
        <div className="h-3 w-4/5 rounded bg-muted/15" />
        <div className="h-3 w-3/5 rounded bg-muted/10" />
      </div>
    </div>
  );

  if (!standalone) {
    return (
      <div className={`rounded-xl bg-card/50 border border-border/30 p-6 ${className}`}>
        {inner}
      </div>
    );
  }

  return (
    <LoadingOverlay className={`rounded-xl bg-card/50 border border-border/30 p-6 min-h-[120px] ${className}`}>
      {inner}
    </LoadingOverlay>
  );
}

export function SkeletonTable({ rows = 5, cols = 4, className = "", standalone = true }: { rows?: number; cols?: number; className?: string; standalone?: boolean }) {
  const inner = (
    <div className="animate-pulse">
      <div className="flex gap-4 px-4 py-3 border-b border-border/30">
        {Array.from({ length: cols }).map((_, i) => (
          <div key={i} className="h-4 flex-1 rounded bg-muted/20" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4 px-4 py-3 border-b border-border/10">
          {Array.from({ length: cols }).map((_, c) => (
            <div key={c} className="h-3.5 flex-1 rounded bg-muted/15" style={{ maxWidth: `${70 + ((r * cols + c) % 4) * 8}%` }} />
          ))}
        </div>
      ))}
    </div>
  );

  if (!standalone) {
    return (
      <div className={`rounded-xl bg-card/50 border border-border/30 overflow-hidden ${className}`}>
        {inner}
      </div>
    );
  }

  return (
    <LoadingOverlay className={`rounded-xl bg-card/50 border border-border/30 overflow-hidden min-h-[150px] ${className}`}>
      {inner}
    </LoadingOverlay>
  );
}

export function SkeletonKPI({ count = 4, className = "", standalone = true }: { count?: number; className?: string; standalone?: boolean }) {
  const inner = (
    <div
      className="grid grid-cols-2 gap-4"
      style={{ gridTemplateColumns: `repeat(${Math.min(count, 6)}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl bg-card/50 border border-border/30 p-4 animate-pulse">
          <div className="flex items-center justify-between mb-3">
            <div className="w-8 h-8 rounded-lg bg-muted/20" />
            <div className="w-12 h-3 rounded bg-muted/15" />
          </div>
          <div className="h-6 w-1/2 rounded bg-muted/20 mb-1" />
          <div className="h-3 w-2/3 rounded bg-muted/10" />
        </div>
      ))}
    </div>
  );

  if (!standalone) {
    return <div className={className}>{inner}</div>;
  }

  return (
    <LoadingOverlay className={`min-h-[100px] ${className}`}>
      {inner}
    </LoadingOverlay>
  );
}

export function SkeletonPage() {
  return (
    <LoadingOverlay className="min-h-[400px]">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="animate-pulse flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-muted/20" />
            <div className="space-y-2">
              <div className="h-5 w-32 rounded bg-muted/20" />
              <div className="h-3 w-48 rounded bg-muted/15" />
            </div>
          </div>
          <div className="animate-pulse flex gap-2">
            <div className="w-24 h-9 rounded-lg bg-muted/15" />
            <div className="w-20 h-9 rounded-lg bg-muted/15" />
          </div>
        </div>
        <SkeletonKPI count={4} standalone={false} />
        <SkeletonTable rows={6} cols={5} standalone={false} />
      </div>
    </LoadingOverlay>
  );
}
