// Generic list page used by the simpler execution pages.
// Provides search, filter dropdowns, pagination and a table with columns.
import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Search } from "lucide-react";
import { STATE_COLORS, formatHebrewDate } from "./_list-helpers";

export interface ListColumn {
  key: string;
  label: string;
  kind?: "text" | "date" | "state" | "badge" | "number" | "currency";
}

export interface FilterDef {
  key: string;
  label: string;
  options: { value: string; label: string }[];
}

interface GenericListPageProps {
  icon: ReactNode;
  title: string;
  endpoint: string;
  columns: ListColumn[];
  filters?: FilterDef[];
  searchPlaceholder?: string;
  onCreate?: () => void;
  createLabel?: string;
  onRowClick?: (row: Record<string, unknown>) => void;
}

export default function GenericListPage({
  icon,
  title,
  endpoint,
  columns,
  filters = [],
  searchPlaceholder = "חיפוש…",
  onCreate,
  createLabel = "חדש",
  onRowClick,
}: GenericListPageProps) {
  const [search, setSearch] = useState("");
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});

  const queryKey = ["execution-list", endpoint, search, filterValues] as const;
  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: () => {
      const sp = new URLSearchParams();
      if (search) sp.append("q", search);
      for (const [k, v] of Object.entries(filterValues)) {
        if (v && v !== "all") sp.append(k, v);
      }
      sp.append("limit", "100");
      return authFetch(`${endpoint}?${sp.toString()}`);
    },
    staleTime: 30_000,
  });

  const rows: Record<string, unknown>[] = (data?.data ?? []) as Record<string, unknown>[];

  const renderCell = (row: Record<string, unknown>, col: ListColumn): ReactNode => {
    const v = row[col.key];
    if (v == null) return "—";
    if (col.kind === "date") return formatHebrewDate(v as string);
    if (col.kind === "state" || col.kind === "badge") {
      return <Badge className={STATE_COLORS[String(v)] || "bg-gray-400"}>{String(v)}</Badge>;
    }
    if (col.kind === "currency") return `₪${Number(v).toLocaleString("he-IL")}`;
    if (typeof v === "boolean") return v ? "✓" : "—";
    return String(v);
  };

  return (
    <div className="p-6 space-y-5" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">{icon}{title}</h1>
        {onCreate && (
          <Button onClick={onCreate}>
            <Plus className="h-4 w-4 ml-2" /> {createLabel}
          </Button>
        )}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-lg">חיפוש וסינון</CardTitle></CardHeader>
        <CardContent>
          <div className="flex gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={searchPlaceholder} className="pr-10" />
            </div>
            {filters.map((f) => (
              <Select
                key={f.key}
                value={filterValues[f.key] ?? "all"}
                onValueChange={(v) => setFilterValues((old) => ({ ...old, [f.key]: v }))}
              >
                <SelectTrigger className="w-[200px]"><SelectValue placeholder={f.label} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">כל {f.label}</SelectItem>
                  {f.options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-10 text-center text-muted-foreground">טוען…</div>
          ) : error ? (
            <div className="p-10 text-center text-red-600">שגיאה בטעינה</div>
          ) : rows.length === 0 ? (
            <div className="p-10 text-center text-muted-foreground">לא נמצאו רשומות</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  {columns.map((c) => <TableHead key={c.key}>{c.label}</TableHead>)}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, idx) => (
                  <TableRow
                    key={String(row.id ?? idx)}
                    className={onRowClick ? "cursor-pointer" : ""}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                  >
                    {columns.map((c) => <TableCell key={c.key}>{renderCell(row, c)}</TableCell>)}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
