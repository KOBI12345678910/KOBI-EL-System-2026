import { useState, useEffect, useCallback, useRef, useMemo } from "react";

// ═══════════════════════════════════════════════════════════════
// NEXUS AI — AUTONOMOUS GOOGLE ADS SUPERINTELLIGENCE
// Zero-touch, self-evolving, self-optimizing advertising engine
// ═══════════════════════════════════════════════════════════════

const NEURAL_MODULES = {
  bidOptimizer: { name: "Bid Neural Engine", status: "learning", accuracy: 94.7, decisions: 12847, icon: "🧠", desc: "רשת נוירונית שמתאימה הצעות מחיר בזמן אמת לפי 147 סיגנלים" },
  creativeGen: { name: "Creative AI Generator", status: "generating", accuracy: 89.2, decisions: 3421, icon: "🎨", desc: "יוצר מודעות, כותרות, תיאורים ותמונות אוטומטית ב-3 שפות" },
  budgetBrain: { name: "Budget Allocation AI", status: "optimizing", accuracy: 96.1, decisions: 8934, icon: "💰", desc: "מחלק תקציב דינמית בין קמפיינים, שעות ומכשירים" },
  audienceAI: { name: "Audience Intelligence", status: "scanning", accuracy: 91.8, decisions: 5623, icon: "👥", desc: "מזהה, מפלח ובונה קהלים חדשים אוטומטית" },
  competitorRadar: { name: "Competitor Warfare AI", status: "tracking", accuracy: 88.4, decisions: 2156, icon: "⚔️", desc: "מנטר מתחרים, מנתח אסטרטגיות ומגיב בזמן אמת" },
  anomalyDetector: { name: "Anomaly Detection", status: "monitoring", accuracy: 97.3, decisions: 456, icon: "🛡️", desc: "מזהה חריגות, הונאות קליקים וירידות פתאומיות" },
  landingOptimizer: { name: "Landing Page AI", status: "testing", accuracy: 85.6, decisions: 1234, icon: "🌐", desc: "אופטימיזציה אוטומטית של דפי נחיתה, A/B testing רציף" },
  predictiveEngine: { name: "Predictive Forecasting", status: "calculating", accuracy: 92.4, decisions: 7821, icon: "🔮", desc: "חיזוי ביצועים, עונתיות, טרנדים ותקציבים עתידיים" },
  nlpEngine: { name: "NLP Keyword Engine", status: "analyzing", accuracy: 93.1, decisions: 15234, icon: "📝", desc: "מחקר מילים, Long-tail, שליליות, Semantic matching" },
  conversionAI: { name: "Conversion Optimizer", status: "learning", accuracy: 90.5, decisions: 4567, icon: "🎯", desc: "אופטימיזציית נתיב המרה, Attribution modeling, Funnel AI" },
  reportingAI: { name: "Insight Generator", status: "active", accuracy: 95.8, decisions: 2345, icon: "📊", desc: "מייצר תובנות, דוחות ואסטרטגיות אוטומטית" },
  selfEvolver: { name: "Self-Evolution Engine", status: "evolving", accuracy: 98.2, decisions: 892, icon: "🧬", desc: "המערכת משפרת את עצמה — לומדת מטעויות ומצליחות" },
};

const EVOLUTION_LOG = [
  { gen: 147, change: "שיפור מודל Bid Prediction — RMSE ירד ב-12%", impact: "+₪2,340 רווח יומי", time: "לפני 2 שעות" },
  { gen: 146, change: "גילוי פטרן חדש: המרות גבוהות ביום ג' 21:00-23:00", impact: "+18% המרות", time: "לפני 5 שעות" },
  { gen: 145, change: "Creative AI למד סגנון כתיבה חדש מ-Top Performers", impact: "+7% CTR", time: "לפני 8 שעות" },
  { gen: 144, change: "Audience AI גילה מיקרו-סגמנט: גברים 35-44, מרכז, בעלי בתים", impact: "+23% Conv Rate", time: "אתמול" },
  { gen: 143, change: "אלגוריתם Budget Allocation עבר ל-v3.2 — Multi-Armed Bandit", impact: "+₪1,870 ROAS", time: "אתמול" },
  { gen: 142, change: "זיהוי Click Fraud מ-3 IP ranges — חסימה אוטומטית", impact: "חיסכון ₪890", time: "לפני יומיים" },
  { gen: 141, change: "Landing Page AI שינה CTA color + position על סמך heatmap", impact: "+11% Conv Rate", time: "לפני יומיים" },
  { gen: 140, change: "NLP Engine הוסיף 47 Long-tail keywords מ-Search Console data", impact: "+312 קליקים/יום", time: "לפני 3 ימים" },
];

