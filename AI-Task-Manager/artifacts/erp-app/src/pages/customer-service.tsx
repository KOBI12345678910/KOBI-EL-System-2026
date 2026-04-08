import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { authFetch } from "@/lib/utils";
import {
  Ticket, Clock, CheckCircle2, AlertTriangle, Star, Users, Brain,
  Plus, Search, MessageCircle, BookOpen, BarChart3, Shield, TrendingUp,
  Send, RefreshCw, ArrowUp, ArrowDown, Minus,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, Legend,
} from "recharts";

const API = "/api/customer-service";
const PIE_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

const PRIORITY_COLORS: Record<string, string> = {
  critical: "bg-red-600 text-foreground",
  high: "bg-orange-500/20 text-orange-400",
  medium: "bg-yellow-500/20 text-yellow-400",
  low: "bg-green-500/20 text-green-400",
};

const PRIORITY_LABELS: Record<string, string> = {
  critical: "קריטי",
  high: "גבוה",
  medium: "בינוני",
  low: "נמוך",
};

const STATUS_COLORS: Record<string, string> = {
  open: "bg-blue-500/20 text-blue-400",
  in_progress: "bg-yellow-500/20 text-yellow-400",
  waiting_customer: "bg-purple-500/20 text-purple-400",
  resolved: "bg-green-500/20 text-green-400",
  closed: "bg-gray-500/20 text-gray-400",
};

const STATUS_LABELS: Record<string, string> = {
  open: "פתוח",
  in_progress: "בטיפול",
  waiting_customer: "ממתין ללקוח",
  resolved: "נפתר",
  closed: "סגור",
};

const SLA_COLORS: Record<string, string> = {
  within: "text-green-400",
  warning: "text-yellow-400",
  breached: "text-red-400",
};

interface Ticket {
  id: number;
  ticket_number: string;
  customer_name: string;
  customer_email: string;
  subject: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  assigned_to: string;
  sla_status: string;
  sla_due_at: string;
  created_at: string;
  updated_at: string;
}

interface TicketComment {
  id: number;
  ticket_id: number;
  author: string;
  content: string;
  is_internal: boolean;
  created_at: string;
}

interface KBArticle {
  id: number;
  title: string;
  content: string;
  category: string;
  views: number;
  helpful_count: number;
}

