// ProjectsListPage — /projects
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Search, FolderKanban, Eye } from "lucide-react";
import { formatCurrencyILS, formatHebrewDate, STATE_COLORS } from "./_list-helpers";

interface Project {
  id: number;
  project_number: string;
  project_name: string;
  customer_id: number | null;
  state: string;
  budget_amount: number;
  actual_cost: number;
  progress_percent: number;
  planned_start_date: string | null;
  planned_end_date: string | null;
}

export default function ProjectsListPage() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState<string>("all");

  const { data, isLoading, error } = useQuery({
    queryKey: ["execution", "projects", { q: search, state: stateFilter }],
    queryFn: () => {
      const sp = new URLSearchParams();
      if (search) sp.append("q", search);
      if (stateFilter !== "all") sp.append("state", stateFilter);
      sp.append("limit", "100");
      return authFetch(`/api/execution/projects?${sp.toString()}`);
    },
    staleTime: 60_000,
  });

  const projects: Project[] = (data?.data ?? []) as Project[];

  return (
    <div className="p-6 space-y-5" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FolderKanban className="h-7 w-7 text-primary" /> פרויקטים
        </h1>
        <Button onClick={() => navigate("/projects/new")}>
          <Plus className="h-4 w-4 ml-2" /> פרויקט חדש
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">חיפוש וסינון</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="חיפוש לפי שם או מספר…" className="pr-10" />
            </div>
            <Select value={stateFilter} onValueChange={setStateFilter}>
              <SelectTrigger className="w-[200px]"><SelectValue placeholder="סטטוס" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">כל הסטטוסים</SelectItem>
                <SelectItem value="draft">טיוטה</SelectItem>
                <SelectItem value="planning">תכנון</SelectItem>
                <SelectItem value="in_progress">בביצוע</SelectItem>
                <SelectItem value="on_hold">מושהה</SelectItem>
                <SelectItem value="completed">הושלם</SelectItem>
                <SelectItem value="closed">סגור</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-10 text-center text-muted-foreground">טוען פרויקטים…</div>
          ) : error ? (
            <div className="p-10 text-center text-red-600">שגיאה בטעינת פרויקטים</div>
          ) : projects.length === 0 ? (
            <div className="p-10 text-center text-muted-foreground">לא נמצאו פרויקטים</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>מספר</TableHead>
                  <TableHead>שם</TableHead>
                  <TableHead>סטטוס</TableHead>
                  <TableHead>תקציב</TableHead>
                  <TableHead>בוצע בפועל</TableHead>
                  <TableHead>התקדמות</TableHead>
                  <TableHead>תחילה מתוכננת</TableHead>
                  <TableHead>פעולות</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projects.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-xs">{p.project_number}</TableCell>
                    <TableCell className="font-medium">{p.project_name}</TableCell>
                    <TableCell>
                      <Badge className={STATE_COLORS[p.state] || "bg-gray-400"}>{p.state}</Badge>
                    </TableCell>
                    <TableCell>{formatCurrencyILS(p.budget_amount)}</TableCell>
                    <TableCell>{formatCurrencyILS(p.actual_cost)}</TableCell>
                    <TableCell>{Math.round(Number(p.progress_percent) || 0)}%</TableCell>
                    <TableCell>{formatHebrewDate(p.planned_start_date)}</TableCell>
                    <TableCell>
                      <Button size="sm" variant="ghost" onClick={() => navigate(`/projects/${p.id}`)}>
                        <Eye className="h-4 w-4 ml-1" /> תצוגה
                      </Button>
                    </TableCell>
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
