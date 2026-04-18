import { useState, type ReactNode } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, ChevronRight, ChevronLeft, MoreHorizontal, Loader2, type LucideIcon } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

interface Column {
  key: string;
  label: string;
  render?: (value: unknown, item: Record<string, unknown>) => ReactNode;
}

interface Action {
  label: string;
  icon?: LucideIcon;
  onClick: (item: Record<string, unknown>) => void;
  destructive?: boolean;
}

interface DataTableProps {
  data?: Record<string, unknown>[];
  columns?: Column[];
  searchPlaceholder?: string;
  onRowClick?: (item: Record<string, unknown>) => void;
  actions?: Action[];
  selectable?: boolean;
  selectedIds?: (string | number)[];
  onSelectionChange?: (ids: (string | number)[]) => void;
  pageSize?: number;
  emptyMessage?: string;
  isLoading?: boolean;
}

export default function DataTable({
  data = [],
  columns = [],
  searchPlaceholder = "חיפוש...",
  onRowClick,
  actions = [],
  selectable = false,
  selectedIds = [],
  onSelectionChange,
  pageSize = 10,
  emptyMessage = "לא נמצאו נתונים",
  isLoading = false,
}: DataTableProps) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  const filteredData = data.filter((item) =>
    columns.some((col) => {
      const value = item[col.key];
      if (typeof value === "string") return value.toLowerCase().includes(search.toLowerCase());
      return false;
    })
  );

  const totalPages = Math.ceil(filteredData.length / pageSize);
  const paginatedData = filteredData.slice(page * pageSize, (page + 1) * pageSize);

  const handleSelectAll = (checked: boolean) => {
    if (checked) onSelectionChange?.(paginatedData.map((item) => item.id as string | number));
    else onSelectionChange?.([]);
  };

  const handleSelectOne = (id: string | number, checked: boolean) => {
    if (checked) onSelectionChange?.([...selectedIds, id]);
    else onSelectionChange?.(selectedIds.filter((i) => i !== id));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          placeholder={searchPlaceholder}
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          className="pr-10 bg-white border-slate-200"
        />
      </div>
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50 hover:bg-slate-50">
              {selectable && (
                <TableHead className="w-12">
                  <Checkbox
                    checked={paginatedData.length > 0 && paginatedData.every((item) => selectedIds.includes(item.id as string | number))}
                    onCheckedChange={handleSelectAll}
                  />
                </TableHead>
              )}
              {columns.map((col) => (
                <TableHead key={col.key} className="text-slate-600 font-semibold">{col.label}</TableHead>
              ))}
              {actions.length > 0 && <TableHead className="w-12" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedData.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length + (selectable ? 1 : 0) + (actions.length > 0 ? 1 : 0)} className="text-center py-12 text-slate-400">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              paginatedData.map((item) => (
                <TableRow key={item.id as string} onClick={() => onRowClick?.(item)} className={onRowClick ? "cursor-pointer hover:bg-slate-50" : ""}>
                  {selectable && (
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox checked={selectedIds.includes(item.id as string | number)} onCheckedChange={(checked) => handleSelectOne(item.id as string | number, !!checked)} />
                    </TableCell>
                  )}
                  {columns.map((col) => (
                    <TableCell key={col.key}>{col.render ? col.render(item[col.key], item) : (item[col.key] as ReactNode)}</TableCell>
                  ))}
                  {actions.length > 0 && (
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="w-4 h-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {actions.map((action, i) => (
                            <DropdownMenuItem key={i} onClick={() => action.onClick(item)} className={action.destructive ? "text-red-600" : ""}>
                              {action.icon && <action.icon className="w-4 h-4 ml-2" />}
                              {action.label}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-500">{filteredData.length} תוצאות</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>
              <ChevronRight className="w-4 h-4" />
            </Button>
            <span className="text-sm text-slate-600">{page + 1} / {totalPages}</span>
            <Button variant="outline" size="icon" onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