interface KPIStats {
  open_tickets: number;
  avg_resolution_hours: number;
  sla_compliance_pct: number;
  avg_satisfaction: number;
  tickets_by_category: { category: string; count: number }[];
  tickets_by_priority: { priority: string; count: number }[];
  agent_performance: { agent: string; resolved: number; avg_hours: number; satisfaction: number }[];
  sla_by_category: { category: string; within: number; breached: number; compliance_pct: number }[];
}

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await authFetch(url, options);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export default function CustomerServicePage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("tickets");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [filterAssigned, setFilterAssigned] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [kbSearch, setKbSearch] = useState("");

  const [newTicket, setNewTicket] = useState({
    customer_name: "",
    customer_email: "",
    subject: "",
    description: "",
    category: "general",
    priority: "medium",
  });

  const { data: kpis } = useQuery<KPIStats>({
    queryKey: ["cs-kpis"],
    queryFn: () => apiFetch(`${API}/kpis`),
  });

  const { data: tickets = [], isLoading } = useQuery<Ticket[]>({
    queryKey: ["cs-tickets", filterStatus, filterCategory, filterPriority, filterAssigned],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filterStatus !== "all") params.set("status", filterStatus);
      if (filterCategory !== "all") params.set("category", filterCategory);
      if (filterPriority !== "all") params.set("priority", filterPriority);
      if (filterAssigned !== "all") params.set("assigned_to", filterAssigned);
      return apiFetch(`${API}/tickets?${params}`);
    },
  });

  const { data: ticketComments = [] } = useQuery<TicketComment[]>({
    queryKey: ["cs-ticket-comments", selectedTicket?.id],
    queryFn: () => apiFetch(`${API}/tickets/${selectedTicket!.id}/comments`),
    enabled: !!selectedTicket,
  });

  const { data: kbArticles = [] } = useQuery<KBArticle[]>({
    queryKey: ["cs-kb", kbSearch],
    queryFn: () => {
      const params = kbSearch ? `?q=${encodeURIComponent(kbSearch)}` : "";
      return apiFetch(`${API}/knowledge-base${params}`);
    },
  });

  const createTicketMutation = useMutation({
    mutationFn: (payload: typeof newTicket) =>
      apiFetch(`${API}/tickets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cs-tickets"] });
      queryClient.invalidateQueries({ queryKey: ["cs-kpis"] });
      setCreateDialogOpen(false);
      setNewTicket({ customer_name: "", customer_email: "", subject: "", description: "", category: "general", priority: "medium" });
    },
  });

  const addCommentMutation = useMutation({
    mutationFn: (payload: { ticket_id: number; content: string; is_internal: boolean }) =>
      apiFetch(`${API}/tickets/${payload.ticket_id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cs-ticket-comments"] });
      setNewComment("");
    },
  });

  const aiSuggestionMutation = useMutation({
    mutationFn: (ticketId: number) =>
      apiFetch<{ suggestion: string }>(`${API}/tickets/${ticketId}/ai-suggest`, { method: "POST" }),
  });

  const filteredTickets = tickets.filter((t) =>
    !searchQuery ||
    t.ticket_number?.includes(searchQuery) ||
    t.customer_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.subject?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Ticket className="h-7 w-7 text-blue-400" />
            שירות לקוחות ופניות
          </h1>
          <p className="text-sm text-gray-400 mt-1">ניהול פניות, מאגר ידע וביצועי נציגים</p>
        </div>
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 bg-blue-600 hover:bg-blue-700">
              <Plus className="h-4 w-4" />
              פנייה חדשה
            </Button>
          </DialogTrigger>
          <DialogContent dir="rtl" className="max-w-lg">
            <DialogHeader>
              <DialogTitle>יצירת פנייה חדשה</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">שם לקוח</label>
                  <Input value={newTicket.customer_name} onChange={(e) => setNewTicket({ ...newTicket, customer_name: e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">אימייל</label>
                  <Input type="email" value={newTicket.customer_email} onChange={(e) => setNewTicket({ ...newTicket, customer_email: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">נושא</label>
                <Input value={newTicket.subject} onChange={(e) => setNewTicket({ ...newTicket, subject: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">תיאור</label>
                <textarea
                  className="w-full h-24 rounded-lg border border-border bg-muted/50 px-3 py-2 text-foreground text-sm"
                  value={newTicket.description}
                  onChange={(e) => setNewTicket({ ...newTicket, description: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">קטגוריה</label>
                  <Select value={newTicket.category} onValueChange={(v) => setNewTicket({ ...newTicket, category: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="general">כללי</SelectItem>
                      <SelectItem value="billing">חיוב</SelectItem>
                      <SelectItem value="technical">טכני</SelectItem>
                      <SelectItem value="product">מוצר</SelectItem>
                      <SelectItem value="installation">התקנה</SelectItem>
                      <SelectItem value="complaint">תלונה</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">עדיפות</label>
                  <Select value={newTicket.priority} onValueChange={(v) => setNewTicket({ ...newTicket, priority: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">נמוך</SelectItem>
                      <SelectItem value="medium">בינוני</SelectItem>
                      <SelectItem value="high">גבוה</SelectItem>
                      <SelectItem value="critical">קריטי</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button
                className="w-full"
                onClick={() => createTicketMutation.mutate(newTicket)}
                disabled={createTicketMutation.isPending || !newTicket.subject}
              >
                {createTicketMutation.isPending ? "יוצר..." : "צור פנייה"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-muted/50 border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400">פניות פתוחות</p>
                <p className="text-2xl font-bold text-blue-400">{kpis?.open_tickets || 0}</p>
              </div>
              <Ticket className="h-8 w-8 text-blue-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-muted/50 border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400">זמן פתרון ממוצע</p>
                <p className="text-2xl font-bold text-yellow-400">{kpis?.avg_resolution_hours?.toFixed(1) || "—"} שעות</p>
              </div>
              <Clock className="h-8 w-8 text-yellow-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-muted/50 border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400">עמידה ב-SLA</p>
                <p className="text-2xl font-bold text-green-400">{kpis?.sla_compliance_pct?.toFixed(1) || "—"}%</p>
              </div>
              <Shield className="h-8 w-8 text-green-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-muted/50 border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400">שביעות רצון ממוצעת</p>
                <p className="text-2xl font-bold text-purple-400">{kpis?.avg_satisfaction?.toFixed(1) || "—"} / 5</p>
              </div>
              <Star className="h-8 w-8 text-purple-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-muted/50">
          <TabsTrigger value="tickets">פניות</TabsTrigger>
          <TabsTrigger value="knowledge-base">מאגר ידע</TabsTrigger>
          <TabsTrigger value="sla-report">דוח SLA</TabsTrigger>
          <TabsTrigger value="agents">ביצועי נציגים</TabsTrigger>
        </TabsList>

        {/* Tickets Tab */}
        <TabsContent value="tickets" className="space-y-4">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex-1 min-w-[200px]">
              <Input
                placeholder="חיפוש לפי מספר פנייה, שם לקוח או נושא..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-muted/50 border-border"
              />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[140px] bg-muted/50 border-border">
                <SelectValue placeholder="סטטוס" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">כל הסטטוסים</SelectItem>
                <SelectItem value="open">פתוח</SelectItem>
                <SelectItem value="in_progress">בטיפול</SelectItem>
                <SelectItem value="waiting_customer">ממתין ללקוח</SelectItem>
                <SelectItem value="resolved">נפתר</SelectItem>
                <SelectItem value="closed">סגור</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="w-[130px] bg-muted/50 border-border">
                <SelectValue placeholder="קטגוריה" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">כל הקטגוריות</SelectItem>
                <SelectItem value="general">כללי</SelectItem>
                <SelectItem value="billing">חיוב</SelectItem>
                <SelectItem value="technical">טכני</SelectItem>
                <SelectItem value="product">מוצר</SelectItem>
                <SelectItem value="installation">התקנה</SelectItem>
                <SelectItem value="complaint">תלונה</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterPriority} onValueChange={setFilterPriority}>
              <SelectTrigger className="w-[130px] bg-muted/50 border-border">
                <SelectValue placeholder="עדיפות" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">כל העדיפויות</SelectItem>
                <SelectItem value="low">נמוך</SelectItem>
                <SelectItem value="medium">בינוני</SelectItem>
                <SelectItem value="high">גבוה</SelectItem>
                <SelectItem value="critical">קריטי</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="text-center py-12 text-gray-400">טוען פניות...</div>
          ) : (
            <div className="rounded-xl border border-border/50 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 border-border">
                    <TableHead className="text-right text-gray-300">מספר</TableHead>
                    <TableHead className="text-right text-gray-300">לקוח</TableHead>
                    <TableHead className="text-right text-gray-300">נושא</TableHead>
                    <TableHead className="text-center text-gray-300">קטגוריה</TableHead>
                    <TableHead className="text-center text-gray-300">עדיפות</TableHead>
                    <TableHead className="text-center text-gray-300">סטטוס</TableHead>
                    <TableHead className="text-right text-gray-300">מוקצה ל</TableHead>
                    <TableHead className="text-center text-gray-300">SLA</TableHead>
                    <TableHead className="text-right text-gray-300">נוצר</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTickets.map((ticket) => (
                    <TableRow
                      key={ticket.id}
                      className="border-border/50 hover:bg-muted/30 cursor-pointer"
                      onClick={() => { setSelectedTicket(ticket); setDetailOpen(true); }}
                    >
                      <TableCell className="font-mono text-sm text-gray-300">{ticket.ticket_number}</TableCell>
                      <TableCell className="font-medium text-foreground">{ticket.customer_name}</TableCell>
                      <TableCell className="text-gray-300 max-w-[200px] truncate">{ticket.subject}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/30">{ticket.category}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge className={PRIORITY_COLORS[ticket.priority] || PRIORITY_COLORS.medium}>
                          {PRIORITY_LABELS[ticket.priority] || ticket.priority}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge className={STATUS_COLORS[ticket.status] || STATUS_COLORS.open}>
                          {STATUS_LABELS[ticket.status] || ticket.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-gray-300">{ticket.assigned_to || "—"}</TableCell>
                      <TableCell className="text-center">
                        <span className={SLA_COLORS[ticket.sla_status] || "text-gray-400"}>
                          {ticket.sla_status === "within" ? "תקין" : ticket.sla_status === "warning" ? "אזהרה" : ticket.sla_status === "breached" ? "חריגה" : "—"}
                        </span>
                      </TableCell>
                      <TableCell className="text-gray-400 text-sm">
                        {ticket.created_at ? new Date(ticket.created_at).toLocaleDateString("he-IL") : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredTickets.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8 text-gray-500">לא נמצאו פניות</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Ticket Detail Dialog */}
          <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
            <DialogContent dir="rtl" className="max-w-2xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <span>פנייה {selectedTicket?.ticket_number}</span>
                  {selectedTicket && (
                    <Badge className={PRIORITY_COLORS[selectedTicket.priority]}>
                      {PRIORITY_LABELS[selectedTicket.priority]}
                    </Badge>
                  )}
                </DialogTitle>
              </DialogHeader>
              {selectedTicket && (
                <div className="space-y-4 mt-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div><span className="text-gray-400">לקוח:</span> <span className="text-foreground mr-1">{selectedTicket.customer_name}</span></div>
                    <div><span className="text-gray-400">אימייל:</span> <span className="text-foreground mr-1">{selectedTicket.customer_email}</span></div>
                    <div><span className="text-gray-400">קטגוריה:</span> <span className="text-foreground mr-1">{selectedTicket.category}</span></div>
                    <div><span className="text-gray-400">מוקצה ל:</span> <span className="text-foreground mr-1">{selectedTicket.assigned_to || "—"}</span></div>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-gray-300 mb-1">נושא</h4>
                    <p className="text-foreground">{selectedTicket.subject}</p>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-gray-300 mb-1">תיאור</h4>
                    <p className="text-gray-400 text-sm">{selectedTicket.description}</p>
                  </div>

                  {/* AI Suggestion */}
                  <div className="border-t border-border pt-4">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() => aiSuggestionMutation.mutate(selectedTicket.id)}
                      disabled={aiSuggestionMutation.isPending}
                    >
                      <Brain className="h-4 w-4" />
                      {aiSuggestionMutation.isPending ? "חושב..." : "הצעת AI"}
                    </Button>
                    {aiSuggestionMutation.data?.suggestion && (
                      <div className="mt-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-sm text-blue-300">
                        <p className="font-medium mb-1">הצעת AI:</p>
                        <p>{aiSuggestionMutation.data.suggestion}</p>
                      </div>
                    )}
                  </div>

                  {/* Comments Timeline */}
                  <div className="border-t border-border pt-4">
                    <h4 className="text-sm font-medium text-gray-300 mb-3">היסטוריית תגובות</h4>
                    <div className="space-y-3 max-h-[200px] overflow-y-auto">
                      {ticketComments.map((comment) => (
                        <div
                          key={comment.id}
                          className={`p-3 rounded-lg text-sm ${
                            comment.is_internal
                              ? "bg-yellow-500/10 border border-yellow-500/20"
                              : "bg-muted/30 border border-border/30"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium text-foreground">{comment.author}</span>
                            <span className="text-xs text-gray-500">
                              {new Date(comment.created_at).toLocaleString("he-IL")}
                            </span>
                          </div>
                          <p className="text-gray-400">{comment.content}</p>
                          {comment.is_internal && (
                            <Badge variant="outline" className="mt-1 text-xs bg-yellow-500/10 text-yellow-400 border-yellow-500/30">
                              הערה פנימית
                            </Badge>
                          )}
                        </div>
                      ))}
                      {ticketComments.length === 0 && (
                        <p className="text-gray-500 text-center py-4">אין תגובות עדיין</p>
                      )}
                    </div>
                    <div className="flex gap-2 mt-3">
                      <Input
                        placeholder="כתוב תגובה..."
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        className="flex-1"
                      />
                      <Button
                        size="sm"
                        onClick={() => {
                          if (newComment.trim() && selectedTicket) {
                            addCommentMutation.mutate({
                              ticket_id: selectedTicket.id,
                              content: newComment,
                              is_internal: false,
                            });
                          }
                        }}
                        disabled={addCommentMutation.isPending}
                      >
                        <Send className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* Knowledge Base Tab */}
        <TabsContent value="knowledge-base" className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <Input
                placeholder="חיפוש במאגר הידע..."
                value={kbSearch}
                onChange={(e) => setKbSearch(e.target.value)}
                className="bg-muted/50 border-border"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {kbArticles.map((article) => (
              <Card key={article.id} className="bg-muted/50 border-border/50 hover:border-border transition-colors cursor-pointer">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/30 text-xs">
                      {article.category}
                    </Badge>
                    <span className="text-xs text-gray-500">{article.views} צפיות</span>
                  </div>
                  <CardTitle className="text-sm text-foreground mt-2">{article.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-gray-400 line-clamp-3">{article.content}</p>
                  <div className="flex items-center gap-1 mt-2 text-xs text-gray-500">
                    <Star className="h-3 w-3 text-yellow-400" />
                    <span>{article.helpful_count} מצאו מועיל</span>
                  </div>
                </CardContent>
              </Card>
            ))}
            {kbArticles.length === 0 && (
              <div className="col-span-3 text-center py-12 text-gray-500">לא נמצאו מאמרים</div>
            )}
          </div>
        </TabsContent>

        {/* SLA Report Tab */}
        <TabsContent value="sla-report" className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground">דוח עמידה ב-SLA לפי קטגוריה</h2>
          <div className="rounded-xl border border-border/50 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 border-border">
                  <TableHead className="text-right text-gray-300">קטגוריה</TableHead>
                  <TableHead className="text-center text-gray-300">בתוך SLA</TableHead>
                  <TableHead className="text-center text-gray-300">חריגות</TableHead>
                  <TableHead className="text-center text-gray-300">אחוז עמידה</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(kpis?.sla_by_category || []).map((row, i) => (
                  <TableRow key={i} className="border-border/50">
                    <TableCell className="font-medium text-foreground">{row.category}</TableCell>
                    <TableCell className="text-center text-green-400 font-mono">{row.within}</TableCell>
                    <TableCell className="text-center text-red-400 font-mono">{row.breached}</TableCell>
                    <TableCell className="text-center">
                      <Badge className={row.compliance_pct >= 90 ? "bg-green-500/20 text-green-400" : row.compliance_pct >= 70 ? "bg-yellow-500/20 text-yellow-400" : "bg-red-500/20 text-red-400"}>
                        {row.compliance_pct.toFixed(1)}%
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {(!kpis?.sla_by_category || kpis.sla_by_category.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-gray-500">אין נתונים</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* SLA Chart */}
          {kpis?.sla_by_category && kpis.sla_by_category.length > 0 && (
            <Card className="bg-muted/50 border-border/50">
              <CardContent className="pt-6">
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={kpis.sla_by_category}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="category" stroke="#9ca3af" fontSize={12} />
                      <YAxis stroke="#9ca3af" fontSize={12} />
                      <Tooltip contentStyle={{ background: "#1f2937", border: "1px solid #374151", borderRadius: "8px" }} />
                      <Bar dataKey="within" fill="#10b981" name="בתוך SLA" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="breached" fill="#ef4444" name="חריגות" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Agent Performance Tab */}
        <TabsContent value="agents" className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground">ביצועי נציגים</h2>
          <div className="rounded-xl border border-border/50 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 border-border">
                  <TableHead className="text-right text-gray-300">נציג</TableHead>
                  <TableHead className="text-center text-gray-300">פניות שנפתרו</TableHead>
                  <TableHead className="text-center text-gray-300">זמן ממוצע (שעות)</TableHead>
                  <TableHead className="text-center text-gray-300">שביעות רצון</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(kpis?.agent_performance || []).map((agent, i) => (
                  <TableRow key={i} className="border-border/50">
                    <TableCell className="font-medium text-foreground flex items-center gap-2">
                      <Users className="h-4 w-4 text-gray-500" />
                      {agent.agent}
                    </TableCell>
                    <TableCell className="text-center text-gray-300 font-mono">{agent.resolved}</TableCell>
                    <TableCell className="text-center text-gray-300 font-mono">{agent.avg_hours.toFixed(1)}</TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Star className="h-4 w-4 text-yellow-400" />
                        <span className="text-foreground">{agent.satisfaction.toFixed(1)}</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {(!kpis?.agent_performance || kpis.agent_performance.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-gray-500">אין נתונים</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Category Distribution Chart */}
          {kpis?.tickets_by_category && kpis.tickets_by_category.length > 0 && (
            <Card className="bg-muted/50 border-border/50">
              <CardHeader>
                <CardTitle className="text-base text-foreground">התפלגות פניות לפי קטגוריה</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={kpis.tickets_by_category}
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        dataKey="count"
                        nameKey="category"
                        label={({ category, percent }) => `${category} ${(percent * 100).toFixed(0)}%`}
                      >
                        {kpis.tickets_by_category.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ background: "#1f2937", border: "1px solid #374151", borderRadius: "8px" }} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
