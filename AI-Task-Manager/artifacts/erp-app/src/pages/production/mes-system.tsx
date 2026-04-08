import { useState } from "react";
import {
  AlertTriangle, CheckCircle2, TrendingUp, ClipboardList, Activity
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell
} from "recharts";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";

const API = "/api";

const TABS = ["סקירה", "בזמן אמת", "איכות", "משאבים", "התראות"];

const hourlyOutput = [
  { time: "00:00", count: 3 }, { time: "04:00", count: 4 }, { time: "08:00", count: 5 },
  { time: "12:00", count: 8 }, { time: "16:00", count: 6 }, { time: "20:00", count: 4 },
];

const stageDistribution = [
  { name: "הנדסה: 2", value: 2, color: "#3b82f6" },
  { name: "מדידה: 4", value: 4, color: "#22c55e" },
  { name: "חיתוך: 6", value: 6, color: "#f59e0b" },
  { name: "מוך: 1", value: 1, color: "#a855f7" },
  { name: "בקרה: 2", value: 2, color: "#ec4899" },
  { name: "ריתוך: 6", value: 6, color: "#ef4444" },
  { name: "welding: 6", value: 6, color: "#06b6d4" },
];

const workstations = [
  { name: "מעגלי מתכת", customer: "חברת הנדסה א", task: "חיתוך", code: "cutting", hours: "0/18h" },
  { name: "מסגרות פלדה", customer: "מפעל הרכבה", task: "ריתוך", code: "welding", hours: "0/24h" },
  { name: "חלקי ברזל", customer: "תעשיות בניה", task: "מדידה", code: "measurement", hours: "0/12h" },
  { name: "פרופילים מיוחדים", customer: "מפעל אלמינום", task: "לישוש", code: "grinding", hours: "0/20h" },
  { name: "צילינדרים", customer: "מערכות הידראוליות", task: "צביעה", code: "painting", hours: "0/18h" },
];

const workstationLoad = [
  { name: "מדידה", load: 75, status: "פעיל" },
  { name: "חיתוך", load: 80, status: "פעיל" },
  { name: "ריתוך", load: 85, status: "פעיל" },
  { name: "לישוש", load: 90, status: "פעיל" },
  { name: "צביעה", load: 95, status: "פעיל" },
  { name: "בקרה", load: 100, status: "פעיל" },
];

const stationColorMap: Record<string, string> = {
  cutting: "bg-blue-100 text-blue-700",
  welding: "bg-orange-100 text-orange-700",
  measurement: "bg-purple-100 text-purple-700",
  grinding: "bg-green-100 text-green-700",
  painting: "bg-pink-100 text-pink-700",
};

const relatedTabs = [
  {
    key: "machines", label: "מכונות", endpoint: `${API}/production/machines?limit=10`,
    columns: [
      { key: "name", label: "שם מכונה" },
      { key: "type", label: "סוג" },
      { key: "status", label: "סטטוס" },
    ],
  },
  {
    key: "work-orders", label: "הזמנות עבודה", endpoint: `${API}/work-orders?limit=10`,
    columns: [
      { key: "order_number", label: "מספר הזמנה" },
      { key: "product_name", label: "מוצר" },
      { key: "status", label: "סטטוס" },
    ],
  },
  {
    key: "sensors", label: "חיישנים", endpoint: `${API}/production/sensors?limit=10`,
    columns: [
      { key: "name", label: "שם חיישן" },
      { key: "type", label: "סוג" },
      { key: "value", label: "ערך נוכחי" },
    ],
  },
  {
    key: "alerts", label: "התראות", endpoint: `${API}/production/alerts?limit=10`,
    columns: [
      { key: "title", label: "כותרת" },
      { key: "severity", label: "חומרה" },
      { key: "created_at", label: "תאריך" },
    ],
  },
];

