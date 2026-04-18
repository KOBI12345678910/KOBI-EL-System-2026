import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Shield, AlertTriangle, Download, Upload } from "lucide-react";

const API_BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") + "/api";

interface IpRule {
  id: number;
  ip_address: string;
  rule_type: "whitelist" | "blacklist";
  description: string | null;
  is_active: boolean;
  created_at: string;
}

export default function IpManagementTab() {
  const { toast } = useToast();
  const [rules, setRules] = useState<IpRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [newIp, setNewIp] = useState("");
  const [newType, setNewType] = useState<"whitelist" | "blacklist">("blacklist");
  const [newDesc, setNewDesc] = useState("");
  const [filter, setFilter] = useState<"all" | "whitelist" | "blacklist">("all");
  const [blockedLog, setBlockedLog] = useState<any[]>([]);
  const [showLog, setShowLog] = useState(false);

  const getToken = () => localStorage.getItem("erp_auth_token");

  const loadRules = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/security/ip-rules`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) {
        const data = await res.json();
        setRules(data.data || []);
      }
    } catch (err) {
      toast({ title: "Failed to load IP rules", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, []);

  const loadBlockedLog = async () => {
    try {
      const res = await fetch(`${API_BASE}/security/blocked-attempts?limit=50`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) {
        const data = await res.json();
        setBlockedLog(data.data || []);
        setShowLog(true);
      }
    } catch {}
  };

  useEffect(() => { loadRules(); }, [loadRules]);

  const addRule = async () => {
    if (!newIp.trim()) { toast({ title: "Enter an IP address or CIDR range", variant: "destructive" }); return; }
    try {
      const res = await fetch(`${API_BASE}/security/ip-rules`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ ip_address: newIp.trim(), rule_type: newType, description: newDesc }),
      });
      if (res.ok) {
        toast({ title: "IP rule added" });
        setNewIp(""); setNewDesc("");
        loadRules();
      } else {
        const d = await res.json();
        toast({ title: d.error || "Failed", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", variant: "destructive" });
    }
  };

  const deleteRule = async (id: number) => {
    try {
      await fetch(`${API_BASE}/security/ip-rules/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      toast({ title: "Rule deleted" });
      loadRules();
    } catch {
      toast({ title: "Failed to delete", variant: "destructive" });
    }
  };

  const exportRules = () => {
    const data = JSON.stringify(rules.map(r => ({ ip_address: r.ip_address, rule_type: r.rule_type, description: r.description })), null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "ip-rules.json"; a.click();
    URL.revokeObjectURL(url);
  };

  const filtered = rules.filter(r => filter === "all" || r.rule_type === filter);
  const blacklistCount = rules.filter(r => r.rule_type === "blacklist").length;
  const whitelistCount = rules.filter(r => r.rule_type === "whitelist").length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4 text-red-500" />
            </div>
            <div>
              <div className="text-xl font-bold text-red-600">{blacklistCount}</div>
              <div className="text-xs text-muted-foreground">Blacklisted IPs</div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center">
              <Shield className="w-4 h-4 text-green-500" />
            </div>
            <div>
              <div className="text-xl font-bold text-green-600">{whitelistCount}</div>
              <div className="text-xs text-muted-foreground">Whitelisted IPs</div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm cursor-pointer hover:shadow-md transition-shadow" onClick={loadBlockedLog}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4 text-orange-500" />
            </div>
            <div>
              <div className="text-xs font-medium">View Blocked Log</div>
              <div className="text-xs text-muted-foreground">Click to see recent blocks</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Add IP Rule</CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={exportRules}>
                <Download className="w-3.5 h-3.5 mr-1" /> Export
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Input
              placeholder="IP address or CIDR (e.g. 192.168.1.1 or 10.0.0.0/8)"
              value={newIp}
              onChange={e => setNewIp(e.target.value)}
              className="flex-1 min-w-[180px]"
              onKeyDown={e => e.key === "Enter" && addRule()}
            />
            <Select value={newType} onValueChange={v => setNewType(v as any)}>
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="blacklist">Blacklist</SelectItem>
                <SelectItem value="whitelist">Whitelist</SelectItem>
              </SelectContent>
            </Select>
            <Input
              placeholder="Description (optional)"
              value={newDesc}
              onChange={e => setNewDesc(e.target.value)}
              className="flex-1 min-w-[150px]"
            />
            <Button onClick={addRule}>
              <Plus className="w-4 h-4 mr-1" /> Add
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Supports single IPs (192.168.1.1) and CIDR ranges (10.0.0.0/8). Whitelist mode blocks all IPs not on the list.
          </p>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">IP Rules ({filtered.length})</CardTitle>
            <div className="flex gap-1">
              {(["all", "whitelist", "blacklist"] as const).map(f => (
                <Button
                  key={f}
                  size="sm"
                  variant={filter === f ? "default" : "outline"}
                  onClick={() => setFilter(f)}
                  className="capitalize"
                >
                  {f}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No IP rules configured</div>
          ) : (
            <div className="divide-y">
              {filtered.map(rule => (
                <div key={rule.id} className="flex items-center gap-3 py-3">
                  <code className="font-mono text-sm flex-1">{rule.ip_address}</code>
                  <Badge variant={rule.rule_type === "blacklist" ? "destructive" : "default"}
                    className={rule.rule_type === "whitelist" ? "bg-green-100 text-green-800" : ""}>
                    {rule.rule_type}
                  </Badge>
                  {rule.description && <span className="text-xs text-muted-foreground flex-1">{rule.description}</span>}
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deleteRule(rule.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {showLog && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Recent Blocked Attempts</CardTitle>
              <Button size="sm" variant="ghost" onClick={() => setShowLog(false)}>Close</Button>
            </div>
          </CardHeader>
          <CardContent>
            {blockedLog.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">No blocked attempts in log</div>
            ) : (
              <div className="divide-y text-sm">
                {blockedLog.map((entry, i) => (
                  <div key={i} className="py-2 flex items-center gap-3 flex-wrap">
                    <code className="font-mono text-xs bg-muted px-2 py-0.5 rounded">{entry.ip_address}</code>
                    <span className="text-xs text-muted-foreground">{entry.reason}</span>
                    <span className="text-xs text-muted-foreground">{entry.request_method} {entry.request_path}</span>
                    <span className="text-xs text-muted-foreground ml-auto">{new Date(entry.created_at).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
