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
  MessageSquare, Bot, User, Clock, TrendingUp, Send, Filter,
  SmilePlus, Frown, Meh, Phone, BarChart3, Zap, FileText, RefreshCw,
} from "lucide-react";
import {
  ResponsiveContainer, PieChart, Pie, Cell, Legend, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line,
} from "recharts";

const API = "/api/whatsapp-ai";

const SENTIMENT_COLORS: Record<string, string> = {
  positive: "bg-green-500/20 text-green-400 border-green-500/30",
  neutral: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  negative: "bg-red-500/20 text-red-400 border-red-500/30",
};

const AI_MODE_COLORS: Record<string, string> = {
  auto: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  assisted: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  manual: "bg-gray-500/20 text-gray-400 border-gray-500/30",
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-500/20 text-green-400",
  pending: "bg-yellow-500/20 text-yellow-400",
  closed: "bg-gray-500/20 text-gray-400",
};

const PIE_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

interface Conversation {
  id: number;
  contact_name: string;
  phone: string;
  last_message: string;
  last_message_at: string;
  unread_count: number;
  sentiment: string;
  ai_mode: string;
  status: string;
}

interface Template {
  id: number;
  name: string;
  content: string;
  category: string;
  language: string;
  usage_count: number;
  status: string;
}

interface AIRule {
  id: number;
  name: string;
  trigger_type: string;
  trigger_value: string;
  action_type: string;
  action_value: string;
  is_active: boolean;
  success_count: number;
  failure_count: number;
}

