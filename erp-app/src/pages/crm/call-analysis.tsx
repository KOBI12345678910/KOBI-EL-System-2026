import { useState, useEffect } from "react";
import {
  Phone, Mic, Search, BarChart3, AlertTriangle, Play, FileText,
  User, Clock, TrendingUp, ThumbsUp, ThumbsDown, Minus, RefreshCw,
  Filter, Eye, CheckCircle, XCircle, ChevronDown, Volume2, Zap
} from "lucide-react";
import { authFetch } from "@/lib/utils";

interface Recording {
  id: number;
  call_id: string;
  agent_id: number;
  agent_name: string;
  customer_phone: string;
  customer_name: string;
  direction: string;
  duration_seconds: number;
  recording_url: string;
  transcript_status: string;
  sentiment_label?: string;
  sentiment_score?: number;
  buy_intent_score?: number;
  quality_score?: number;
  created_at: string;
}

interface Transcript {
  id: number;
  full_text: string;
  segments: { speaker: string; text: string; timestamp_sec: number }[];
  word_count: number;
}

interface Insights {
  sentiment_score: number;
  sentiment_label: string;
  buy_intent_score: number;
  objections: { text: string; severity: string }[];
  commitments: { text: string; owner: string }[];
  action_items: { text: string; assignee: string; deadline: string }[];
  key_topics: string[];
  quality_score: number;
  flags: string[];
}

interface Alert {
  id: number;
  recording_id: number;
  agent_name: string;
  customer_name: string;
  alert_type: string;
  severity: string;
  description: string;
  status: string;
  created_at: string;
}

interface DashboardData {
  total_recordings: number;
  recordings_today: number;
  avg_quality_score: number;
  sentiment_distribution: { sentiment_label: string; count: number }[];
  open_alerts: number;
  top_agents: { agent_name: string; calls: number; avg_quality: number }[];
}

const SENTIMENT_ICON: Record<string, any> = { positive: ThumbsUp, negative: ThumbsDown, neutral: Minus };
const SENTIMENT_COLOR: Record<string, string> = { positive: "text-green-600", negative: "text-red-600", neutral: "text-gray-500" };
const SEVERITY_COLOR: Record<string, string> = { low: "bg-blue-100 text-blue-700", medium: "bg-yellow-100 text-yellow-700", high: "bg-orange-100 text-orange-700", critical: "bg-red-100 text-red-700" };
const ALERT_LABELS: Record<string, string> = { negative_sentiment: "סנטימנט שלילי", false_promise: "הבטחה שקרית", pricing_below_cost: "מחיר מתחת לעלות", inappropriate: "לא הולם", no_followup_scheduled: "ללא מעקב" };

