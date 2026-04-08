import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Check, Lock, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { globalConfirm } from "@/components/confirm-dialog";
import { authFetch } from "@/lib/utils";

interface StatusDef {
  key: string;
  label: string;
  color: string;
  icon?: any;
}

interface Transition {
  from: string;
  to: string;
  label?: string;
  requireConfirm?: boolean;
  confirmMessage?: string;
  requireApproval?: boolean;
}

type TransitionsInput = Transition[] | Record<string, string[]>;

interface StatusTransitionProps {
  currentStatus: string;
  statuses: StatusDef[];
  transitions: TransitionsInput;
  onTransition: (newStatus: string) => Promise<void>;
  entityId: number;
  compact?: boolean;
}

function normalizeTransitions(transitions: TransitionsInput): Transition[] {
  if (Array.isArray(transitions)) return transitions;
  const result: Transition[] = [];
  for (const [from, toList] of Object.entries(transitions)) {
    if (Array.isArray(toList)) {
      for (const to of toList) {
        result.push({ from, to });
      }
    }
  }
  return result;
}

export default function StatusTransition({ currentStatus, statuses, transitions, onTransition, entityId, compact = false }: StatusTransitionProps) {
  const [transitioning, setTransitioning] = useState(false);

  const normalizedTransitions = normalizeTransitions(transitions);
  const available = normalizedTransitions.filter(t => t.from === currentStatus);
  const currentDef = statuses.find(s => s.key === currentStatus);

  const handleTransition = async (transition: Transition) => {
    if (transition.requireApproval) return;
    if (transition.requireConfirm) {
      const ok = await globalConfirm(transition.confirmMessage || `האם לשנות סטטוס ל"${statuses.find(s => s.key === transition.to)?.label || transition.to}"?`, { variant: "warning", title: "אישור שינוי סטטוס", confirmText: "אישור", requireTypedConfirm: false });
      if (!ok) return;
    }
    setTransitioning(true);
    try {
      await onTransition(transition.to);
    } catch {}
    setTransitioning(false);
  };

  if (compact) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        {currentDef && <Badge className={`${currentDef.color} text-xs`}>{currentDef.label}</Badge>}
        {available.map(t => {
          const toDef = statuses.find(s => s.key === t.to);
          return (
            <button key={t.to} onClick={() => handleTransition(t)} disabled={transitioning || t.requireApproval} className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs bg-muted hover:bg-muted/80 text-foreground transition-colors disabled:opacity-50">
              <ArrowRight className="w-3 h-3" />{t.label || toDef?.label || t.to}
              {t.requireApproval && <Lock className="w-3 h-3 text-yellow-400" />}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="bg-card border border-border/50 rounded-2xl p-4">
      <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2"><ArrowRight className="w-4 h-4 text-muted-foreground" />מעבר סטטוס</h3>
      <div className="flex items-center gap-2 flex-wrap mb-4">
        {statuses.map((s, i) => {
          const isCurrent = s.key === currentStatus;
          const isPast = statuses.findIndex(x => x.key === currentStatus) > i;
          return (
            <div key={s.key} className="flex items-center gap-1.5">
              {i > 0 && <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/40" />}
              <motion.div animate={{ scale: isCurrent ? 1.05 : 1 }} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ${isCurrent ? `${s.color} ring-2 ring-primary/30` : isPast ? "bg-muted/50 text-muted-foreground" : "bg-muted/20 text-muted-foreground/50"}`}>
                {isPast && <Check className="w-3 h-3" />}
                {s.label}
              </motion.div>
            </div>
          );
        })}
      </div>
      {available.length > 0 ? (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">פעולות זמינות:</span>
          {available.map(t => {
            const toDef = statuses.find(s => s.key === t.to);
            return (
              <button key={t.to} onClick={() => handleTransition(t)} disabled={transitioning || t.requireApproval} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${t.requireApproval ? "bg-yellow-500/20 text-yellow-400 cursor-not-allowed" : "bg-primary/20 text-primary hover:bg-primary/30"}`}>
                {t.requireApproval ? <Lock className="w-3.5 h-3.5" /> : <ArrowRight className="w-3.5 h-3.5" />}
                {t.label || toDef?.label || t.to}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="flex items-center gap-2 text-xs text-muted-foreground"><AlertCircle className="w-3.5 h-3.5" />אין מעברי סטטוס זמינים</div>
      )}
    </div>
  );
}
