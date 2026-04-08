import { ChevronRight, ChevronLeft, ChevronsRight, ChevronsLeft } from "lucide-react";
import type { UsePaginationReturn } from "@/hooks/use-smart-pagination";

interface SmartPaginationProps {
  pagination: UsePaginationReturn;
  className?: string;
}

export function SmartPagination({ pagination: p, className = "" }: SmartPaginationProps) {
  if (p.totalItems <= 0) return null;

  return (
    <div className={`flex items-center justify-between flex-wrap gap-3 py-3 px-1 ${className}`}>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>מציג</span>
        <span className="font-semibold text-foreground">{p.startIndex + 1}-{p.endIndex}</span>
        <span>מתוך</span>
        <span className="font-semibold text-foreground">{p.totalItems.toLocaleString("he-IL")}</span>
        <span className="mx-2">|</span>
        <select
          value={p.pageSize}
          onChange={e => p.setPageSize(Number(e.target.value))}
          className="border rounded-md px-2 py-1 text-sm bg-background"
        >
          {p.PAGE_SIZE_OPTIONS.map(s => (
            <option key={s} value={s}>{s} שורות</option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={p.firstPage}
          disabled={!p.hasPrev}
          className="p-1.5 rounded-md border hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="עמוד ראשון"
        >
          <ChevronsRight className="w-4 h-4" />
        </button>
        <button
          onClick={p.prevPage}
          disabled={!p.hasPrev}
          className="p-1.5 rounded-md border hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="הקודם"
        >
          <ChevronRight className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-0.5 mx-1">
          {p.visiblePages.map((pg, i) =>
            pg < 0 ? (
              <span key={`dots-${i}`} className="px-1 text-muted-foreground">...</span>
            ) : (
              <button
                key={pg}
                onClick={() => p.setPage(pg)}
                className={`min-w-[32px] h-8 rounded-md text-sm font-medium transition-colors ${
                  pg === p.page
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "hover:bg-accent border"
                }`}
              >
                {pg}
              </button>
            )
          )}
        </div>

        <button
          onClick={p.nextPage}
          disabled={!p.hasNext}
          className="p-1.5 rounded-md border hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="הבא"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button
          onClick={p.lastPage}
          disabled={!p.hasNext}
          className="p-1.5 rounded-md border hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="עמוד אחרון"
        >
          <ChevronsLeft className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
