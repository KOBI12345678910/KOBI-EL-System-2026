import { useEffect, useRef } from "react";
import { Terminal, Trash2, Clock, Database, ChevronDown } from "lucide-react";
import { useState } from "react";

export interface TerminalEntry {
  id: number;
  type: "command" | "sql" | "output";
  command: string;
  output: string;
  timestamp: Date;
  duration?: number;
}

interface TerminalPanelProps {
  entries: TerminalEntry[];
  onClear: () => void;
}

export default function TerminalPanel({ entries, onClear }: TerminalPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [entries]);

  return (
    <div className="h-full flex flex-col bg-[#08080d]">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-purple-500/10 bg-[#0b0b14]">
        <Terminal className="w-3.5 h-3.5 text-emerald-400/60" />
        <span className="text-[11px] text-gray-300 flex-1">טרמינל</span>
        <span className="text-[9px] text-gray-600">{entries.length} פקודות</span>
        {entries.length > 0 && (
          <button onClick={onClear} className="p-0.5 rounded hover:bg-gray-800/50 text-gray-500 hover:text-red-400" title="נקה טרמינל">
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-2 space-y-2 font-mono text-[11px]">
        {entries.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <Terminal className="w-8 h-8 text-emerald-500/15 mx-auto mb-2" />
              <p className="text-[10px] text-gray-600">פלט פקודות יופיע כאן</p>
            </div>
          </div>
        ) : (
          entries.map(entry => (
            <TerminalEntryCard key={entry.id} entry={entry} />
          ))
        )}
      </div>
    </div>
  );
}

function TerminalEntryCard({ entry }: { entry: TerminalEntry }) {
  const [expanded, setExpanded] = useState(entry.output.length < 500);
  const isSql = entry.type === "sql";

  return (
    <div className="rounded-lg border border-gray-800/40 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 bg-[#0c0c16] text-right hover:bg-[#0e0e1a] transition-colors"
      >
        {isSql ? (
          <Database className="w-3 h-3 text-blue-400/60 flex-shrink-0" />
        ) : (
          <span className="text-emerald-400/80 flex-shrink-0">$</span>
        )}
        <span className="text-gray-300 truncate flex-1 text-right">{entry.command}</span>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {entry.duration !== undefined && (
            <span className="text-[9px] text-gray-600 flex items-center gap-0.5">
              <Clock className="w-2.5 h-2.5" />
              {entry.duration}ms
            </span>
          )}
          <span className="text-[9px] text-gray-700">
            {entry.timestamp.toLocaleTimeString("he-IL")}
          </span>
          <ChevronDown className={`w-2.5 h-2.5 text-gray-600 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </div>
      </button>
      {expanded && entry.output && (
        <div className="px-2.5 py-2 bg-[#090910] border-t border-gray-800/30 max-h-48 overflow-auto">
          <pre className="text-[10px] text-gray-400 whitespace-pre-wrap leading-relaxed">{entry.output}</pre>
        </div>
      )}
    </div>
  );
}
