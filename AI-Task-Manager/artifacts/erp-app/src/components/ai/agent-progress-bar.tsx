import { useState, useEffect } from "react";
import { Cpu, Loader2, CheckCircle2, XCircle, Wrench, FileText, Clock, Zap } from "lucide-react";

interface AgentProgressBarProps {
  status: "idle" | "working" | "done" | "error";
  toolCount: number;
  filesChanged: number;
  startedAt?: Date;
  completedAt?: Date;
  activeToolName?: string;
  totalAgents: number;
  runningAgents: number;
}

function formatDuration(start: Date, end?: Date): string {
  const ms = (end || new Date()).getTime() - start.getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

function TimeTicker({ start }: { start: Date }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return <>{formatDuration(start)}</>;
}

export default function AgentProgressBar({
  status, toolCount, filesChanged, startedAt, completedAt, activeToolName, totalAgents, runningAgents
}: AgentProgressBarProps) {
  const StatusIcon = status === "working" ? Loader2 :
    status === "done" ? CheckCircle2 :
    status === "error" ? XCircle : Cpu;

  const statusColor = status === "working" ? "text-amber-400" :
    status === "done" ? "text-emerald-400" :
    status === "error" ? "text-red-400" : "text-gray-500";

  const statusBg = status === "working" ? "bg-amber-500/8 border-amber-500/20" :
    status === "done" ? "bg-emerald-500/8 border-emerald-500/20" :
    status === "error" ? "bg-red-500/8 border-red-500/20" : "bg-gray-800/30 border-gray-700/20";

  const statusText = status === "working" ? (activeToolName ? `מריץ ${activeToolName}...` : "עובד...") :
    status === "done" ? "הושלם" :
    status === "error" ? "שגיאה" : "מוכן";

  return (
    <div className={`flex items-center gap-3 px-4 py-1.5 border-b ${statusBg} transition-all`}>
      <div className="flex items-center gap-1.5">
        <StatusIcon className={`w-3.5 h-3.5 ${statusColor} ${status === "working" ? "animate-spin" : ""}`} />
        <span className={`text-[11px] font-medium ${statusColor}`}>{statusText}</span>
      </div>

      <div className="h-3 w-px bg-gray-700/30" />

      {status === "working" && startedAt && (
        <div className="flex items-center gap-1">
          <Clock className="w-3 h-3 text-gray-600" />
          <span className="text-[10px] text-gray-500 font-mono">
            <TimeTicker start={startedAt} />
          </span>
        </div>
      )}

      {status === "done" && startedAt && (
        <div className="flex items-center gap-1">
          <Clock className="w-3 h-3 text-gray-600" />
          <span className="text-[10px] text-gray-500 font-mono">{formatDuration(startedAt, completedAt)}</span>
        </div>
      )}

      {toolCount > 0 && (
        <div className="flex items-center gap-1">
          <Wrench className="w-3 h-3 text-purple-500/50" />
          <span className="text-[10px] text-gray-500">{toolCount} כלים</span>
        </div>
      )}

      {filesChanged > 0 && (
        <div className="flex items-center gap-1">
          <FileText className="w-3 h-3 text-blue-500/50" />
          <span className="text-[10px] text-gray-500">{filesChanged} קבצים</span>
        </div>
      )}

      <div className="flex-1" />

      {totalAgents > 1 && (
        <div className="flex items-center gap-1">
          <Zap className="w-3 h-3 text-purple-500/50" />
          <span className="text-[10px] text-gray-500">{totalAgents} סוכנים</span>
          {runningAgents > 0 && (
            <span className="text-[10px] text-amber-400/80">({runningAgents} פעילים)</span>
          )}
        </div>
      )}
    </div>
  );
}
