import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Bot, Play, Pause, Plus, Search, AlertTriangle, CheckCircle, Clock, Shield, Activity, Eye, Trash2, Settings } from "lucide-react";

interface Agent {
  id: number; agent_key: string; name: string; description: string; mission: string;
  allowed_tools: any; read_scope: any; write_scope: any;
  max_autonomy_level: string; confidence_threshold: number; status: string; owner: string; created_at: string;
}
interface Execution {
  id: number; agent_id: number; trigger_event: string; input_data: any; output_data: any;
  actions_taken: any; confidence_score: number; status: string; human_review_required: boolean;
  reviewed_by: string; duration_ms: number; created_at: string;
}
interface Incident {
  id: number; agent_id: number; agent_name: string; execution_id: number; incident_type: string;
  severity: string; description: string; resolution: string; status: string; created_at: string;
}
interface Policy {
  id: number; agent_id: number; policy_type: string; policy_rule: any;
}
interface Dashboard {
  active_agents: number; executions_today: number; open_incidents: number;
  avg_confidence: number; running_now: number; pending_review: number;
}

export default function AgentOrchestrationPage() {
  const [tab, setTab] = useState<"agents"|"executions"|"incidents"|"policies">("agents");
  const [agents, setAgents] = useState<Agent[]>([]);
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [dashboard, setDashboard] = useState<Dashboard|null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<Agent|null>(null);
  const [form, setForm] = useState({ agent_key:"", name:"", description:"", mission:"", max_autonomy_level:"advisory", confidence_threshold:"0.8", owner:"" });
  const [policyForm, setPolicyForm] = useState({ agent_id:"", policy_type:"data_access", policy_rule:"" });
  const [incidentForm, setIncidentForm] = useState({ agent_id:"", incident_type:"error", severity:"medium", description:"" });

  const token = localStorage.getItem("erp_token");
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [ag, dash, inc] = await Promise.all([
        fetch("/api/agents", { headers }).then(r=>r.json()),
        fetch("/api/agents/dashboard", { headers }).then(r=>r.json()),
        fetch("/api/incidents", { headers }).then(r=>r.json()),
      ]);
      setAgents(Array.isArray(ag) ? ag : []);
      setDashboard(dash);
      setIncidents(Array.isArray(inc) ? inc : []);
    } catch {} finally { setLoading(false); }
  }

  async function loadExecutions(agentId: number) {
    const data = await fetch(`/api/agents/${agentId}/executions`, { headers }).then(r=>r.json());
    setExecutions(Array.isArray(data) ? data : []);
  }

  async function loadPolicies(agentId: number) {
    const data = await fetch(`/api/agents/${agentId}/policies`, { headers }).then(r=>r.json());
    setPolicies(Array.isArray(data) ? data : []);
  }

  async function createAgent(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/agents", { method:"POST", headers, body: JSON.stringify({ ...form, confidence_threshold: Number(form.confidence_threshold) }) });
    setShowForm(false); setForm({ agent_key:"", name:"", description:"", mission:"", max_autonomy_level:"advisory", confidence_threshold:"0.8", owner:"" });
    loadAll();
  }

  async function toggleAgent(agent: Agent) {
    const action = agent.status === "active" ? "pause" : "resume";
    await fetch(`/api/agents/${agent.id}/${action}`, { method:"POST", headers });
    loadAll();
  }

  async function executeAgent(agent: Agent) {
    await fetch(`/api/agents/${agent.id}/execute`, { method:"POST", headers, body: JSON.stringify({ trigger_event:"manual", input_data:{ triggered_by:"ui" } }) });
    loadExecutions(agent.id);
    loadAll();
  }

  async function deleteAgent(id: number) {
    await fetch(`/api/agents/${id}`, { method:"DELETE", headers });
    loadAll();
  }

  async function createPolicy(e: React.FormEvent) {
    e.preventDefault();
    let rule = {};
    try { rule = JSON.parse(policyForm.policy_rule); } catch { rule = { description: policyForm.policy_rule }; }
    await fetch(`/api/agents/${policyForm.agent_id}/policies`, { method:"POST", headers, body: JSON.stringify({ policy_type: policyForm.policy_type, policy_rule: rule }) });
    if (selectedAgent) loadPolicies(selectedAgent.id);
    setPolicyForm({ agent_id:"", policy_type:"data_access", policy_rule:"" });
  }

  async function createIncident(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/incidents", { method:"POST", headers, body: JSON.stringify(incidentForm) });
    setIncidentForm({ agent_id:"", incident_type:"error", severity:"medium", description:"" });
    loadAll();
  }

  async function resolveIncident(id: number) {
    await fetch(`/api/incidents/${id}`, { method:"PUT", headers, body: JSON.stringify({ status:"resolved" }) });
    loadAll();
  }

  const autonomyLabel: Record<string,string> = { advisory:"ייעוצי", draft:"טיוטה", auto_low:"אוטומטי נמוך", auto_high:"אוטומטי גבוה" };
  const statusColor: Record<string,string> = { draft:"bg-gray-500", active:"bg-green-500", paused:"bg-yellow-500", retired:"bg-red-500" };
  const execStatusColor: Record<string,string> = { running:"bg-blue-500", completed:"bg-green-500", failed:"bg-red-500", rolled_back:"bg-orange-500" };
  const incSeverityColor: Record<string,string> = { low:"text-blue-400", medium:"text-yellow-400", high:"text-orange-400", critical:"text-red-400" };

  const filteredAgents = agents.filter(a => !search || a.name.includes(search) || a.agent_key.includes(search));

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"/></div>;

  return (
    <div className="p-6 space-y-6 text-white" dir="rtl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bot className="w-8 h-8 text-purple-400" />
          <div>
            <h1 className="text-2xl font-bold">מנוע תזמור סוכני AI</h1>
            <p className="text-sm text-gray-400">ניהול, ביצוע ופיקוח על סוכנים אוטונומיים</p>
          </div>
        </div>
        <button onClick={()=>setShowForm(!showForm)} className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg text-sm">
          <Plus className="w-4 h-4" /> סוכן חדש
        </button>
      </div>

      {/* Dashboard KPIs */}
      {dashboard && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {[
            { label:"סוכנים פעילים", val: dashboard.active_agents, icon: Bot, color:"text-green-400" },
            { label:"ביצועים היום", val: dashboard.executions_today, icon: Activity, color:"text-blue-400" },
            { label:"רצים כעת", val: dashboard.running_now, icon: Clock, color:"text-cyan-400" },
            { label:"אירועים פתוחים", val: dashboard.open_incidents, icon: AlertTriangle, color:"text-red-400" },
            { label:"ממוצע ביטחון", val: `${(Number(dashboard.avg_confidence)*100).toFixed(0)}%`, icon: CheckCircle, color:"text-emerald-400" },
            { label:"ממתין לביקורת", val: dashboard.pending_review, icon: Eye, color:"text-yellow-400" },
          ].map((k,i) => (
            <motion.div key={i} initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{delay:i*0.05}} className="bg-gray-800 rounded-xl p-4 border border-gray-700">
              <div className="flex items-center gap-2 mb-2"><k.icon className={`w-4 h-4 ${k.color}`}/><span className="text-xs text-gray-400">{k.label}</span></div>
              <div className={`text-2xl font-bold ${k.color}`}>{k.val}</div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-700 pb-2">
        {([["agents","סוכנים"],["executions","ביצועים"],["incidents","אירועים"],["policies","מדיניות"]] as const).map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)} className={`px-4 py-2 rounded-t-lg text-sm ${tab===k?"bg-gray-700 text-white":"text-gray-400 hover:text-white"}`}>{l}</button>
        ))}
      </div>

      {/* Create Agent Form */}
      {showForm && (
        <motion.form initial={{opacity:0,height:0}} animate={{opacity:1,height:"auto"}} onSubmit={createAgent} className="bg-gray-800 rounded-xl p-6 border border-gray-700 grid grid-cols-1 md:grid-cols-2 gap-4">
          <input placeholder="מפתח סוכן (ייחודי)" value={form.agent_key} onChange={e=>setForm({...form,agent_key:e.target.value})} className="bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm" required />
          <input placeholder="שם הסוכן" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} className="bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm" required />
          <input placeholder="תיאור" value={form.description} onChange={e=>setForm({...form,description:e.target.value})} className="bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm col-span-full" />
          <textarea placeholder="משימה / Mission" value={form.mission} onChange={e=>setForm({...form,mission:e.target.value})} className="bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm col-span-full" rows={2} />
          <select value={form.max_autonomy_level} onChange={e=>setForm({...form,max_autonomy_level:e.target.value})} className="bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm">
            <option value="advisory">ייעוצי</option><option value="draft">טיוטה</option>
            <option value="auto_low">אוטומטי נמוך</option><option value="auto_high">אוטומטי גבוה</option>
          </select>
          <input type="number" step="0.01" min="0" max="1" placeholder="סף ביטחון" value={form.confidence_threshold} onChange={e=>setForm({...form,confidence_threshold:e.target.value})} className="bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm" />
          <input placeholder="בעלים" value={form.owner} onChange={e=>setForm({...form,owner:e.target.value})} className="bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm" />
          <div className="flex gap-2 col-span-full">
            <button type="submit" className="px-6 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg text-sm">צור סוכן</button>
            <button type="button" onClick={()=>setShowForm(false)} className="px-6 py-2 bg-gray-600 hover:bg-gray-700 rounded-lg text-sm">ביטול</button>
          </div>
        </motion.form>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute right-3 top-2.5 w-4 h-4 text-gray-400" />
        <input placeholder="חיפוש סוכנים..." value={search} onChange={e=>setSearch(e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-lg pr-10 pl-4 py-2 text-sm" />
      </div>

      {/* TAB: Agents */}
      {tab === "agents" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredAgents.map(agent => (
            <motion.div key={agent.id} initial={{opacity:0}} animate={{opacity:1}} className="bg-gray-800 rounded-xl p-5 border border-gray-700 hover:border-purple-500/50 transition-colors">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-lg">{agent.name}</h3>
                    <span className={`px-2 py-0.5 rounded-full text-xs text-white ${statusColor[agent.status]||"bg-gray-500"}`}>{agent.status}</span>
                  </div>
                  <p className="text-xs text-gray-400 font-mono">{agent.agent_key}</p>
                </div>
                <Bot className="w-6 h-6 text-purple-400" />
              </div>
              {agent.description && <p className="text-sm text-gray-300 mb-2">{agent.description}</p>}
              <div className="text-xs text-gray-400 space-y-1 mb-4">
                <div>רמת אוטונומיה: <span className="text-white">{autonomyLabel[agent.max_autonomy_level]||agent.max_autonomy_level}</span></div>
                <div>סף ביטחון: <span className="text-white">{(agent.confidence_threshold*100).toFixed(0)}%</span></div>
                {agent.owner && <div>בעלים: <span className="text-white">{agent.owner}</span></div>}
              </div>
              <div className="flex gap-2 flex-wrap">
                <button onClick={()=>toggleAgent(agent)} className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs ${agent.status==="active"?"bg-yellow-600 hover:bg-yellow-700":"bg-green-600 hover:bg-green-700"}`}>
                  {agent.status==="active" ? <><Pause className="w-3 h-3"/>השהה</> : <><Play className="w-3 h-3"/>הפעל</>}
                </button>
                {agent.status==="active" && <button onClick={()=>executeAgent(agent)} className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded-lg text-xs"><Activity className="w-3 h-3"/>הרץ</button>}
                <button onClick={()=>{setSelectedAgent(agent);setTab("executions");loadExecutions(agent.id);}} className="flex items-center gap-1 px-3 py-1.5 bg-gray-600 hover:bg-gray-700 rounded-lg text-xs"><Eye className="w-3 h-3"/>ביצועים</button>
                <button onClick={()=>{setSelectedAgent(agent);setTab("policies");loadPolicies(agent.id);setPolicyForm({...policyForm,agent_id:String(agent.id)});}} className="flex items-center gap-1 px-3 py-1.5 bg-gray-600 hover:bg-gray-700 rounded-lg text-xs"><Shield className="w-3 h-3"/>מדיניות</button>
                <button onClick={()=>deleteAgent(agent.id)} className="flex items-center gap-1 px-3 py-1.5 bg-red-600/30 hover:bg-red-600/50 rounded-lg text-xs"><Trash2 className="w-3 h-3"/></button>
              </div>
            </motion.div>
          ))}
          {!filteredAgents.length && <div className="col-span-full text-center text-gray-400 py-12">אין סוכנים להצגה</div>}
        </div>
      )}

      {/* TAB: Executions */}
      {tab === "executions" && (
        <div className="space-y-3">
          {selectedAgent && <div className="text-sm text-gray-400">ביצועים עבור: <span className="text-purple-400 font-bold">{selectedAgent.name}</span></div>}
          <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-900"><tr>
                <th className="p-3 text-right">מזהה</th><th className="p-3 text-right">אירוע</th><th className="p-3 text-right">ביטחון</th>
                <th className="p-3 text-right">סטטוס</th><th className="p-3 text-right">ביקורת</th><th className="p-3 text-right">זמן (ms)</th><th className="p-3 text-right">תאריך</th>
              </tr></thead>
              <tbody>
                {executions.map(ex => (
                  <tr key={ex.id} className="border-t border-gray-700 hover:bg-gray-700/50">
                    <td className="p-3 font-mono text-xs">{ex.id}</td>
                    <td className="p-3">{ex.trigger_event || "-"}</td>
                    <td className="p-3">
                      <span className={`font-bold ${ex.confidence_score >= 0.8 ? "text-green-400" : ex.confidence_score >= 0.6 ? "text-yellow-400" : "text-red-400"}`}>
                        {(ex.confidence_score * 100).toFixed(0)}%
                      </span>
                    </td>
                    <td className="p-3"><span className={`px-2 py-0.5 rounded-full text-xs text-white ${execStatusColor[ex.status]||"bg-gray-500"}`}>{ex.status}</span></td>
                    <td className="p-3">{ex.human_review_required ? <AlertTriangle className="w-4 h-4 text-yellow-400" /> : <CheckCircle className="w-4 h-4 text-green-400" />}</td>
                    <td className="p-3 text-gray-400">{ex.duration_ms || 0}</td>
                    <td className="p-3 text-gray-400 text-xs">{ex.created_at ? new Date(ex.created_at).toLocaleString("he-IL") : "-"}</td>
                  </tr>
                ))}
                {!executions.length && <tr><td colSpan={7} className="p-8 text-center text-gray-400">אין ביצועים</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB: Incidents */}
      {tab === "incidents" && (
        <div className="space-y-4">
          <form onSubmit={createIncident} className="bg-gray-800 rounded-xl p-4 border border-gray-700 flex flex-wrap gap-3 items-end">
            <select value={incidentForm.agent_id} onChange={e=>setIncidentForm({...incidentForm,agent_id:e.target.value})} className="bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm" required>
              <option value="">בחר סוכן</option>
              {agents.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <select value={incidentForm.incident_type} onChange={e=>setIncidentForm({...incidentForm,incident_type:e.target.value})} className="bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm">
              <option value="error">שגיאה</option><option value="hallucination">הזיה</option>
              <option value="wrong_action">פעולה שגויה</option><option value="policy_breach">הפרת מדיניות</option>
            </select>
            <select value={incidentForm.severity} onChange={e=>setIncidentForm({...incidentForm,severity:e.target.value})} className="bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm">
              <option value="low">נמוך</option><option value="medium">בינוני</option><option value="high">גבוה</option><option value="critical">קריטי</option>
            </select>
            <input placeholder="תיאור" value={incidentForm.description} onChange={e=>setIncidentForm({...incidentForm,description:e.target.value})} className="bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm flex-1" required />
            <button type="submit" className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-sm">דווח אירוע</button>
          </form>
          <div className="space-y-3">
            {incidents.map(inc => (
              <div key={inc.id} className="bg-gray-800 rounded-xl p-4 border border-gray-700 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <AlertTriangle className={`w-5 h-5 ${incSeverityColor[inc.severity]||"text-gray-400"}`} />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold">{inc.agent_name || `סוכן #${inc.agent_id}`}</span>
                      <span className="text-xs px-2 py-0.5 rounded bg-gray-700">{inc.incident_type}</span>
                      <span className={`text-xs font-bold ${incSeverityColor[inc.severity]}`}>{inc.severity}</span>
                    </div>
                    <p className="text-sm text-gray-300 mt-1">{inc.description}</p>
                    <span className="text-xs text-gray-500">{inc.created_at ? new Date(inc.created_at).toLocaleString("he-IL") : ""}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-1 rounded text-xs ${inc.status==="resolved"?"bg-green-600":"bg-yellow-600"}`}>{inc.status==="resolved"?"נפתר":"פתוח"}</span>
                  {inc.status !== "resolved" && <button onClick={()=>resolveIncident(inc.id)} className="px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-xs">סגור</button>}
                </div>
              </div>
            ))}
            {!incidents.length && <div className="text-center text-gray-400 py-8">אין אירועים</div>}
          </div>
        </div>
      )}

      {/* TAB: Policies */}
      {tab === "policies" && (
        <div className="space-y-4">
          {selectedAgent && <div className="text-sm text-gray-400">מדיניות עבור: <span className="text-purple-400 font-bold">{selectedAgent.name}</span></div>}
          <form onSubmit={createPolicy} className="bg-gray-800 rounded-xl p-4 border border-gray-700 flex flex-wrap gap-3 items-end">
            {!selectedAgent && (
              <select value={policyForm.agent_id} onChange={e=>setPolicyForm({...policyForm,agent_id:e.target.value})} className="bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm" required>
                <option value="">בחר סוכן</option>
                {agents.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            )}
            <select value={policyForm.policy_type} onChange={e=>setPolicyForm({...policyForm,policy_type:e.target.value})} className="bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm">
              <option value="data_access">גישה לנתונים</option><option value="action_limit">הגבלת פעולות</option><option value="approval_required">נדרש אישור</option>
            </select>
            <input placeholder='כלל מדיניות (JSON או טקסט)' value={policyForm.policy_rule} onChange={e=>setPolicyForm({...policyForm,policy_rule:e.target.value})} className="bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm flex-1" required />
            <button type="submit" className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg text-sm">הוסף מדיניות</button>
          </form>
          <div className="space-y-2">
            {policies.map(p => (
              <div key={p.id} className="bg-gray-800 rounded-lg p-4 border border-gray-700 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Shield className="w-4 h-4 text-purple-400" />
                  <span className="text-xs px-2 py-0.5 rounded bg-gray-700">{p.policy_type}</span>
                  <span className="text-sm text-gray-300 font-mono">{typeof p.policy_rule === "object" ? JSON.stringify(p.policy_rule) : p.policy_rule}</span>
                </div>
              </div>
            ))}
            {!policies.length && <div className="text-center text-gray-400 py-8">אין מדיניות מוגדרת</div>}
          </div>
        </div>
      )}
    </div>
  );
}
