// ============================================================
// Shared compact list shell for comms pages — Hebrew RTL.
// Mirrors _GovernanceTable.tsx pattern.
// ============================================================
import { type ReactNode, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authJson } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RefreshCw, Search } from "lucide-react";

interface Col<T> {
  key: string;
  label: string;
  render?: (row: T) => ReactNode;
}

interface Props<T extends { id: number }> {
  title: string;
  apiPath: string;
  columns: Col<T>[];
  extraFilters?: ReactNode;
  searchParamName?: string;
  actions?: ReactNode;
  rowActions?: (row: T) => ReactNode;
}

export function CommsTable<T extends { id: number }>(p: Props<T>) {
  const [q, setQ] = useState("");
  const qs = useMemo(() => {
    const s = new URLSearchParams();
    if (q) s.set(p.searchParamName ?? "q", q);
    s.set("limit", "200");
    return s.toString();
  }, [q, p.searchParamName]);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: [p.apiPath, qs],
    queryFn: () => authJson(`${p.apiPath}?${qs}`),
    staleTime: 30_000,
  });

  const rows: T[] = (data?.data ?? data?.rows ?? []) as T[];

  return (
    <div className="space-y-4 p-4" dir="rtl">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>{p.title}</CardTitle>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute right-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="חיפוש…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="pr-8 w-64"
              />
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            {p.actions}
          </div>
        </CardHeader>
        <CardContent>
          {p.extraFilters}
          <Table>
            <TableHeader>
              <TableRow>
                {p.columns.map((c) => (
                  <TableHead key={c.key}>{c.label}</TableHead>
                ))}
                {p.rowActions && <TableHead>פעולות</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={p.columns.length + (p.rowActions ? 1 : 0)} className="text-center py-8">
                    טוען…
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={p.columns.length + (p.rowActions ? 1 : 0)} className="text-center py-8 text-muted-foreground">
                    אין נתונים
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow key={row.id}>
                    {p.columns.map((c) => (
                      <TableCell key={c.key}>
                        {c.render ? c.render(row) : ((row as unknown as Record<string, unknown>)[c.key] as ReactNode) ?? "—"}
                      </TableCell>
                    ))}
                    {p.rowActions && <TableCell>{p.rowActions(row)}</TableCell>}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export function CommsStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    // generic
    active: "bg-green-100 text-green-800",
    pending: "bg-yellow-100 text-yellow-800",
    // email/sms/whatsapp
    queued: "bg-gray-100 text-gray-800",
    sent: "bg-blue-100 text-blue-800",
    delivered: "bg-green-100 text-green-800",
    read: "bg-emerald-100 text-emerald-800",
    opened: "bg-emerald-100 text-emerald-800",
    clicked: "bg-teal-100 text-teal-800",
    bounced: "bg-red-100 text-red-800",
    failed: "bg-red-100 text-red-800",
    // notifications
    unread: "bg-yellow-100 text-yellow-800",
    archived: "bg-gray-100 text-gray-800",
    // tickets
    open: "bg-blue-100 text-blue-800",
    in_progress: "bg-indigo-100 text-indigo-800",
    waiting_customer: "bg-amber-100 text-amber-800",
    resolved: "bg-green-100 text-green-800",
    closed: "bg-gray-100 text-gray-800",
    // campaigns
    draft: "bg-gray-100 text-gray-800",
    scheduled: "bg-blue-100 text-blue-800",
    sending: "bg-indigo-100 text-indigo-800",
    completed: "bg-green-100 text-green-800",
    cancelled: "bg-gray-100 text-gray-800",
  };
  return <Badge className={map[status] ?? "bg-gray-100 text-gray-800"}>{status}</Badge>;
}

export function fmtDate(v: string | null | undefined): string {
  if (!v) return "—";
  try {
    return new Date(v).toLocaleString("he-IL");
  } catch {
    return "—";
  }
}