interface DashboardStats {
  conversations_today: number;
  ai_handled: number;
  human_handled: number;
  avg_response_time_seconds: number;
  sentiment_distribution: { sentiment: string; count: number }[];
  messages_by_hour: { hour: string; sent: number; received: number }[];
}

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await authFetch(url, options);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export default function WhatsAppAIPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("conversations");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterAiMode, setFilterAiMode] = useState("all");
  const [filterUnread, setFilterUnread] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [bulkPhones, setBulkPhones] = useState("");

  const { data: stats } = useQuery<DashboardStats>({
    queryKey: ["whatsapp-stats"],
    queryFn: () => apiFetch(`${API}/stats`),
  });

  const { data: conversations = [], isLoading: loadingConversations } = useQuery<Conversation[]>({
    queryKey: ["whatsapp-conversations", filterStatus, filterAiMode, filterUnread],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filterStatus !== "all") params.set("status", filterStatus);
      if (filterAiMode !== "all") params.set("ai_mode", filterAiMode);
      if (filterUnread) params.set("unread", "true");
      return apiFetch(`${API}/conversations?${params}`);
    },
  });

  const { data: templates = [] } = useQuery<Template[]>({
    queryKey: ["whatsapp-templates"],
    queryFn: () => apiFetch(`${API}/templates`),
  });

  const { data: rules = [] } = useQuery<AIRule[]>({
    queryKey: ["whatsapp-rules"],
    queryFn: () => apiFetch(`${API}/rules`),
  });

  const { data: analytics } = useQuery<DashboardStats>({
    queryKey: ["whatsapp-analytics"],
    queryFn: () => apiFetch(`${API}/analytics`),
  });

  const sendTemplateMutation = useMutation({
    mutationFn: (payload: { phone: string; template_id: string }) =>
      apiFetch(`${API}/send-template`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-conversations"] });
      setTemplateDialogOpen(false);
    },
  });

  const bulkSendMutation = useMutation({
    mutationFn: (payload: { phones: string[]; template_id: string }) =>
      apiFetch(`${API}/bulk-send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-conversations"] });
      setBulkDialogOpen(false);
      setBulkPhones("");
    },
  });

  const filteredConversations = conversations.filter((c) =>
    !searchQuery ||
    c.contact_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.phone?.includes(searchQuery)
  );

  const sentimentData = stats?.sentiment_distribution?.map((s) => ({
    name: s.sentiment === "positive" ? "חיובי" : s.sentiment === "negative" ? "שלילי" : "ניטרלי",
    value: s.count,
  })) || [];

  const aiVsHumanData = [
    { name: "AI", value: stats?.ai_handled || 0 },
    { name: "אנושי", value: stats?.human_handled || 0 },
  ];

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <MessageSquare className="h-7 w-7 text-green-400" />
            ניהול WhatsApp AI
          </h1>
          <p className="text-sm text-gray-400 mt-1">ניהול שיחות, תבניות וכללי AI</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Send className="h-4 w-4" />
                שלח תבנית
              </Button>
            </DialogTrigger>
            <DialogContent dir="rtl">
              <DialogHeader>
                <DialogTitle>שליחת תבנית</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">מספר טלפון</label>
                  <Input placeholder="972501234567" id="send-phone" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">תבנית</label>
                  <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
                    <SelectTrigger><SelectValue placeholder="בחר תבנית" /></SelectTrigger>
                    <SelectContent>
                      {templates.map((t) => (
                        <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  className="w-full"
                  onClick={() => {
                    const phone = (document.getElementById("send-phone") as HTMLInputElement)?.value;
                    if (phone && selectedTemplate) {
                      sendTemplateMutation.mutate({ phone, template_id: selectedTemplate });
                    }
                  }}
                  disabled={sendTemplateMutation.isPending}
                >
                  {sendTemplateMutation.isPending ? "שולח..." : "שלח"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={bulkDialogOpen} onOpenChange={setBulkDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2 bg-green-600 hover:bg-green-700">
                <Zap className="h-4 w-4" />
                שליחה מרובה
              </Button>
            </DialogTrigger>
            <DialogContent dir="rtl">
              <DialogHeader>
                <DialogTitle>שליחה מרובה</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">מספרי טלפון (שורה לכל מספר)</label>
                  <textarea
                    className="w-full h-32 rounded-lg border border-border bg-muted/50 px-3 py-2 text-foreground text-sm"
                    value={bulkPhones}
                    onChange={(e) => setBulkPhones(e.target.value)}
                    placeholder={"972501234567\n972509876543"}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">תבנית</label>
                  <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
                    <SelectTrigger><SelectValue placeholder="בחר תבנית" /></SelectTrigger>
                    <SelectContent>
                      {templates.map((t) => (
                        <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  className="w-full bg-green-600 hover:bg-green-700"
                  onClick={() => {
                    const phones = bulkPhones.split("\n").map((p) => p.trim()).filter(Boolean);
                    if (phones.length && selectedTemplate) {
                      bulkSendMutation.mutate({ phones, template_id: selectedTemplate });
                    }
                  }}
                  disabled={bulkSendMutation.isPending}
                >
                  {bulkSendMutation.isPending ? "שולח..." : `שלח ל-${bulkPhones.split("\n").filter((p) => p.trim()).length} מספרים`}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-muted/50 border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400">שיחות היום</p>
                <p className="text-2xl font-bold text-foreground">{stats?.conversations_today || 0}</p>
              </div>
              <MessageSquare className="h-8 w-8 text-blue-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-muted/50 border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400">טופלו ע״י AI</p>
                <p className="text-2xl font-bold text-green-400">{stats?.ai_handled || 0}</p>
              </div>
              <Bot className="h-8 w-8 text-green-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-muted/50 border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400">טופלו ע״י נציג</p>
                <p className="text-2xl font-bold text-yellow-400">{stats?.human_handled || 0}</p>
              </div>
              <User className="h-8 w-8 text-yellow-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-muted/50 border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400">זמן תגובה ממוצע</p>
                <p className="text-2xl font-bold text-purple-400">
                  {stats?.avg_response_time_seconds
                    ? `${Math.round(stats.avg_response_time_seconds / 60)} דק׳`
                    : "—"}
                </p>
              </div>
              <Clock className="h-8 w-8 text-purple-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-muted/50">
          <TabsTrigger value="conversations">שיחות</TabsTrigger>
          <TabsTrigger value="templates">תבניות</TabsTrigger>
          <TabsTrigger value="rules">כללי AI</TabsTrigger>
          <TabsTrigger value="analytics">אנליטיקס</TabsTrigger>
        </TabsList>

        {/* Conversations Tab */}
        <TabsContent value="conversations" className="space-y-4">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex-1 min-w-[200px]">
              <Input
                placeholder="חיפוש לפי שם או טלפון..."
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
                <SelectItem value="active">פעיל</SelectItem>
                <SelectItem value="pending">ממתין</SelectItem>
                <SelectItem value="closed">סגור</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterAiMode} onValueChange={setFilterAiMode}>
              <SelectTrigger className="w-[140px] bg-muted/50 border-border">
                <SelectValue placeholder="מצב AI" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">כל המצבים</SelectItem>
                <SelectItem value="auto">אוטומטי</SelectItem>
                <SelectItem value="assisted">מסייע</SelectItem>
                <SelectItem value="manual">ידני</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant={filterUnread ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterUnread(!filterUnread)}
            >
              לא נקראו
            </Button>
          </div>

          {loadingConversations ? (
            <div className="text-center py-12 text-gray-400">טוען שיחות...</div>
          ) : (
            <div className="rounded-xl border border-border/50 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 border-border">
                    <TableHead className="text-right text-gray-300">איש קשר</TableHead>
                    <TableHead className="text-right text-gray-300">טלפון</TableHead>
                    <TableHead className="text-right text-gray-300">הודעה אחרונה</TableHead>
                    <TableHead className="text-center text-gray-300">לא נקראו</TableHead>
                    <TableHead className="text-center text-gray-300">סנטימנט</TableHead>
                    <TableHead className="text-center text-gray-300">מצב AI</TableHead>
                    <TableHead className="text-center text-gray-300">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredConversations.map((conv) => (
                    <TableRow key={conv.id} className="border-border/50 hover:bg-muted/30 cursor-pointer">
                      <TableCell className="font-medium text-foreground">{conv.contact_name}</TableCell>
                      <TableCell className="text-gray-300 font-mono text-sm" dir="ltr">{conv.phone}</TableCell>
                      <TableCell className="text-gray-400 max-w-[250px] truncate">{conv.last_message}</TableCell>
                      <TableCell className="text-center">
                        {conv.unread_count > 0 ? (
                          <Badge className="bg-red-500 text-foreground">{conv.unread_count}</Badge>
                        ) : (
                          <span className="text-gray-500">0</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className={SENTIMENT_COLORS[conv.sentiment] || SENTIMENT_COLORS.neutral}>
                          {conv.sentiment === "positive" ? "חיובי" : conv.sentiment === "negative" ? "שלילי" : "ניטרלי"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className={AI_MODE_COLORS[conv.ai_mode] || AI_MODE_COLORS.manual}>
                          {conv.ai_mode === "auto" ? "אוטומטי" : conv.ai_mode === "assisted" ? "מסייע" : "ידני"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge className={STATUS_COLORS[conv.status] || STATUS_COLORS.pending}>
                          {conv.status === "active" ? "פעיל" : conv.status === "closed" ? "סגור" : "ממתין"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredConversations.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                        לא נמצאו שיחות
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* Templates Tab */}
        <TabsContent value="templates" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">תבניות הודעות</h2>
            <Button variant="outline" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: ["whatsapp-templates"] })}>
              <RefreshCw className="h-4 w-4 ml-2" />
              רענן
            </Button>
          </div>
          <div className="rounded-xl border border-border/50 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 border-border">
                  <TableHead className="text-right text-gray-300">שם תבנית</TableHead>
                  <TableHead className="text-right text-gray-300">תוכן</TableHead>
                  <TableHead className="text-center text-gray-300">קטגוריה</TableHead>
                  <TableHead className="text-center text-gray-300">שפה</TableHead>
                  <TableHead className="text-center text-gray-300">שימושים</TableHead>
                  <TableHead className="text-center text-gray-300">סטטוס</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.map((tpl) => (
                  <TableRow key={tpl.id} className="border-border/50 hover:bg-muted/30">
                    <TableCell className="font-medium text-foreground">{tpl.name}</TableCell>
                    <TableCell className="text-gray-400 max-w-[300px] truncate">{tpl.content}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className="bg-purple-500/20 text-purple-400 border-purple-500/30">
                        {tpl.category}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center text-gray-300">{tpl.language}</TableCell>
                    <TableCell className="text-center text-gray-300 font-mono">{tpl.usage_count}</TableCell>
                    <TableCell className="text-center">
                      <Badge className={tpl.status === "approved" ? "bg-green-500/20 text-green-400" : "bg-yellow-500/20 text-yellow-400"}>
                        {tpl.status === "approved" ? "מאושר" : "ממתין"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {templates.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-gray-500">אין תבניות</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* AI Rules Tab */}
        <TabsContent value="rules" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">כללי AI אוטומטיים</h2>
            <Button variant="outline" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: ["whatsapp-rules"] })}>
              <RefreshCw className="h-4 w-4 ml-2" />
              רענן
            </Button>
          </div>
          <div className="rounded-xl border border-border/50 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 border-border">
                  <TableHead className="text-right text-gray-300">שם כלל</TableHead>
                  <TableHead className="text-center text-gray-300">סוג טריגר</TableHead>
                  <TableHead className="text-right text-gray-300">ערך טריגר</TableHead>
                  <TableHead className="text-center text-gray-300">סוג פעולה</TableHead>
                  <TableHead className="text-center text-gray-300">הצלחות</TableHead>
                  <TableHead className="text-center text-gray-300">כשלונות</TableHead>
                  <TableHead className="text-center text-gray-300">סטטוס</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map((rule) => (
                  <TableRow key={rule.id} className="border-border/50 hover:bg-muted/30">
                    <TableCell className="font-medium text-foreground">{rule.name}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className="bg-blue-500/20 text-blue-400 border-blue-500/30">
                        {rule.trigger_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-gray-400 max-w-[200px] truncate">{rule.trigger_value}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className="bg-orange-500/20 text-orange-400 border-orange-500/30">
                        {rule.action_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center text-green-400 font-mono">{rule.success_count}</TableCell>
                    <TableCell className="text-center text-red-400 font-mono">{rule.failure_count}</TableCell>
                    <TableCell className="text-center">
                      <Badge className={rule.is_active ? "bg-green-500/20 text-green-400" : "bg-gray-500/20 text-gray-400"}>
                        {rule.is_active ? "פעיל" : "מושבת"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {rules.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-gray-500">אין כללים</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Messages by Hour */}
            <Card className="bg-muted/50 border-border/50">
              <CardHeader>
                <CardTitle className="text-foreground text-base flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-blue-400" />
                  הודעות לפי שעה
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analytics?.messages_by_hour || []}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="hour" stroke="#9ca3af" fontSize={12} />
                      <YAxis stroke="#9ca3af" fontSize={12} />
                      <Tooltip
                        contentStyle={{ background: "#1f2937", border: "1px solid #374151", borderRadius: "8px" }}
                        labelStyle={{ color: "#d1d5db" }}
                      />
                      <Bar dataKey="sent" fill="#3b82f6" name="נשלחו" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="received" fill="#10b981" name="התקבלו" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* AI vs Human Pie */}
            <Card className="bg-muted/50 border-border/50">
              <CardHeader>
                <CardTitle className="text-foreground text-base flex items-center gap-2">
                  <Bot className="h-5 w-5 text-green-400" />
                  AI מול טיפול אנושי
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={aiVsHumanData}
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        dataKey="value"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      >
                        {aiVsHumanData.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ background: "#1f2937", border: "1px solid #374151", borderRadius: "8px" }} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Sentiment Distribution */}
            <Card className="bg-muted/50 border-border/50">
              <CardHeader>
                <CardTitle className="text-foreground text-base flex items-center gap-2">
                  <SmilePlus className="h-5 w-5 text-yellow-400" />
                  התפלגות סנטימנט
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={sentimentData}
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        dataKey="value"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      >
                        <Cell fill="#10b981" />
                        <Cell fill="#6b7280" />
                        <Cell fill="#ef4444" />
                      </Pie>
                      <Tooltip contentStyle={{ background: "#1f2937", border: "1px solid #374151", borderRadius: "8px" }} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Response Time Trend */}
            <Card className="bg-muted/50 border-border/50">
              <CardHeader>
                <CardTitle className="text-foreground text-base flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-purple-400" />
                  מגמת זמן תגובה
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={analytics?.messages_by_hour || []}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="hour" stroke="#9ca3af" fontSize={12} />
                      <YAxis stroke="#9ca3af" fontSize={12} />
                      <Tooltip contentStyle={{ background: "#1f2937", border: "1px solid #374151", borderRadius: "8px" }} />
                      <Line type="monotone" dataKey="sent" stroke="#8b5cf6" strokeWidth={2} dot={false} name="נשלחו" />
                      <Line type="monotone" dataKey="received" stroke="#ec4899" strokeWidth={2} dot={false} name="התקבלו" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