export default function MESSystemPage() {
  const [tab, setTab] = useState(0);

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex justify-between items-start flex-wrap gap-4">
        <div>
          <h1 className="text-xl sm:text-3xl font-bold flex items-center gap-3">
            <Activity className="text-blue-600" size={32} />
            מערכת הנהלת ייצור (MES)
          </h1>
          <p className="text-muted-foreground mt-1">ניהול ותמונות מצב רצפת הייצור בזמן אמת</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-card border rounded-xl p-4 shadow-sm text-center">
          <AlertTriangle className="mx-auto mb-2 text-amber-500" size={24} />
          <div className="text-xl sm:text-3xl font-bold text-amber-500">27</div>
          <div className="text-xs text-muted-foreground mt-1">אזהרות</div>
        </div>
        <div className="bg-card border rounded-xl p-4 shadow-sm text-center">
          <CheckCircle2 className="mx-auto mb-2 text-green-500" size={24} />
          <div className="text-xl sm:text-3xl font-bold text-green-500">100%</div>
          <div className="text-xs text-muted-foreground mt-1">זמן פעילות</div>
        </div>
        <div className="bg-card border rounded-xl p-4 shadow-sm text-center">
          <TrendingUp className="mx-auto mb-2 text-blue-500" size={24} />
          <div className="text-xl sm:text-3xl font-bold text-blue-500">25%</div>
          <div className="text-xs text-muted-foreground mt-1">איכות</div>
        </div>
        <div className="bg-card border rounded-xl p-4 shadow-sm text-center">
          <ClipboardList className="mx-auto mb-2 text-purple-500" size={24} />
          <div className="text-xl sm:text-3xl font-bold text-purple-500">27</div>
          <div className="text-xs text-muted-foreground mt-1">עבודות פעילות</div>
        </div>
      </div>

      <div className="flex border-b gap-6 overflow-x-auto">
        {TABS.map((t, i) => (
          <button
            key={t}
            onClick={() => setTab(i)}
            className={`pb-2 px-1 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${tab === i ? "border-blue-600 text-blue-600" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 0 && (
        <div className="space-y-4 sm:space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-card border rounded-xl p-4 shadow-sm">
              <div className="font-semibold mb-4 text-foreground">תפוקה לפי שעה</div>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={hourlyOutput}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="count" stroke="#3b82f6" name="תפוקה" dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-card border rounded-xl p-4 shadow-sm">
              <div className="font-semibold mb-4 text-foreground">התפלגות לפי שלב</div>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={stageDistribution} cx="50%" cy="50%" outerRadius={90} dataKey="value" label={({ name }) => name}>
                    {stageDistribution.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="bg-card border rounded-xl p-4 shadow-sm">
            <div className="font-semibold mb-4 text-foreground">סיכום ביצועים</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "זמן מחזור ממוצע", value: "4.2 שעות" },
                { label: "OEE", value: "87.5%" },
                { label: "עבודות שהושלמו היום", value: "0" },
                { label: "עיכובים פתוחים", value: "27" },
              ].map((k) => (
                <div key={k.label} className="bg-muted/30 rounded-lg p-3 text-center">
                  <div className="text-xl font-bold text-blue-600">{k.value}</div>
                  <div className="text-xs text-muted-foreground mt-1">{k.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 1 && (
        <div className="space-y-4">
          <div className="font-semibold text-foreground flex items-center gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            מצב רצפה - עכשיו
          </div>
          <div className="space-y-3">
            {workstations.map((ws) => (
              <div key={ws.name} className="bg-card border rounded-xl p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
                <div className="flex-1">
                  <div className="font-medium">{ws.name}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{ws.customer}</div>
                </div>
                <div className="text-sm text-muted-foreground">{ws.task}</div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${stationColorMap[ws.code] || "bg-muted/50 text-muted-foreground"}`}>
                  {ws.code}
                </span>
                <div className="text-xs text-muted-foreground">{ws.hours}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 2 && (
        <div className="space-y-4 sm:space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "שיעור עמידה", value: "25%", color: "text-amber-500" },
              { label: "כשלים היום", value: "20", color: "text-red-500" },
              { label: "בדיקות ממתינות", value: "7", color: "text-blue-500" },
              { label: "ליקויים פתוחים", value: "27", color: "text-orange-500" },
            ].map((k) => (
              <div key={k.label} className="bg-card border rounded-xl p-4 shadow-sm text-center">
                <div className={`text-lg sm:text-2xl font-bold ${k.color}`}>{k.value}</div>
                <div className="text-xs text-muted-foreground mt-1">{k.label}</div>
              </div>
            ))}
          </div>
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
            <div className="font-semibold text-yellow-700 mb-2">בקרת איכות — הזהרה</div>
            <p className="text-sm text-yellow-600">שיעור העמידה בסטנדרטים עומד על 25% בלבד. יש לבחון עמדות ייצור ולהפעיל נהלי תיקון.</p>
          </div>
        </div>
      )}

      {tab === 3 && (
        <div className="space-y-4 sm:space-y-6">
          <div className="font-semibold text-foreground">מצב עומס תחנות עבודה</div>
          <div className="space-y-4">
            {workstationLoad.map((ws) => (
              <div key={ws.name} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="font-medium">{ws.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs bg-green-100 text-green-600 px-2 py-0.5 rounded-full">{ws.status}</span>
                    <span className="text-muted-foreground">{ws.load}%</span>
                  </div>
                </div>
                <div className="bg-muted rounded-full h-3">
                  <div
                    className={`h-3 rounded-full ${ws.load >= 95 ? "bg-red-500" : ws.load >= 85 ? "bg-amber-500" : "bg-green-500"}`}
                    style={{ width: `${ws.load}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 4 && (
        <div className="space-y-4">
          <div className="font-semibold text-foreground">התראות פעילות</div>
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <div className="flex items-center gap-2 text-red-700 font-medium mb-1">
              <AlertTriangle size={16} />
              עבודות עם איחור
            </div>
            <p className="text-sm text-red-600">27 עבודות ייצור כרגע באיחור לפי לוח הזמנים המתוכנן. נדרשת בחינה מיידית של הקצאת משאבים ועדיפויות.</p>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <div className="flex items-center gap-2 text-amber-700 font-medium mb-1">
              <AlertTriangle size={16} />
              ניצולת גבוהה
            </div>
            <p className="text-sm text-amber-600">עמדת בקרה פועלת ב-100% ניצולת. שקול להוסיף משמרת נוספת.</p>
          </div>
        </div>
      )}

      <div className="space-y-6 mt-8">
        <RelatedRecords tabs={relatedTabs} />
        <ActivityLog entityType="mes_system" />
      </div>
    </div>
  );
}
