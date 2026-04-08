import { useState } from "react";
import { Calendar, FileDown, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";

export type PeriodType = "day" | "week" | "month" | "quarter" | "year" | "custom";

interface PeriodFilterProps {
  onExportCSV?: () => void;
  onExportPDF?: () => void;
  period: PeriodType;
  onPeriodChange: (period: PeriodType) => void;
  year: string;
  onYearChange: (year: string) => void;
  month?: string;
  onMonthChange?: (month: string) => void;
  quarter?: string;
  onQuarterChange?: (quarter: string) => void;
  customStart?: string;
  onCustomStartChange?: (date: string) => void;
  customEnd?: string;
  onCustomEndChange?: (date: string) => void;
}

const PERIOD_OPTIONS: { value: PeriodType; label: string }[] = [
  { value: "day", label: "יומי" },
  { value: "week", label: "שבועי" },
  { value: "month", label: "חודשי" },
  { value: "quarter", label: "רבעוני" },
  { value: "year", label: "שנתי" },
  { value: "custom", label: "טווח מותאם" },
];

const MONTH_OPTIONS = [
  { value: "1", label: "ינואר" }, { value: "2", label: "פברואר" }, { value: "3", label: "מרץ" },
  { value: "4", label: "אפריל" }, { value: "5", label: "מאי" }, { value: "6", label: "יוני" },
  { value: "7", label: "יולי" }, { value: "8", label: "אוגוסט" }, { value: "9", label: "ספטמבר" },
  { value: "10", label: "אוקטובר" }, { value: "11", label: "נובמבר" }, { value: "12", label: "דצמבר" },
];

export function usePeriodFilter() {
  const now = new Date();
  const [period, setPeriod] = useState<PeriodType>("year");
  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [quarter, setQuarter] = useState(String(Math.ceil((now.getMonth() + 1) / 3)));
  const [customStart, setCustomStart] = useState(now.toISOString().slice(0, 10));
  const [customEnd, setCustomEnd] = useState(now.toISOString().slice(0, 10));

  function buildQueryParams(): string {
    const params = new URLSearchParams();
    if (period === "custom") {
      params.set("startDate", customStart);
      params.set("endDate", customEnd);
    } else {
      params.set("period", period);
      params.set("year", year);
      if (period === "month") params.set("month", month);
      if (period === "quarter") params.set("quarter", quarter);
    }
    return params.toString();
  }

  return {
    period, setPeriod,
    year, setYear,
    month, setMonth,
    quarter, setQuarter,
    customStart, setCustomStart,
    customEnd, setCustomEnd,
    buildQueryParams,
    queryKey: [period, year, month, quarter, customStart, customEnd],
  };
}

export function exportPDF(title: string) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) return;
  const content = document.querySelector("[data-report-content]");
  if (!content) return;
  printWindow.document.write(`
    <!DOCTYPE html>
    <html dir="rtl" lang="he">
    <head>
      <meta charset="utf-8">
      <title>${title}</title>
      <style>
        body { font-family: Arial, sans-serif; direction: rtl; padding: 20px; color: #000; background: #fff; }
        h1 { font-size: 20px; margin-bottom: 16px; border-bottom: 2px solid #333; padding-bottom: 8px; }
        table { width: 100%; border-collapse: collapse; margin: 12px 0; }
        th, td { padding: 8px 12px; border: 1px solid #ddd; text-align: right; font-size: 12px; }
        th { background: #f5f5f5; font-weight: bold; }
        .stat-card { display: inline-block; padding: 12px 20px; margin: 4px; border: 1px solid #ddd; border-radius: 8px; min-width: 120px; text-align: center; }
        .stat-value { font-size: 18px; font-weight: bold; }
        .stat-label { font-size: 11px; color: #666; }
        .section-title { font-size: 16px; font-weight: bold; margin: 20px 0 8px; color: #333; }
        @media print { body { padding: 0; } }
      </style>
    </head>
    <body>
      <h1>${title}</h1>
      <p style="color: #666; font-size: 12px;">הופק בתאריך: ${new Date().toLocaleDateString("he-IL")}</p>
      ${content.innerHTML.replace(/bg-[^ "']+/g, "").replace(/text-[^ "']+/g, "").replace(/border-[^ "']+/g, "")}
    </body>
    </html>
  `);
  printWindow.document.close();
  setTimeout(() => { printWindow.print(); }, 500);
}

export default function PeriodFilter({
  onExportCSV, onExportPDF, period, onPeriodChange, year, onYearChange,
  month, onMonthChange, quarter, onQuarterChange,
  customStart, onCustomStartChange, customEnd, onCustomEndChange,
}: PeriodFilterProps) {
  return (
    <div className="flex flex-wrap gap-2 items-center">
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <Calendar className="w-3.5 h-3.5" />
        <span>תקופה:</span>
      </div>

      <Select value={period} onValueChange={(v) => onPeriodChange(v as PeriodType)}>
        <SelectTrigger className="w-28 h-8 text-xs bg-slate-800 border-slate-700">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="bg-slate-800 border-slate-700">
          {PERIOD_OPTIONS.map(opt => (
            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {(period === "year" || period === "month" || period === "quarter") && (
        <Select value={year} onValueChange={onYearChange}>
          <SelectTrigger className="w-20 h-8 text-xs bg-slate-800 border-slate-700">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-700">
            {[2024, 2025, 2026].map(y => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {period === "month" && onMonthChange && (
        <Select value={month || "1"} onValueChange={onMonthChange}>
          <SelectTrigger className="w-24 h-8 text-xs bg-slate-800 border-slate-700">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-700">
            {MONTH_OPTIONS.map(m => (
              <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {period === "quarter" && onQuarterChange && (
        <Select value={quarter || "1"} onValueChange={onQuarterChange}>
          <SelectTrigger className="w-20 h-8 text-xs bg-slate-800 border-slate-700">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-700">
            {[1, 2, 3, 4].map(q => (
              <SelectItem key={q} value={String(q)}>Q{q}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {period === "custom" && onCustomStartChange && onCustomEndChange && (
        <>
          <Input
            type="date"
            value={customStart}
            onChange={(e) => onCustomStartChange(e.target.value)}
            className="w-36 h-8 text-xs bg-slate-800 border-slate-700"
          />
          <span className="text-xs text-muted-foreground">עד</span>
          <Input
            type="date"
            value={customEnd}
            onChange={(e) => onCustomEndChange(e.target.value)}
            className="w-36 h-8 text-xs bg-slate-800 border-slate-700"
          />
        </>
      )}

      {(onExportCSV || onExportPDF) && (
        <div className="flex gap-1 mr-auto">
          {onExportCSV && (
            <Button variant="outline" size="sm" className="h-8 text-xs border-slate-600" onClick={onExportCSV}>
              <FileDown className="w-3.5 h-3.5 ml-1" /> CSV
            </Button>
          )}
          {onExportPDF && (
            <Button variant="outline" size="sm" className="h-8 text-xs border-slate-600" onClick={onExportPDF}>
              <Printer className="w-3.5 h-3.5 ml-1" /> PDF
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
