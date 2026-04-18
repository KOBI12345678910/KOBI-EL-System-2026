import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw, AlertTriangle, CheckCircle, Clock, ArrowUpCircle, ArrowDownCircle, BarChart3, FileText } from "lucide-react";

const BASE = import.meta.env.BASE_URL;
const api = (path: string) => `${BASE}api${path}`;

async function fetchJSON(url: string, opts?: RequestInit) {
  const res = await fetch(url, { ...opts, headers: { "Content-Type": "application/json", ...(opts?.headers || {}) } });
  if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.message || `HTTP ${res.status}`); }
  return res.json();
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  sent: { label: "נשלח", color: "bg-blue-100 text-blue-700", icon: ArrowUpCircle },
  received: { label: "התקבל", color: "bg-sky-100 text-sky-700", icon: ArrowDownCircle },
  processed: { label: "עובד", color: "bg-green-100 text-green-700", icon: CheckCircle },
  failed: { label: "נכשל", color: "bg-red-100 text-red-700", icon: AlertTriangle },
  pending: { label: "ממתין", color: "bg-amber-100 text-amber-700", icon: Clock },
  quarantined: { label: "בהסגר", color: "bg-orange-100 text-orange-700", icon: AlertTriangle },
  queued: { label: "בתור", color: "bg-purple-100 text-purple-700", icon: Clock },
};