const LIVE_DECISIONS = [
  { time: "10:42:18", module: "bidOptimizer", action: "Bid ↑ 8%", target: "מעקות ברזל תל אביב", reason: "Conversion probability 78% detected — high-value session from Ramat Gan, mobile, returning visitor", result: "pending" },
  { time: "10:42:15", module: "anomalyDetector", action: "Alert Dismissed", target: "PMax Campaign", reason: "Impression spike +340% — traced to trending search 'פרגולה לגינה', legitimate", result: "✓" },
  { time: "10:42:11", module: "budgetBrain", action: "Shift ₪23", target: "YouTube → Search", reason: "Search ROAS 4.2x vs YouTube 2.1x in last 2hrs — realtime arbitrage", result: "✓" },
  { time: "10:42:08", module: "creativeGen", action: "New Ad Created", target: "שערים וגדרות", reason: "CTR declining 3 days — generated 4 headline variants based on top competitor copy analysis", result: "testing" },
  { time: "10:41:55", module: "nlpEngine", action: "Negative KW +3", target: "All Search", reason: "Detected waste: 'מעקות DIY', 'מעקות יד שניה', 'מעקות פלסטיק' — 0 conversions, 47 clicks", result: "✓" },
  { time: "10:41:42", module: "audienceAI", action: "Audience Created", target: "Luxury EN", reason: "Lookalike 1% from 14-day converters × high-income zip codes × property search intent", result: "✓" },
  { time: "10:41:30", module: "competitorRadar", action: "Counter-bid", target: "Position 1 defense", reason: "מעקות ישראל outbid on 'מעקות ברזל מחיר' — AI raised bid to maintain position", result: "✓" },
  { time: "10:41:18", module: "predictiveEngine", action: "Budget Forecast", target: "Next 7 days", reason: "Predicted 15% search volume increase — recommended budget increase of ₪340/week", result: "queued" },
  { time: "10:41:05", module: "conversionAI", action: "Attribution Update", target: "All campaigns", reason: "Shifted from Last-Click to Data-Driven — YouTube assist value increased 3.4x", result: "✓" },
  { time: "10:40:52", module: "landingOptimizer", action: "A/B Test Started", target: "technokoluzi.com/railings", reason: "New variant: testimonial section moved above fold + WhatsApp CTA enlarged 20%", result: "testing" },
];

function f(n, d = 0) { return (n ?? 0).toLocaleString("he-IL", { minimumFractionDigits: d, maximumFractionDigits: d }); }
function fm(n) { return `₪${f(n)}`; }
function pct(a, b) { return b > 0 ? ((a / b) * 100).toFixed(1) : "0"; }

function NeuralPulse({ color = "#38bdf8", size = 60 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 60 60">
      <circle cx="30" cy="30" r="25" fill="none" stroke={color + "22"} strokeWidth="1" />
      <circle cx="30" cy="30" r="18" fill="none" stroke={color + "33"} strokeWidth="1">
        <animate attributeName="r" values="18;22;18" dur="2s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="1;0.3;1" dur="2s" repeatCount="indefinite" />
      </circle>
      <circle cx="30" cy="30" r="8" fill={color + "44"}>
        <animate attributeName="r" values="8;10;8" dur="1.5s" repeatCount="indefinite" />
      </circle>
      <circle cx="30" cy="30" r="4" fill={color} />
      {[0, 60, 120, 180, 240, 300].map((angle, i) => {
        const rad = (angle * Math.PI) / 180;
        const x1 = 30 + 12 * Math.cos(rad), y1 = 30 + 12 * Math.sin(rad);
        const x2 = 30 + 24 * Math.cos(rad), y2 = 30 + 24 * Math.sin(rad);
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={color + "55"} strokeWidth="1">
          <animate attributeName="opacity" values="0.2;1;0.2" dur={`${1.5 + i * 0.2}s`} repeatCount="indefinite" />
        </line>;
      })}
    </svg>
  );
}

