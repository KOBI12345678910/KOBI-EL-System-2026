import { useEffect, useRef, useState } from 'react';
import {
  processIncomingQuote,
  DecisionStore,
  type IncomingQuote,
  type SubcontractorDecision,
  type WorkType,
} from '../engines/subcontractorEngine';

// ═══════════════════════════════════════════════════════════════════════════
// AUTONOMOUS PIPELINE HOOK
// Watches for incoming quotes/deals and automatically pushes them through
// the Subcontractor Decision Engine. Every new quote → AI analysis → alert.
// ═══════════════════════════════════════════════════════════════════════════

type QueueState = {
  pendingIds: Set<string>;
  lastProcessedAt: number;
};

const STATE: QueueState = {
  pendingIds: new Set(),
  lastProcessedAt: 0,
};

interface PipelineEvent {
  type: 'quote.created' | 'deal.created' | 'pipeline.update';
  payload: {
    id: string;
    name?: string;
    client?: string;
    address?: string;
    workType?: WorkType;
    totalValue?: number;
    areaSqm?: number;
    startDate?: string;
    deadline?: string;
    requirements?: string;
  };
}

interface PipelineOptions {
  /** Auto-process new quotes (default: true) */
  autoProcess?: boolean;
  /** Callback when a decision is made */
  onDecision?: (decision: SubcontractorDecision) => void;
  /** Callback when processing fails */
  onError?: (error: Error, quote: IncomingQuote) => void;
  /** Poll interval in ms for checking new events (default: 5000) */
  pollIntervalMs?: number;
}

/**
 * Listens for pipeline events from the backend websocket and automatically
 * processes each new quote/deal through the decision engine.
 */
export function useAutonomousPipeline(options: PipelineOptions = {}) {
  const { autoProcess = true, onDecision, onError, pollIntervalMs = 5000 } = options;

  const [pendingCount, setPendingCount] = useState(0);
  const [lastDecision, setLastDecision] = useState<SubcontractorDecision | null>(null);
  const [status, setStatus] = useState<'idle' | 'processing' | 'error'>('idle');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Process a single quote through the engine
  const processQuote = (quote: IncomingQuote): SubcontractorDecision | null => {
    if (STATE.pendingIds.has(quote.quoteId)) return null;

    STATE.pendingIds.add(quote.quoteId);
    setPendingCount(STATE.pendingIds.size);
    setStatus('processing');

    try {
      const decision = processIncomingQuote(quote);
      if (decision) {
        setLastDecision(decision);
        onDecision?.(decision);
        STATE.lastProcessedAt = Date.now();
      }
      STATE.pendingIds.delete(quote.quoteId);
      setPendingCount(STATE.pendingIds.size);
      setStatus('idle');
      return decision;
    } catch (e: any) {
      STATE.pendingIds.delete(quote.quoteId);
      setPendingCount(STATE.pendingIds.size);
      setStatus('error');
      onError?.(e, quote);
      return null;
    }
  };

  // Handle pipeline events from websocket
  const handleEvent = (event: PipelineEvent) => {
    if (!autoProcess) return;
    if (event.type !== 'quote.created' && event.type !== 'deal.created') return;

    const p = event.payload;
    if (!p.workType || !p.totalValue || !p.areaSqm) return;

    // Skip already-processed
    if (DecisionStore.getByProject(p.id).length > 0) return;

    const quote: IncomingQuote = {
      quoteId: p.id,
      projectName: p.name ?? `פרויקט ${p.id.slice(0, 8)}`,
      client: p.client ?? 'לקוח לא ידוע',
      address: p.address ?? '',
      workType: p.workType,
      totalProjectValue: p.totalValue,
      areaSqm: p.areaSqm,
      startDate: p.startDate ?? new Date().toISOString().slice(0, 10),
      deadline: p.deadline ?? new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      requirements: p.requirements,
    };

    processQuote(quote);
  };

  // Poll backend for new quotes as a safety net
  useEffect(() => {
    if (!autoProcess) return;

    const poll = async () => {
      try {
        const res = await fetch('/api/pipeline/new-quotes', {
          credentials: 'include',
        });
        if (!res.ok) return;
        const data = await res.json();
        const newQuotes: IncomingQuote[] = data.quotes ?? [];
        for (const q of newQuotes) {
          if (DecisionStore.getByProject(q.quoteId).length === 0) {
            processQuote(q);
          }
        }
      } catch {
        // Silent fail — pipeline polling is best-effort
      }
    };

    intervalRef.current = setInterval(poll, pollIntervalMs);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [autoProcess, pollIntervalMs]);

  // Listen for browser events (for same-app broadcasts)
  useEffect(() => {
    if (!autoProcess) return;

    const listener = (e: Event) => {
      const custom = e as CustomEvent<PipelineEvent>;
      if (custom.detail) handleEvent(custom.detail);
    };
    window.addEventListener('tk:pipeline', listener);
    return () => window.removeEventListener('tk:pipeline', listener);
  }, [autoProcess]);

  return {
    pendingCount,
    lastDecision,
    status,
    processQuote,
  };
}

/**
 * Broadcast a new quote/deal into the autonomous pipeline.
 * Call this from any page when a new deal is created.
 */
export function broadcastNewQuote(event: PipelineEvent) {
  window.dispatchEvent(new CustomEvent('tk:pipeline', { detail: event }));
}