function formatDuration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function CallAnalysisPage() {
  const [tab, setTab] = useState<"recordings" | "alerts" | "search" | "dashboard">("recordings");
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [selectedRec, setSelectedRec] = useState<Recording | null>(null);
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [insights, setInsights] = useState<Insights | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [filterDir, setFilterDir] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);

  const token = localStorage.getItem("erp_token") || "";

  useEffect(() => { loadRecordings(); }, [filterDir, filterStatus]);
  useEffect(() => { if (tab === "alerts") loadAlerts(); }, [tab]);
  useEffect(() => { if (tab === "dashboard") loadDashboard(); }, [tab]);

  async function loadRecordings() {
    setLoading(true);
    try {
      let url = `/api/call-analysis/recordings?token=${token}`;
      if (filterDir) url += `&direction=${filterDir}`;
      if (filterStatus) url += `&status=${filterStatus}`;
      const r = await authFetch(url); const d = await r.json();
      setRecordings(d.recordings || []);
    } catch { setRecordings([]); }
    setLoading(false);
  }

  async function selectRecording(rec: Recording) {
    setSelectedRec(rec); setTranscript(null); setInsights(null);
    try {
      const [tRes, iRes] = await Promise.all([
        authFetch(`/api/call-analysis/${rec.id}/transcript?token=${token}`),
        authFetch(`/api/call-analysis/${rec.id}/insights?token=${token}`),
      ]);
      const tData = await tRes.json(); setTranscript(tData.transcript || null);
      const iData = await iRes.json(); setInsights(iData.insights || null);
    } catch {}
  }

  async function transcribeRecording(id: number) {
    setProcessing(true);
    try {
      await authFetch(`/api/call-analysis/${id}/transcribe?token=${token}`, { method: "POST" });
      await loadRecordings();
      if (selectedRec?.id === id) selectRecording({ ...selectedRec!, transcript_status: "completed" });
    } catch {}
    setProcessing(false);
  }

  async function analyzeRecording(id: number) {
    setProcessing(true);
    try {
      await authFetch(`/api/call-analysis/${id}/analyze?token=${token}`, { method: "POST" });
      if (selectedRec?.id === id) selectRecording(selectedRec!);
      await loadRecordings();
    } catch {}
    setProcessing(false);
  }

  async function doSearch() {
    if (!searchQuery.trim()) return;
    try {
      const r = await authFetch(`/api/call-analysis/search?token=${token}&q=${encodeURIComponent(searchQuery)}`);
      const d = await r.json(); setSearchResults(d.results || []);
    } catch { setSearchResults([]); }
  }

  async function loadAlerts() {
    try { const r = await authFetch(`/api/call-analysis/alerts?token=${token}`); const d = await r.json(); setAlerts(d.alerts || []); } catch {}
  }

  async function updateAlert(id: number, status: string) {
    try {
      await authFetch(`/api/call-analysis/alerts/${id}?token=${token}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
      });
      loadAlerts();
    } catch {}
  }

  async function loadDashboard() {
    try { const r = await authFetch(`/api/call-analysis/dashboard?token=${token}`); const d = await r.json(); setDashboard(d); } catch {}
  }

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      <div className="p-4 bg-white border-b shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Phone className="w-7 h-7 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-800">ניתוח הקלטות שיחה</h1>
          </div>
          <div className="flex gap-2">
            {(["recordings", "alerts", "search", "dashboard"] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${tab === t ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}>
                {t === "recordings" ? "הקלטות" : t === "alerts" ? "התראות" : t === "search" ? "חיפוש" : "דשבורד"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {tab === "recordings" && (
        <div className="flex h-[calc(100vh-80px)]">
          {/* Recording list */}
          <div className="w-[420px] bg-white border-l overflow-y-auto">
            <div className="p-3 border-b flex gap-2">
              <select value={filterDir} onChange={e => setFilterDir(e.target.value)} className="flex-1 text-xs border rounded px-2 py-1.5">
                <option value="">כל הכיוונים</option><option value="inbound">נכנסת</option><option value="outbound">יוצאת</option>
              </select>
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="flex-1 text-xs border rounded px-2 py-1.5">
                <option value="">כל הסטטוסים</option><option value="pending">ממתין</option><option value="completed">תומלל</option>
              </select>
            </div>
            {loading && <div className="p-4 text-center text-gray-400">טוען...</div>}
            {recordings.map(rec => {
              const SIcon = SENTIMENT_ICON[rec.sentiment_label || "neutral"] || Minus;
              const sColor = SENTIMENT_COLOR[rec.sentiment_label || "neutral"] || "text-gray-400";
              return (
                <div key={rec.id} onClick={() => selectRecording(rec)}
                  className={`p-3 border-b cursor-pointer hover:bg-blue-50 transition ${selectedRec?.id === rec.id ? "bg-blue-50 border-r-4 border-r-blue-500" : ""}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <SIcon className={`w-4 h-4 ${sColor}`} />
                      <span className="font-semibold text-sm">{rec.customer_name || rec.customer_phone || "—"}</span>
                    </div>
                    <span className="text-xs text-gray-400">{formatDuration(rec.duration_seconds)}</span>
                  </div>
                  <div className="flex items-center justify-between mt-1 text-xs text-gray-500">
                    <span>{rec.agent_name || "—"}</span>
                    <div className="flex items-center gap-2">
                      {rec.quality_score && <span className="px-1.5 py-0.5 bg-blue-50 rounded text-blue-700">Q:{rec.quality_score}</span>}
                      {rec.buy_intent_score != null && <span className="px-1.5 py-0.5 bg-green-50 rounded text-green-700">{Math.round((rec.buy_intent_score || 0) * 100)}%</span>}
                      <span className={`px-1.5 py-0.5 rounded ${rec.transcript_status === "completed" ? "bg-green-100 text-green-700" : "bg-gray-100"}`}>
                        {rec.transcript_status === "completed" ? "תומלל" : "ממתין"}
                      </span>
                    </div>
                  </div>
                  <div className="text-xs text-gray-400 mt-1">
                    {rec.direction === "inbound" ? "נכנסת" : "יוצאת"} | {new Date(rec.created_at).toLocaleDateString("he-IL")}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Detail panel */}
          <div className="flex-1 overflow-y-auto">
            {selectedRec ? (
              <div className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold">שיחה #{selectedRec.call_id || selectedRec.id}</h2>
                  <div className="flex gap-2">
                    {selectedRec.transcript_status !== "completed" && (
                      <button onClick={() => transcribeRecording(selectedRec.id)} disabled={processing}
                        className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
                        <Mic className="w-4 h-4" /> תמלל
                      </button>
                    )}
                    {selectedRec.transcript_status === "completed" && !insights && (
                      <button onClick={() => analyzeRecording(selectedRec.id)} disabled={processing}
                        className="flex items-center gap-1 px-3 py-1.5 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50">
                        <Zap className="w-4 h-4" /> נתח
                      </button>
                    )}
                  </div>
                </div>

                {/* Insights */}
                {insights && (
                  <div className="grid grid-cols-4 gap-3">
                    <div className="bg-white p-3 rounded-xl shadow-sm text-center">
                      {(() => { const SI = SENTIMENT_ICON[insights.sentiment_label] || Minus; return <SI className={`w-6 h-6 mx-auto mb-1 ${SENTIMENT_COLOR[insights.sentiment_label]}`} />; })()}
                      <div className="text-sm font-semibold">{insights.sentiment_label === "positive" ? "חיובי" : insights.sentiment_label === "negative" ? "שלילי" : "ניטרלי"}</div>
                      <div className="text-xs text-gray-500">סנטימנט: {(insights.sentiment_score * 100).toFixed(0)}%</div>
                    </div>
                    <div className="bg-white p-3 rounded-xl shadow-sm text-center">
                      <TrendingUp className="w-6 h-6 mx-auto text-green-600 mb-1" />
                      <div className="text-sm font-semibold">{Math.round(insights.buy_intent_score * 100)}%</div>
                      <div className="text-xs text-gray-500">כוונת רכישה</div>
                    </div>
                    <div className="bg-white p-3 rounded-xl shadow-sm text-center">
                      <BarChart3 className="w-6 h-6 mx-auto text-blue-600 mb-1" />
                      <div className="text-sm font-semibold">{insights.quality_score}</div>
                      <div className="text-xs text-gray-500">ציון איכות</div>
                    </div>
                    <div className="bg-white p-3 rounded-xl shadow-sm text-center">
                      <FileText className="w-6 h-6 mx-auto text-purple-600 mb-1" />
                      <div className="text-sm font-semibold">{insights.key_topics.length}</div>
                      <div className="text-xs text-gray-500">נושאים</div>
                    </div>
                  </div>
                )}

                {/* Key topics */}
                {insights && insights.key_topics.length > 0 && (
                  <div className="bg-white p-4 rounded-xl shadow-sm">
                    <h3 className="font-bold text-sm mb-2">נושאים מרכזיים</h3>
                    <div className="flex flex-wrap gap-2">
                      {insights.key_topics.map((t, i) => (
                        <span key={i} className="px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-sm">{t}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Action items & commitments */}
                {insights && (
                  <div className="grid grid-cols-2 gap-4">
                    {insights.action_items.length > 0 && (
                      <div className="bg-white p-4 rounded-xl shadow-sm">
                        <h3 className="font-bold text-sm mb-2">משימות</h3>
                        {insights.action_items.map((a, i) => (
                          <div key={i} className="flex items-center gap-2 py-1 text-sm">
                            <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                            <span>{a.text}</span>
                            <span className="text-xs text-gray-400 mr-auto">{a.assignee}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {insights.commitments.length > 0 && (
                      <div className="bg-white p-4 rounded-xl shadow-sm">
                        <h3 className="font-bold text-sm mb-2">התחייבויות</h3>
                        {insights.commitments.map((c, i) => (
                          <div key={i} className="flex items-center gap-2 py-1 text-sm">
                            <FileText className="w-4 h-4 text-blue-500 shrink-0" />
                            <span>{c.text}</span>
                            <span className="text-xs text-gray-400 mr-auto">{c.owner}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Transcript */}
                {transcript && (
                  <div className="bg-white p-4 rounded-xl shadow-sm">
                    <h3 className="font-bold text-sm mb-3">תמלול ({transcript.word_count} מילים)</h3>
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {(transcript.segments || []).map((seg, i) => (
                        <div key={i} className="flex gap-3 py-1">
                          <div className="text-xs text-gray-400 w-12 shrink-0 pt-0.5">{formatDuration(seg.timestamp_sec)}</div>
                          <div>
                            <span className="font-semibold text-sm text-blue-700">{seg.speaker}:</span>
                            <span className="text-sm mr-1">{seg.text}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-400">
                <div className="text-center">
                  <Volume2 className="w-16 h-16 mx-auto mb-3 opacity-30" />
                  <p>בחר הקלטה מהרשימה</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "alerts" && (
        <div className="p-6 max-w-4xl mx-auto">
          <h2 className="text-xl font-bold mb-4">התראות ({alerts.filter(a => a.status === "open").length} פתוחות)</h2>
          <div className="space-y-3">
            {alerts.map(a => (
              <div key={a.id} className={`bg-white p-4 rounded-xl shadow-sm border-r-4 ${a.severity === "critical" ? "border-r-red-500" : a.severity === "high" ? "border-r-orange-500" : "border-r-yellow-400"}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className={`w-5 h-5 ${a.severity === "critical" ? "text-red-600" : "text-orange-500"}`} />
                    <span className="font-semibold text-sm">{ALERT_LABELS[a.alert_type] || a.alert_type}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${SEVERITY_COLOR[a.severity] || "bg-gray-100"}`}>{a.severity}</span>
                  </div>
                  <div className="flex gap-1">
                    {a.status === "open" && (
                      <>
                        <button onClick={() => updateAlert(a.id, "reviewed")} className="px-2 py-1 bg-blue-50 text-blue-700 rounded text-xs hover:bg-blue-100">נבדק</button>
                        <button onClick={() => updateAlert(a.id, "dismissed")} className="px-2 py-1 bg-gray-50 text-gray-600 rounded text-xs hover:bg-gray-100">בטל</button>
                      </>
                    )}
                    <span className={`px-2 py-1 rounded text-xs ${a.status === "open" ? "bg-red-50 text-red-700" : "bg-gray-100 text-gray-500"}`}>{a.status}</span>
                  </div>
                </div>
                <p className="text-sm text-gray-600 mt-2">{a.description}</p>
                <div className="text-xs text-gray-400 mt-1">{a.agent_name} | {a.customer_name} | {new Date(a.created_at).toLocaleDateString("he-IL")}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "search" && (
        <div className="p-6 max-w-4xl mx-auto">
          <h2 className="text-xl font-bold mb-4">חיפוש בתמלולים</h2>
          <div className="flex gap-2 mb-4">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-2.5 w-5 h-5 text-gray-400" />
              <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && doSearch()}
                placeholder="חפש מילים בתמלולים..." className="w-full pr-10 pl-4 py-2 border rounded-lg" />
            </div>
            <button onClick={doSearch} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">חפש</button>
          </div>
          <div className="space-y-3">
            {searchResults.map((r, i) => (
              <div key={i} className="bg-white p-4 rounded-xl shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm">{r.agent_name} - {r.customer_name}</span>
                  <span className="text-xs text-gray-400">{new Date(r.created_at).toLocaleDateString("he-IL")}</span>
                </div>
                {r.highlight && <p className="text-sm text-gray-700 mt-2" dangerouslySetInnerHTML={{ __html: r.highlight }} />}
              </div>
            ))}
            {searchResults.length === 0 && searchQuery && <p className="text-gray-400 text-center">לא נמצאו תוצאות</p>}
          </div>
        </div>
      )}

      {tab === "dashboard" && dashboard && (
        <div className="p-6 max-w-5xl mx-auto">
          <h2 className="text-xl font-bold mb-4">דשבורד שיחות</h2>
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="bg-white p-4 rounded-xl shadow-sm text-center">
              <Phone className="w-6 h-6 mx-auto text-blue-600 mb-1" />
              <div className="text-2xl font-bold">{dashboard.total_recordings}</div>
              <div className="text-xs text-gray-500">סה"כ הקלטות</div>
            </div>
            <div className="bg-white p-4 rounded-xl shadow-sm text-center">
              <Mic className="w-6 h-6 mx-auto text-green-600 mb-1" />
              <div className="text-2xl font-bold">{dashboard.recordings_today}</div>
              <div className="text-xs text-gray-500">הקלטות היום</div>
            </div>
            <div className="bg-white p-4 rounded-xl shadow-sm text-center">
              <BarChart3 className="w-6 h-6 mx-auto text-purple-600 mb-1" />
              <div className="text-2xl font-bold">{dashboard.avg_quality_score}</div>
              <div className="text-xs text-gray-500">ציון איכות ממוצע</div>
            </div>
            <div className="bg-white p-4 rounded-xl shadow-sm text-center">
              <AlertTriangle className="w-6 h-6 mx-auto text-red-600 mb-1" />
              <div className="text-2xl font-bold">{dashboard.open_alerts}</div>
              <div className="text-xs text-gray-500">התראות פתוחות</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white p-4 rounded-xl shadow-sm">
              <h3 className="font-bold mb-3">חלוקת סנטימנט</h3>
              {dashboard.sentiment_distribution.map(s => (
                <div key={s.sentiment_label} className="flex items-center justify-between py-1">
                  <span className={`text-sm ${SENTIMENT_COLOR[s.sentiment_label] || ""}`}>
                    {s.sentiment_label === "positive" ? "חיובי" : s.sentiment_label === "negative" ? "שלילי" : "ניטרלי"}
                  </span>
                  <span className="font-semibold">{s.count}</span>
                </div>
              ))}
            </div>
            <div className="bg-white p-4 rounded-xl shadow-sm">
              <h3 className="font-bold mb-3">נציגים מובילים</h3>
              {dashboard.top_agents.map((a, i) => (
                <div key={i} className="flex items-center justify-between py-1 text-sm">
                  <span>{a.agent_name}</span>
                  <div className="flex gap-3 text-xs">
                    <span>{a.calls} שיחות</span>
                    <span className="font-semibold text-blue-700">Q:{a.avg_quality}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
