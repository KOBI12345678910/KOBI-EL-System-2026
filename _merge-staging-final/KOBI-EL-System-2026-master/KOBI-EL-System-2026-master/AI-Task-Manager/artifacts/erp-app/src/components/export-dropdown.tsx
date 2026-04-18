import { useState, useRef, useEffect } from "react";
import { Download, FileText, FileSpreadsheet, File } from "lucide-react";
import { exportToCSV, exportToExcel, exportToPDF } from "@/lib/export-utils";

interface ExportDropdownProps {
  data?: Record<string, any>[];
  headers?: Record<string, string>;
  filename?: string;
  className?: string;
  buttonClassName?: string;
  label?: string;
  compact?: boolean;
  onExport?: (type: string) => void;
}

export default function ExportDropdown({
  data,
  headers,
  filename,
  className = "",
  buttonClassName,
  label = "ייצוא",
  compact = false,
  onExport,
}: ExportDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const resolvedHeaders = headers && Object.keys(headers).length > 0
    ? headers
    : data && data.length > 0
      ? Object.keys(data[0]).filter(k => !k.startsWith("_")).reduce<Record<string, string>>((acc, k) => { acc[k] = k; return acc; }, {})
      : {};

  const handleExport = (format: "csv" | "excel" | "pdf") => {
    setOpen(false);
    if (onExport) {
      onExport(format);
      return;
    }
    if (!data || !filename) return;
    if (format === "csv") exportToCSV(data, resolvedHeaders, filename);
    else if (format === "excel") exportToExcel(data, resolvedHeaders, filename);
    else exportToPDF(data, resolvedHeaders, filename);
  };

  const btnClass = buttonClassName || "flex items-center gap-1.5 bg-slate-600 text-white px-3 py-2 rounded-lg hover:bg-slate-700 text-sm";

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button onClick={() => setOpen(!open)} className={btnClass}>
        <Download size={16} />
        {!compact && label}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40 sm:hidden" onClick={() => setOpen(false)} />
          <div className="fixed bottom-0 left-0 right-0 sm:absolute sm:bottom-auto sm:right-0 sm:left-auto sm:top-full sm:mt-1 bg-card border-t sm:border border-border sm:rounded-lg shadow-xl z-50 sm:min-w-[180px] py-1 sm:py-1">
            <div className="sm:hidden text-center text-xs text-muted-foreground py-2 border-b border-slate-100">ייצוא נתונים</div>
            <button
              onClick={() => handleExport("pdf")}
              className="w-full flex flex-row-reverse items-center gap-3 px-5 py-3.5 sm:py-2.5 sm:px-4 text-sm text-foreground hover:bg-blue-50 hover:text-blue-700 active:bg-blue-100 transition-colors justify-end"
            >
              <FileText size={18} className="text-red-500 sm:w-4 sm:h-4" />
              PDF ייצוא
            </button>
            <button
              onClick={() => handleExport("excel")}
              className="w-full flex flex-row-reverse items-center gap-3 px-5 py-3.5 sm:py-2.5 sm:px-4 text-sm text-foreground hover:bg-green-50 hover:text-green-700 active:bg-green-100 transition-colors justify-end"
            >
              <FileSpreadsheet size={18} className="text-green-600 sm:w-4 sm:h-4" />
              Excel ייצוא
            </button>
            <button
              onClick={() => handleExport("csv")}
              className="w-full flex flex-row-reverse items-center gap-3 px-5 py-3.5 sm:py-2.5 sm:px-4 text-sm text-foreground hover:bg-muted/30 hover:text-foreground active:bg-slate-100 transition-colors justify-end"
            >
              <File size={18} className="text-muted-foreground sm:w-4 sm:h-4" />
              CSV ייצוא
            </button>
            <button
              onClick={() => setOpen(false)}
              className="w-full sm:hidden flex items-center justify-center gap-2 px-5 py-3 text-sm text-muted-foreground border-t border-slate-100 mt-1"
            >
              ביטול
            </button>
          </div>
        </>
      )}
    </div>
  );
}