function StatCard({ title, value, icon: Icon, color }: { title: string; value: number; icon: any; color: string }) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold">{value}</p>
          </div>
          <div className={`p-2 rounded-lg ${color}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TransactionDetailDialog({ tx, onClose }: { tx: any; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const retryMutation = useMutation({
    mutationFn: () => fetchJSON(api(`/edi/transactions/${tx.id}/retry`), { method: "POST" }),
    onSuccess: () => { toast({ title: "ניסיון חוזר הופעל" }); qc.invalidateQueries({ queryKey: ["edi-transactions"] }); onClose(); },
    onError: (err: any) => toast({ title: "שגיאה", description: err.message, variant: "destructive" }),
  });

  const statusCfg = STATUS_CONFIG[tx.status] || { label: tx.status, color: "bg-gray-100 text-gray-700", icon: FileText };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>פרטי עסקת EDI #{tx.id}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><span className="text-muted-foreground">סוג מסמך:</span> <span className="font-medium">{tx.docTypeName || tx.docType}</span></div>
            <div><span className="text-muted-foreground">כיוון:</span> <span className="font-medium">{tx.direction === "outbound" ? "יוצא" : "נכנס"}</span></div>
            <div><span className="text-muted-foreground">סטטוס:</span> <Badge className={statusCfg.color}>{statusCfg.label}</Badge></div>
            <div><span className="text-muted-foreground">מספר בקרה:</span> <span className="font-mono text-xs">{tx.controlNumber || "—"}</span></div>
            <div><span className="text-muted-foreground">הפניה:</span> <span>{tx.referenceNumber || `${tx.referenceType} #${tx.referenceId}`}</span></div>
            <div><span className="text-muted-foreground">נסיונות חוזרים:</span> <span>{tx.retryCount}/{tx.maxRetries}</span></div>
          </div>

          {tx.errorMessage && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm font-medium text-red-700 mb-1">שגיאה</p>
              <p className="text-sm text-red-600">{tx.errorMessage}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 text-sm">
            {tx.sentAt && <div><span className="text-muted-foreground">נשלח:</span> <span>{new Date(tx.sentAt).toLocaleString("he-IL")}</span></div>}
            {tx.receivedAt && <div><span className="text-muted-foreground">התקבל:</span> <span>{new Date(tx.receivedAt).toLocaleString("he-IL")}</span></div>}
            {tx.acknowledgedAt && <div><span className="text-muted-foreground">אושר:</span> <span>{new Date(tx.acknowledgedAt).toLocaleString("he-IL")}</span></div>}
            {tx.processedAt && <div><span className="text-muted-foreground">עובד:</span> <span>{new Date(tx.processedAt).toLocaleString("he-IL")}</span></div>}
          </div>

          {tx.rawContent && (
            <div>
              <p className="text-sm font-medium mb-1">תוכן EDI</p>
              <pre className="bg-muted/30 rounded p-3 text-xs font-mono overflow-x-auto max-h-48 whitespace-pre-wrap">
                {tx.rawContent.slice(0, 2000)}{tx.rawContent.length > 2000 ? "..." : ""}
              </pre>
            </div>
          )}

          {(tx.status === "failed" || tx.status === "quarantined") && tx.retryCount < tx.maxRetries && (
            <Button onClick={() => retryMutation.mutate()} disabled={retryMutation.isPending} className="w-full">
              <RefreshCw className="h-4 w-4 ml-2" />
              {retryMutation.isPending ? "מנסה שוב..." : "נסה שוב"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function EdiDashboardPage() {
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterDirection, setFilterDirection] = useState("all");
  const [selectedTx, setSelectedTx] = useState<any>(null);
  const qc = useQueryClient();

  const { data: stats } = useQuery({ queryKey: ["edi-stats"], queryFn: () => fetchJSON(api("/edi/transactions/stats")), refetchInterval: 30000 });
  const { data: transactions = [], isLoading } = useQuery({ queryKey: ["edi-transactions"], queryFn: () => fetchJSON(api("/edi/transactions?limit=200")), refetchInterval: 30000 });
  const { data: analytics } = useQuery({ queryKey: ["edi-analytics"], queryFn: () => fetchJSON(api("/edi/analytics")) });

  const filtered = (transactions as any[]).filter((tx: any) => {
    if (filterStatus !== "all" && tx.status !== filterStatus) return false;
    if (filterDirection !== "all" && tx.direction !== filterDirection) return false;
    return true;
  });

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">מוניטור EDI</h1>
          <p className="text-muted-foreground">מעקב אחר כל עסקאות ה-EDI עם ספקים</p>
        </div>
        <Button variant="outline" onClick={() => { qc.invalidateQueries({ queryKey: ["edi-stats"] }); qc.invalidateQueries({ queryKey: ["edi-transactions"] }); }}>
          <RefreshCw className="h-4 w-4 ml-1" />
          רענן
        </Button>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          <StatCard title="סה״כ" value={stats.total} icon={FileText} color="bg-gray-100 text-gray-700" />
          <StatCard title="נשלח" value={stats.sent} icon={ArrowUpCircle} color="bg-blue-100 text-blue-600" />
          <StatCard title="נכנס" value={stats.received} icon={ArrowDownCircle} color="bg-sky-100 text-sky-600" />
          <StatCard title="עובד" value={stats.processed} icon={CheckCircle} color="bg-green-100 text-green-600" />
          <StatCard title="נכשל" value={stats.failed} icon={AlertTriangle} color="bg-red-100 text-red-600" />
          <StatCard title="ממתין" value={stats.pending} icon={Clock} color="bg-amber-100 text-amber-600" />
          <StatCard title="ממתין לאישור" value={stats.pendingAck} icon={Clock} color="bg-purple-100 text-purple-600" />
          <StatCard title="בהסגר" value={stats.quarantined} icon={AlertTriangle} color="bg-orange-100 text-orange-600" />
        </div>
      )}

      {analytics && analytics.byPartner?.length > 0 && (
        <div className="grid md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="h-4 w-4" /> פעילות לפי שותף
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {analytics.byPartner.slice(0, 5).map((p: any) => (
                  <div key={p.partnerId} className="flex items-center gap-3">
                    <span className="text-sm flex-1">{p.partnerName}</span>
                    <div className="flex gap-2 text-xs">
                      <span className="text-blue-600">{p.sent} נשלח</span>
                      <span className="text-green-600">{p.processed} עובד</span>
                      {p.failed > 0 && <span className="text-red-600">{p.failed} נכשל</span>}
                    </div>
                    <span className="text-sm font-medium w-8 text-left">{p.total}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4" /> לפי סוג מסמך
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {analytics.byDocType.map((dt: any) => (
                  <div key={dt.docType} className="flex items-center gap-3">
                    <Badge variant="outline" className="text-xs">{dt.docType}</Badge>
                    <span className="text-sm flex-1">{dt.docTypeName}</span>
                    <span className="text-sm font-medium">{dt.count}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">יומן עסקאות</CardTitle>
            <div className="flex gap-2">
              <Select value={filterDirection} onValueChange={setFilterDirection}>
                <SelectTrigger className="w-36 h-8 text-xs"><SelectValue placeholder="כיוון" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">כל הכיוונים</SelectItem>
                  <SelectItem value="outbound">יוצא</SelectItem>
                  <SelectItem value="inbound">נכנס</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-36 h-8 text-xs"><SelectValue placeholder="סטטוס" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">כל הסטטוסים</SelectItem>
                  {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                    <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-12 bg-muted/30 rounded animate-pulse" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">
              <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p>לא נמצאו עסקאות</p>
            </div>
          ) : (
            <div className="space-y-1">
              <div className="grid grid-cols-7 text-xs text-muted-foreground pb-2 border-b">
                <span>#</span>
                <span>סוג מסמך</span>
                <span>כיוון</span>
                <span>הפניה</span>
                <span>סטטוס</span>
                <span>נסיונות</span>
                <span>תאריך</span>
              </div>
              {filtered.slice(0, 100).map((tx: any) => {
                const cfg = STATUS_CONFIG[tx.status] || { label: tx.status, color: "bg-gray-100 text-gray-700", icon: FileText };
                const Icon = cfg.icon;
                return (
                  <div
                    key={tx.id}
                    className="grid grid-cols-7 text-sm py-2 border-b border-muted/30 hover:bg-muted/20 cursor-pointer transition-colors rounded"
                    onClick={() => setSelectedTx(tx)}
                  >
                    <span className="text-muted-foreground text-xs">#{tx.id}</span>
                    <span className="font-medium">{tx.docTypeName || tx.docType}</span>
                    <span className="flex items-center gap-1">
                      {tx.direction === "outbound"
                        ? <ArrowUpCircle className="h-3 w-3 text-blue-500" />
                        : <ArrowDownCircle className="h-3 w-3 text-sky-500" />}
                      <span className="text-xs">{tx.direction === "outbound" ? "יוצא" : "נכנס"}</span>
                    </span>
                    <span className="text-xs truncate">{tx.referenceNumber || `#${tx.referenceId}`}</span>
                    <span>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${cfg.color}`}>
                        <Icon className="h-3 w-3" />
                        {cfg.label}
                      </span>
                    </span>
                    <span className="text-xs text-muted-foreground">{tx.retryCount}/{tx.maxRetries}</span>
                    <span className="text-xs text-muted-foreground">{new Date(tx.createdAt).toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" })}</span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {selectedTx && <TransactionDetailDialog tx={selectedTx} onClose={() => setSelectedTx(null)} />}
    </div>
  );
}