function LiveGraph({ data, color, h = 60, w = "100%" }) {
  const svgRef = useRef(null);
  const [dims, setDims] = useState({ w: 300, h });
  useEffect(() => {
    if (svgRef.current) setDims({ w: svgRef.current.clientWidth, h });
  }, []);
  const max = Math.max(...data, 1);
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * dims.w},${h - (v / max) * (h - 6) - 3}`).join(" ");
  const area = `0,${h} ${pts} ${dims.w},${h}`;
  return (
    <svg ref={svgRef} width={w} height={h} style={{ display: "block" }}>
      <defs>
        <linearGradient id={`g-${color.replace('#','')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#g-${color.replace('#','')})`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CircularProgress({ value, max, size = 54, stroke = 4, color, children }) {
  const r = (size - stroke * 2) / 2;
  const circ = 2 * Math.PI * r;
  const p = Math.min(value / max, 1);
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeDasharray={`${p * circ} ${circ}`} strokeLinecap="round" style={{ transition: "stroke-dasharray 1s" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>{children}</div>
    </div>
  );
}

export default function NexusAI() {
  const [biz, setBiz] = useState("techno");
  const [tab, setTab] = useState("nerve");
  const [tick, setTick] = useState(0);
  const [expandedModule, setExpandedModule] = useState(null);
  const [autonomyLevel, setAutonomyLevel] = useState(100);
  const [decisionSpeed, setDecisionSpeed] = useState(0.3);
  const [totalDecisions, setTotalDecisions] = useState(68234);
  const [totalSaved, setTotalSaved] = useState(34567);
  const [aiScore, setAiScore] = useState(94.7);

  useEffect(() => {
    const t = setInterval(() => {
      setTick(p => p + 1);
      setTotalDecisions(p => p + Math.floor(Math.random() * 3));
      setTotalSaved(p => p + Math.floor(Math.random() * 12));
      setAiScore(p => Math.min(99.9, p + (Math.random() - 0.4) * 0.1));
    }, 2000);
    return () => clearInterval(t);
  }, []);

  const revenueData = useMemo(() => Array.from({ length: 30 }, (_, i) => 8000 + i * 200 + Math.sin(i * 0.5) * 2000 + Math.random() * 1500), []);
  const convData = useMemo(() => Array.from({ length: 30 }, (_, i) => 20 + i * 1.5 + Math.sin(i * 0.7) * 8 + Math.random() * 5), []);
  const costData = useMemo(() => Array.from({ length: 30 }, (_, i) => 3000 - i * 30 + Math.sin(i * 0.3) * 500 + Math.random() * 300), []);
  const roasData = useMemo(() => Array.from({ length: 30 }, (_, i) => 2.5 + i * 0.08 + Math.sin(i * 0.4) * 0.5 + Math.random() * 0.3), []);

  const bc = biz === "techno" ? "#38bdf8" : "#c084fc";
  const bn = biz === "techno" ? "טכנו כל עוזי" : "קובי אלקיים נדל\"ן";

  const tabs = [
    { id: "nerve", label: "מרכז עצבים", icon: "🧠" },
    { id: "decisions", label: "החלטות חיות", icon: "⚡" },
    { id: "evolution", label: "אבולוציה עצמית", icon: "🧬" },
    { id: "warfare", label: "לוחמה תחרותית", icon: "⚔️" },
    { id: "creative", label: "Creative AI", icon: "🎨" },
    { id: "predict", label: "חיזוי עתידי", icon: "🔮" },
    { id: "performance", label: "ביצועים", icon: "📈" },
  ];

  const moduleStatusColors = { learning: "#38bdf8", generating: "#c084fc", optimizing: "#22c55e", scanning: "#f59e0b", tracking: "#ef4444", monitoring: "#6366f1", testing: "#ec4899", calculating: "#14b8a6", analyzing: "#f97316", active: "#22c55e", evolving: "#a855f7" };

  return (
    <div dir="rtl" style={{ fontFamily: "'Heebo', sans-serif", background: "#05080f", color: "white", minHeight: "100vh", position: "relative", overflow: "hidden" }}>
      <link href="https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;700;900&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet" />

      {/* Animated background */}
      <div style={{ position: "fixed", inset: 0, background: `radial-gradient(ellipse at 20% 50%, ${bc}08 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, #6366f108 0%, transparent 50%)`, pointerEvents: "none", zIndex: 0 }} />

      {/* Top Bar */}
      <div style={{ position: "relative", zIndex: 10, background: "rgba(5,8,15,0.9)", borderBottom: "1px solid rgba(255,255,255,0.04)", backdropFilter: "blur(40px)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <NeuralPulse color={bc} size={44} />
            <div>
              <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: 3, background: `linear-gradient(135deg, ${bc}, #818cf8, #c084fc)`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>NEXUS AI</div>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", letterSpacing: 2, fontFamily: "JetBrains Mono" }}>AUTONOMOUS ADVERTISING SUPERINTELLIGENCE</div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ display: "flex", gap: 3, background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: 3, border: "1px solid rgba(255,255,255,0.04)" }}>
              {[["techno", "⚙️ טכנו כל עוזי", "#38bdf8"], ["realestate", "🏠 נדל\"ן", "#c084fc"]].map(([k, l, c]) => (
                <button key={k} onClick={() => setBiz(k)} style={{ padding: "5px 12px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "inherit", background: biz === k ? c : "transparent", color: biz === k ? "#000" : "rgba(255,255,255,0.4)", transition: "all 0.3s" }}>{l}</button>
              ))}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <CircularProgress value={autonomyLevel} max={100} size={38} stroke={3} color="#22c55e">
                <span style={{ fontSize: 10, fontWeight: 900, color: "#22c55e" }}>{autonomyLevel}%</span>
              </CircularProgress>
              <div>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>AUTONOMY</div>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#22c55e" }}>FULL AUTO</div>
              </div>
            </div>

            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, padding: "4px 12px", textAlign: "center" }}>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", fontFamily: "JetBrains Mono" }}>AI SCORE</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: bc, fontFamily: "JetBrains Mono" }}>{aiScore.toFixed(1)}</div>
            </div>

            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, padding: "4px 12px", textAlign: "center" }}>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", fontFamily: "JetBrains Mono" }}>DECISIONS</div>
              <div style={{ fontSize: 16, fontWeight: 900, color: "#f59e0b", fontFamily: "JetBrains Mono" }}>{f(totalDecisions)}</div>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 1, padding: "0 20px", overflowX: "auto" }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: "8px 14px", border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "inherit", background: tab === t.id ? `${bc}15` : "transparent", color: tab === t.id ? bc : "rgba(255,255,255,0.35)", borderBottom: tab === t.id ? `2px solid ${bc}` : "2px solid transparent", transition: "all 0.2s", whiteSpace: "nowrap", borderRadius: "6px 6px 0 0" }}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ position: "relative", zIndex: 10, padding: 16, maxHeight: "calc(100vh - 130px)", overflowY: "auto" }}>

        {tab === "nerve" && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8, marginBottom: 16 }}>
              {[
                { l: "הכנסות היום", v: fm(28450), d: "+12.4%", c: "#22c55e", icon: "💰" },
                { l: "עלות לליד", v: fm(34), d: "-8.2%", c: "#22c55e", icon: "🎯" },
                { l: "ROAS ממוצע", v: "6.8x", d: "+0.4x", c: "#22c55e", icon: "📈" },
                { l: "החלטות/דקה", v: "4.2", d: "real-time", c: bc, icon: "⚡" },
                { l: "כסף שנחסך", v: fm(totalSaved), d: "ע\"י AI", c: "#f59e0b", icon: "🛡️" },
                { l: "דיוק חיזוי", v: `${aiScore.toFixed(1)}%`, d: "ומשתפר", c: "#c084fc", icon: "🧠" },
              ].map((s, i) => (
                <div key={i} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 10, padding: "12px 10px", position: "relative", overflow: "hidden" }}>
                  <div style={{ position: "absolute", top: -10, left: -10, fontSize: 40, opacity: 0.04 }}>{s.icon}</div>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", marginBottom: 2, fontFamily: "JetBrains Mono" }}>{s.l}</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: s.c }}>{s.v}</div>
                  <div style={{ fontSize: 10, color: s.c + "aa" }}>{s.d}</div>
                </div>
              ))}
            </div>

            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
              <span>🧠 12 מודולים עצביים פעילים</span>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontFamily: "JetBrains Mono" }}>ALL SYSTEMS OPERATIONAL</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8, marginBottom: 16 }}>
              {Object.entries(NEURAL_MODULES).map(([key, mod]) => (
                <div key={key} onClick={() => setExpandedModule(expandedModule === key ? null : key)} style={{ background: expandedModule === key ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.02)", border: `1px solid ${expandedModule === key ? bc + "44" : "rgba(255,255,255,0.05)"}`, borderRadius: 10, padding: 12, cursor: "pointer", transition: "all 0.3s" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 18 }}>{mod.icon}</span>
                      <span style={{ fontSize: 11, fontWeight: 700 }}>{mod.name}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <div style={{ width: 6, height: 6, borderRadius: "50%", background: moduleStatusColors[mod.status], animation: "pulse 2s infinite" }} />
                      <span style={{ fontSize: 9, color: moduleStatusColors[mod.status], fontFamily: "JetBrains Mono" }}>{mod.status}</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <span style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>דיוק</span>
                      <div style={{ fontSize: 18, fontWeight: 900, color: mod.accuracy > 95 ? "#22c55e" : mod.accuracy > 90 ? bc : "#f59e0b" }}>{mod.accuracy}%</div>
                    </div>
                    <div style={{ textAlign: "left" }}>
                      <span style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>החלטות</span>
                      <div style={{ fontSize: 14, fontWeight: 700, fontFamily: "JetBrains Mono" }}>{f(mod.decisions)}</div>
                    </div>
                  </div>
                  {expandedModule === key && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.06)", fontSize: 11, color: "rgba(255,255,255,0.6)", lineHeight: 1.6 }}>
                      {mod.desc}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {[
                { label: "הכנסות (30 יום)", data: revenueData, color: "#22c55e" },
                { label: "המרות (30 יום)", data: convData, color: bc },
                { label: "עלויות (יורדות!)", data: costData, color: "#ef4444" },
                { label: "ROAS (עולה!)", data: roasData, color: "#f59e0b" },
              ].map((g, i) => (
                <div key={i} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 10, padding: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 8, color: g.color }}>{g.label}</div>
                  <LiveGraph data={g.data} color={g.color} h={50} />
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "decisions" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>⚡ החלטות AI בזמן אמת — {f(totalDecisions)} סה"כ</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e", animation: "pulse 1s infinite" }} />
                <span style={{ fontSize: 11, color: "#22c55e", fontFamily: "JetBrains Mono" }}>LIVE FEED</span>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {LIVE_DECISIONS.map((d, i) => {
                const mod = NEURAL_MODULES[d.module];
                return (
                  <div key={i} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 10, padding: "12px 14px", animation: i === 0 ? "fadeIn 0.5s ease" : "none" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                      <span style={{ fontFamily: "JetBrains Mono", fontSize: 10, color: "rgba(255,255,255,0.25)" }}>{d.time}</span>
                      <span style={{ fontSize: 14 }}>{mod?.icon}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: bc }}>{d.action}</span>
                      <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>→ {d.target}</span>
                      <span style={{ marginRight: "auto", fontSize: 10, padding: "1px 8px", borderRadius: 4, fontWeight: 600, background: d.result === "✓" ? "#22c55e22" : d.result === "testing" ? "#f59e0b22" : "#3b82f622", color: d.result === "✓" ? "#22c55e" : d.result === "testing" ? "#f59e0b" : "#3b82f6" }}>
                        {d.result === "✓" ? "בוצע" : d.result === "testing" ? "נבדק" : "בתור"}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", lineHeight: 1.5, paddingRight: 28 }}>
                      💭 <span style={{ fontStyle: "italic" }}>{d.reason}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ textAlign: "center", padding: 20, fontSize: 11, color: "rgba(255,255,255,0.2)", fontFamily: "JetBrains Mono" }}>
              ↓ {f(totalDecisions - 10)} החלטות נוספות — כל אחת מתועדת ומנותחת ↓
            </div>
          </div>
        )}

        {tab === "evolution" && (
          <div>
            <div style={{ background: `linear-gradient(135deg, ${bc}08, #6366f108)`, border: `1px solid ${bc}22`, borderRadius: 14, padding: 20, marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                <span style={{ fontSize: 32 }}>🧬</span>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 900 }}>מנוע אבולוציה עצמית</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>המערכת משפרת את עצמה ללא הפסקה — דור {EVOLUTION_LOG[0].gen}</div>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
                {[
                  { l: "דורות אבולוציה", v: "147", c: "#c084fc" },
                  { l: "שיפור מצטבר", v: "+340%", c: "#22c55e" },
                  { l: "למידה מטעויות", v: "2,847", c: "#f59e0b" },
                  { l: "פטרנים שזוהו", v: "1,234", c: bc },
                ].map((s, i) => (
                  <div key={i} style={{ textAlign: "center", background: "rgba(0,0,0,0.3)", borderRadius: 10, padding: 12 }}>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>{s.l}</div>
                    <div style={{ fontSize: 24, fontWeight: 900, color: s.c }}>{s.v}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>📜 יומן אבולוציה</div>
            {EVOLUTION_LOG.map((e, i) => (
              <div key={i} style={{ display: "flex", gap: 12, padding: "12px 14px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)", borderRadius: 10, marginBottom: 6 }}>
                <div style={{ background: `${bc}22`, color: bc, borderRadius: 8, padding: "4px 10px", fontSize: 12, fontWeight: 900, fontFamily: "JetBrains Mono", flexShrink: 0, height: "fit-content" }}>v{e.gen}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{e.change}</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{e.time}</div>
                </div>
                <div style={{ background: "#22c55e15", color: "#22c55e", padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700, height: "fit-content", whiteSpace: "nowrap" }}>{e.impact}</div>
              </div>
            ))}
          </div>
        )}

        {tab === "warfare" && (
          <div>
            <div style={{ background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.15)", borderRadius: 14, padding: 20, marginBottom: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 12 }}>⚔️ מצב לוחמה תחרותית</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                {[
                  { l: "מתחרים במעקב", v: "12", c: "#ef4444" },
                  { l: "מילות מפתח במאבק", v: "47", c: "#f59e0b" },
                  { l: "תגובות אוטומטיות היום", v: "23", c: "#22c55e" },
                ].map((s, i) => (
                  <div key={i} style={{ textAlign: "center", background: "rgba(0,0,0,0.3)", borderRadius: 10, padding: 12 }}>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>{s.l}</div>
                    <div style={{ fontSize: 28, fontWeight: 900, color: s.c }}>{s.v}</div>
                  </div>
                ))}
              </div>
            </div>
            {(biz === "techno" ? [
              { name: "מעקות ישראל", threat: 87, overlap: 67, estSpend: 5400, strategy: "Aggressive bidding + New creative weekly", aiAction: "Counter-bid אוטומטי + מעקב 24/7", wins: 34, losses: 8 },
              { name: "א.ב מסגרות", threat: 52, overlap: 45, estSpend: 2700, strategy: "Location targeting specific", aiAction: "Geo-fence defense + Sitelinks", wins: 22, losses: 5 },
              { name: "פרגולות VIP", threat: 61, overlap: 34, estSpend: 3600, strategy: "Brand terms bidding", aiAction: "Brand protection + Quality Score war", wins: 18, losses: 3 },
            ] : [
              { name: "Israel Sotheby's", threat: 91, overlap: 52, estSpend: 12000, strategy: "Premium placements + YouTube", aiAction: "Outbid on high-value terms + Retarget their visitors", wins: 28, losses: 12 },
              { name: "Anglo-Saxon TLV", threat: 65, overlap: 41, estSpend: 7500, strategy: "Local SEO + Ads combo", aiAction: "Multi-language assault + Lookalike audiences", wins: 19, losses: 6 },
              { name: "RE/MAX Israel", threat: 78, overlap: 38, estSpend: 10500, strategy: "Volume play", aiAction: "Quality > Volume — Focus on ROAS defense", wins: 31, losses: 9 },
            ]).map((c, i) => (
              <div key={i} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 12, padding: 16, marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{c.name}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ color: "#22c55e", fontWeight: 700, fontSize: 12 }}>W:{c.wins}</span>
                    <span style={{ color: "#ef4444", fontWeight: 700, fontSize: 12 }}>L:{c.losses}</span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>רמת איום</div>
                    <div style={{ height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3, marginTop: 3 }}>
                      <div style={{ width: `${c.threat}%`, height: "100%", background: c.threat > 80 ? "#ef4444" : c.threat > 60 ? "#f59e0b" : "#22c55e", borderRadius: 3, transition: "width 1s" }} />
                    </div>
                  </div>
                  <div style={{ textAlign: "center", minWidth: 80 }}>
                    <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>הוצאה חודשית</div>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{fm(c.estSpend)}</div>
                  </div>
                </div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                  <span style={{ color: "#ef4444" }}>האסטרטגיה שלהם:</span> {c.strategy}
                </div>
                <div style={{ fontSize: 11, color: bc, marginTop: 4, fontWeight: 600 }}>
                  🤖 תגובת AI: {c.aiAction}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "creative" && (
          <div>
            <div style={{ background: `linear-gradient(135deg, #c084fc08, #ec489808)`, border: "1px solid #c084fc22", borderRadius: 14, padding: 20, marginBottom: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 8 }}>🎨 Creative AI — יצירת מודעות אוטונומית</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>
                המערכת יוצרת, בודקת ומשפרת מודעות לבד. כותרות, תיאורים, תמונות, סרטונים — ב-3 שפות. כל מודעה עוברת A/B Test אוטומטי.
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 16 }}>
              {[
                { l: "מודעות שנוצרו", v: "847", c: "#c084fc" },
                { l: "A/B Tests פעילים", v: "34", c: "#f59e0b" },
                { l: "שיפור CTR ממוצע", v: "+31%", c: "#22c55e" },
              ].map((s, i) => (
                <div key={i} style={{ textAlign: "center", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 10, padding: 14 }}>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>{s.l}</div>
                  <div style={{ fontSize: 28, fontWeight: 900, color: s.c }}>{s.v}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>🏆 Top Performing Ads — נוצרו ע"י AI</div>
            {[
              { headline: "מעקות ברזל מעוצבים | 80 שנות ניסיון | הצעת מחיר חינם", desc: "טכנו כל עוזי — 3 דורות של מומחיות. מעקות, שערים, גדרות בהתאמה אישית. התקנה תוך 7 ימים.", ctr: 6.8, conv: 4.2, lang: "🇮🇱" },
              { headline: "Luxury Tel Aviv Real Estate | ROI 12-18% | Expert Guidance", desc: "Premium apartments in Tel Aviv's most exclusive neighborhoods. International investor program with full legal support.", ctr: 5.4, conv: 5.1, lang: "🇬🇧" },
              { headline: "Investissement Immobilier Tel Aviv | Rendement Garanti", desc: "Appartements de prestige dans les meilleurs quartiers. Accompagnement complet en français. Rentabilité prouvée.", ctr: 4.9, conv: 4.8, lang: "🇫🇷" },
            ].map((ad, i) => (
              <div key={i} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 10, padding: 14, marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                  <span style={{ fontSize: 16 }}>{ad.lang}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: bc }}>{ad.headline}</span>
                </div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginBottom: 8 }}>{ad.desc}</div>
                <div style={{ display: "flex", gap: 12, fontSize: 11 }}>
                  <span>CTR: <b style={{ color: "#22c55e" }}>{ad.ctr}%</b></span>
                  <span>Conv: <b style={{ color: "#f59e0b" }}>{ad.conv}%</b></span>
                  <span style={{ color: "#c084fc", fontWeight: 600 }}>🤖 AI Generated</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "predict" && (
          <div>
            <div style={{ background: `linear-gradient(135deg, #14b8a608, #38bdf808)`, border: "1px solid #14b8a622", borderRadius: 14, padding: 20, marginBottom: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 8 }}>🔮 חיזוי עתידי — 30/60/90 יום</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>מבוסס על 147 דורות למידה, עונתיות, טרנדים, ונתוני מתחרים</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
              {[
                { period: "30 יום", revenue: 852000, leads: 340, roas: 7.2, cost: 118000, confidence: 94 },
                { period: "60 יום", revenue: 1780000, leads: 710, roas: 7.8, cost: 228000, confidence: 87 },
                { period: "90 יום", revenue: 2850000, leads: 1140, roas: 8.4, cost: 339000, confidence: 79 },
              ].map((p, i) => (
                <div key={i} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 12, padding: 16 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: bc, marginBottom: 12, textAlign: "center" }}>{p.period}</div>
                  {[
                    { l: "הכנסות צפויות", v: fm(p.revenue), c: "#22c55e" },
                    { l: "לידים צפויים", v: f(p.leads), c: bc },
                    { l: "ROAS צפוי", v: `${p.roas}x`, c: "#f59e0b" },
                    { l: "עלות צפויה", v: fm(p.cost), c: "#ef4444" },
                  ].map((m, j) => (
                    <div key={j} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.03)", fontSize: 12 }}>
                      <span style={{ color: "rgba(255,255,255,0.4)" }}>{m.l}</span>
                      <span style={{ fontWeight: 700, color: m.c }}>{m.v}</span>
                    </div>
                  ))}
                  <div style={{ marginTop: 10, textAlign: "center" }}>
                    <CircularProgress value={p.confidence} max={100} size={50} stroke={3} color={p.confidence > 90 ? "#22c55e" : p.confidence > 80 ? "#f59e0b" : "#ef4444"}>
                      <span style={{ fontSize: 11, fontWeight: 900 }}>{p.confidence}%</span>
                    </CircularProgress>
                    <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", marginTop: 4 }}>רמת ביטחון</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "performance" && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
              {[
                { label: "הכנסות (30 יום)", data: revenueData, color: "#22c55e", total: `${fm(revenueData.reduce((a, b) => a + b, 0))}` },
                { label: "המרות (30 יום)", data: convData, color: bc, total: f(Math.round(convData.reduce((a, b) => a + b, 0))) },
                { label: "עלויות (יורדות ↓)", data: costData, color: "#ef4444", total: fm(Math.round(costData.reduce((a, b) => a + b, 0))) },
                { label: "ROAS (עולה ↑)", data: roasData, color: "#f59e0b", total: `${(roasData.reduce((a, b) => a + b, 0) / roasData.length).toFixed(1)}x` },
              ].map((g, i) => (
                <div key={i} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 12, padding: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: g.color }}>{g.label}</span>
                    <span style={{ fontSize: 14, fontWeight: 900, color: g.color }}>{g.total}</span>
                  </div>
                  <LiveGraph data={g.data} color={g.color} h={70} />
                </div>
              ))}
            </div>

            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>🏆 ביצועי AI לעומת ניהול ידני (הערכה)</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              {[
                { metric: "ROAS", ai: "6.8x", human: "3.2x", improvement: "+112%" },
                { metric: "עלות לליד", ai: "₪34", human: "₪78", improvement: "-56%" },
                { metric: "החלטות ביום", ai: "4,200", human: "~15", improvement: "+27,900%" },
                { metric: "זמן תגובה", ai: "0.3 שניות", human: "~4 שעות", improvement: "-99.9%" },
                { metric: "A/B Tests", ai: "34 במקביל", human: "2-3", improvement: "+1,033%" },
                { metric: "שפות", ai: "3 (אוטומטי)", human: "1-2 (ידני)", improvement: "Full Auto" },
              ].map((m, i) => (
                <div key={i} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 10, padding: 12, textAlign: "center" }}>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginBottom: 6 }}>{m.metric}</div>
                  <div style={{ display: "flex", justifyContent: "center", gap: 12, marginBottom: 6 }}>
                    <div>
                      <div style={{ fontSize: 8, color: "#22c55e" }}>🤖 AI</div>
                      <div style={{ fontSize: 14, fontWeight: 900, color: "#22c55e" }}>{m.ai}</div>
                    </div>
                    <div style={{ width: 1, background: "rgba(255,255,255,0.08)" }} />
                    <div>
                      <div style={{ fontSize: 8, color: "#ef4444" }}>👤 ידני</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#ef4444" }}>{m.human}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 900, color: bc }}>{m.improvement}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.3 } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-8px) } to { opacity: 1; transform: translateY(0) } }
        * { box-sizing: border-box; margin: 0; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 2px; }
      `}</style>
    </div>
  );
}
