import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Clock, Calendar, Filter, AlertTriangle, AlertCircle, Info,
  TrendingUp, Search, ZoomIn, ZoomOut, Activity, Layers,
  ChevronLeft, ChevronRight, X, Target, GitBranch, Zap,
  Users, Truck, Briefcase, Settings, Package, FileText, CheckCircle
} from "lucide-react";

type EntityType = "customers" | "suppliers" | "projects" | "operations";
type EventType = "order_placed" | "payment_received" | "shipment" | "qc_failure" | "complaint" | "contract_signing" | "meeting" | "inspection" | "delivery" | "incident";
type Severity = "critical" | "high" | "medium" | "info";
type Granularity = "hour" | "day" | "week" | "month";

interface TimelineEvent {
  id: string;
  title: string;
  description: string;
  entityType: EntityType;
  eventType: EventType;
  severity: Severity;
  date: string; // ISO
  relatedEntity: string;
  user: string;
  amount?: number;
  relatedEvents?: string[];
}

const ENTITY_CONFIG: Record<EntityType, { color: string; bgHex: string; label: string; icon: any }> = {
  customers: { color: "text-blue-400", bgHex: "#3b82f6", label: "לקוחות", icon: Users },
  suppliers: { color: "text-green-400", bgHex: "#22c55e", label: "ספקים", icon: Truck },
  projects: { color: "text-purple-400", bgHex: "#a855f7", label: "פרויקטים", icon: Briefcase },
  operations: { color: "text-orange-400", bgHex: "#f97316", label: "תפעול", icon: Settings },
};

const SEVERITY_CONFIG: Record<Severity, { color: string; bgHex: string; label: string; icon: any; textHex: string }> = {
  critical: { color: "text-red-400", bgHex: "#ef4444", textHex: "#fca5a5", label: "קריטי", icon: AlertCircle },
  high: { color: "text-orange-400", bgHex: "#f97316", textHex: "#fdba74", label: "גבוה", icon: AlertTriangle },
  medium: { color: "text-amber-400", bgHex: "#f59e0b", textHex: "#fcd34d", label: "בינוני", icon: TrendingUp },
  info: { color: "text-blue-400", bgHex: "#3b82f6", textHex: "#93c5fd", label: "מידע", icon: Info },
};

const EVENT_TYPE_LABELS: Record<EventType, string> = {
  order_placed: "הזמנה",
  payment_received: "תשלום",
  shipment: "משלוח",
  qc_failure: "כשל איכות",
  complaint: "תלונה",
  contract_signing: "חתימת הסכם",
  meeting: "פגישה",
  inspection: "בדיקה",
  delivery: "מסירה",
  incident: "תקרית",
};

const MOCK_EVENTS: TimelineEvent[] = [
  { id: "e1", title: "הזמנה #4521 - תעש ישראל", description: "הזמנת רכש עבור 500 יחידות גלגלי שיניים", entityType: "customers", eventType: "order_placed", severity: "info", date: "2026-02-03T09:15:00", relatedEntity: "תעש ישראל", user: "יוסי כהן", amount: 125000, relatedEvents: ["e5", "e12"] },
  { id: "e2", title: "תשלום התקבל - אלקטרה", description: "תשלום על חשבונית #2251 בסך 87,500 ש\"ח", entityType: "customers", eventType: "payment_received", severity: "info", date: "2026-02-05T11:30:00", relatedEntity: "אלקטרה", user: "דנה לוי", amount: 87500 },
  { id: "e3", title: "משלוח יצא - ספק פלדה א'", description: "משלוח 12 טון פלדה פחמן מהמחסן הראשי", entityType: "suppliers", eventType: "shipment", severity: "info", date: "2026-02-07T14:22:00", relatedEntity: "ספק פלדה א'", user: "משה אברהם" },
  { id: "e4", title: "כשל QC - אצווה B2026-04", description: "5 יחידות נכשלו בבדיקת מידות - החזרה לקו ייצור", entityType: "operations", eventType: "qc_failure", severity: "high", date: "2026-02-09T08:45:00", relatedEntity: "קו ייצור 3", user: "רחל דוד", relatedEvents: ["e8"] },
  { id: "e5", title: "חוזה נחתם - טבע", description: "חתימת הסכם שנתי בהיקף של 2.4M ש\"ח", entityType: "customers", eventType: "contract_signing", severity: "medium", date: "2026-02-11T16:00:00", relatedEntity: "טבע", user: "אלון פרץ", amount: 2400000 },
  { id: "e6", title: "תלונת לקוח - אמדוקס", description: "איחור במסירת פרויקט דלתא - התנצלות ופיצוי", entityType: "customers", eventType: "complaint", severity: "high", date: "2026-02-13T10:20:00", relatedEntity: "אמדוקס", user: "יוסי כהן" },
  { id: "e7", title: "פרויקט אלפא - שלב 2 הושלם", description: "אבן דרך של שלב 2 הושגה בהצלחה - 80% גמור", entityType: "projects", eventType: "delivery", severity: "medium", date: "2026-02-15T13:10:00", relatedEntity: "פרויקט אלפא", user: "דנה לוי" },
  { id: "e8", title: "תקרית בטיחות - מחסן 2", description: "פריטים נפלו ממדף עליון - אין נפגעים", entityType: "operations", eventType: "incident", severity: "critical", date: "2026-02-17T07:30:00", relatedEntity: "מחסן 2", user: "משה אברהם", relatedEvents: ["e4"] },
  { id: "e9", title: "הזמנה #4522 - בזק", description: "הזמנת רכש דחופה עבור 2000 מחברי זכר", entityType: "customers", eventType: "order_placed", severity: "medium", date: "2026-02-18T09:55:00", relatedEntity: "בזק", user: "אלון פרץ", amount: 345000 },
  { id: "e10", title: "בדיקת ISO הושלמה", description: "הבדיקה השנתית הושלמה בהצלחה - 0 אי-התאמות", entityType: "operations", eventType: "inspection", severity: "info", date: "2026-02-20T15:45:00", relatedEntity: "מערכת ניהול איכות", user: "רחל דוד" },
  { id: "e11", title: "תשלום נדחה - אלביט", description: "חשבונית #2198 עדיין לא שולמה - 45 יום איחור", entityType: "customers", eventType: "complaint", severity: "high", date: "2026-02-22T11:15:00", relatedEntity: "אלביט", user: "דנה לוי" },
  { id: "e12", title: "משלוח התקבל - ספק חשמל", description: "2,500 חלקים אלקטרוניים נתקבלו ונסרקו", entityType: "suppliers", eventType: "shipment", severity: "info", date: "2026-02-24T12:40:00", relatedEntity: "ספק חשמל ב'", user: "משה אברהם" },
  { id: "e13", title: "פרויקט בטא - השקה", description: "השקת שלב ניסוי של פרויקט בטא - צוות הרחיב", entityType: "projects", eventType: "delivery", severity: "medium", date: "2026-02-26T10:00:00", relatedEntity: "פרויקט בטא", user: "יוסי כהן" },
  { id: "e14", title: "כשל QC - קו 1", description: "8% שיעור פסולת - מעל היעד של 3%", entityType: "operations", eventType: "qc_failure", severity: "critical", date: "2026-02-28T09:00:00", relatedEntity: "קו ייצור 1", user: "רחל דוד", relatedEvents: ["e4", "e17"] },
  { id: "e15", title: "פגישה רבעונית - תעש ישראל", description: "סקירת ביצועים Q1 והגדרת יעדים ל-Q2", entityType: "customers", eventType: "meeting", severity: "info", date: "2026-03-02T14:00:00", relatedEntity: "תעש ישראל", user: "אלון פרץ" },
  { id: "e16", title: "חוזה התחדש - אלקטרה", description: "חידוש הסכם 3 שנתי בשווי 5.2M ש\"ח", entityType: "customers", eventType: "contract_signing", severity: "medium", date: "2026-03-04T11:30:00", relatedEntity: "אלקטרה", user: "אלון פרץ", amount: 5200000 },
  { id: "e17", title: "כשל QC - גלגלי שיניים", description: "אצווה של 200 יחידות נפסלה - סטייה גיאומטרית", entityType: "operations", eventType: "qc_failure", severity: "critical", date: "2026-03-06T08:15:00", relatedEntity: "קו ייצור 3", user: "רחל דוד", relatedEvents: ["e14"] },
  { id: "e18", title: "משלוח יצא - פרויקט אלפא", description: "10 חבילות סופיות נשלחו ללקוח", entityType: "projects", eventType: "shipment", severity: "info", date: "2026-03-08T16:20:00", relatedEntity: "פרויקט אלפא", user: "משה אברהם" },
  { id: "e19", title: "תשלום התקבל - אמדוקס", description: "תשלום על חשבונית #2310 - 156,000 ש\"ח", entityType: "customers", eventType: "payment_received", severity: "info", date: "2026-03-10T13:45:00", relatedEntity: "אמדוקס", user: "דנה לוי", amount: 156000 },
  { id: "e20", title: "פגישת ספק - ספק פלדה", description: "משא ומתן על מחירי Q2 - הסכמה עקרונית", entityType: "suppliers", eventType: "meeting", severity: "info", date: "2026-03-12T10:15:00", relatedEntity: "ספק פלדה א'", user: "יוסי כהן" },
  { id: "e21", title: "הזמנה #4524 - טבע", description: "הזמנת ענק - חלק מההסכם השנתי", entityType: "customers", eventType: "order_placed", severity: "medium", date: "2026-03-14T09:30:00", relatedEntity: "טבע", user: "אלון פרץ", amount: 890000 },
  { id: "e22", title: "תקרית אבטחת מידע", description: "ניסיון פריצה לא מורשה - נחסם", entityType: "operations", eventType: "incident", severity: "critical", date: "2026-03-15T22:10:00", relatedEntity: "מערכת IT", user: "אבטחת מידע" },
  { id: "e23", title: "בדיקת FDA - קו קוסמטיקה", description: "הבדיקה הצליחה - רישום מאושר", entityType: "operations", eventType: "inspection", severity: "medium", date: "2026-03-17T11:00:00", relatedEntity: "קו קוסמטיקה", user: "רחל דוד" },
  { id: "e24", title: "פרויקט גמא - דחייה", description: "דחייה של שבועיים עקב מחסור בחומרי גלם", entityType: "projects", eventType: "incident", severity: "high", date: "2026-03-19T14:30:00", relatedEntity: "פרויקט גמא", user: "דנה לוי" },
  { id: "e25", title: "משלוח התקבל - ספק לוגיסטיקה", description: "אריזות מיוחדות לייצוא - 1200 יחידות", entityType: "suppliers", eventType: "shipment", severity: "info", date: "2026-03-21T15:50:00", relatedEntity: "ספק לוגיסטיקה", user: "משה אברהם" },
  { id: "e26", title: "תלונה חמורה - בזק", description: "פריטים פגומים - דרישה להחלפה מלאה", entityType: "customers", eventType: "complaint", severity: "critical", date: "2026-03-23T10:45:00", relatedEntity: "בזק", user: "יוסי כהן" },
  { id: "e27", title: "תשלום - אלביט", description: "סוף סוף התקבל תשלום חלקי - 60%", entityType: "customers", eventType: "payment_received", severity: "medium", date: "2026-03-25T12:15:00", relatedEntity: "אלביט", user: "דנה לוי", amount: 234000 },
  { id: "e28", title: "חוזה חדש - צים", description: "חוזה לוגיסטיקה ימית - 1.8M ש\"ח", entityType: "customers", eventType: "contract_signing", severity: "medium", date: "2026-03-27T13:30:00", relatedEntity: "צים", user: "אלון פרץ", amount: 1800000 },
  { id: "e29", title: "בדיקה סניטרית", description: "בדיקה תקופתית - 2 אי-התאמות קלות", entityType: "operations", eventType: "inspection", severity: "medium", date: "2026-03-29T09:20:00", relatedEntity: "מתקן ייצור מזון", user: "רחל דוד" },
  { id: "e30", title: "פרויקט דלתא - השלמה", description: "הפרויקט הושלם בהצלחה לפני המועד", entityType: "projects", eventType: "delivery", severity: "info", date: "2026-03-31T16:00:00", relatedEntity: "פרויקט דלתא", user: "משה אברהם" },
  { id: "e31", title: "הזמנה דחופה - אלקטרה", description: "הזמנה מיוחדת - זמן אספקה 3 ימים", entityType: "customers", eventType: "order_placed", severity: "high", date: "2026-04-01T08:30:00", relatedEntity: "אלקטרה", user: "יוסי כהן", amount: 78000 },
  { id: "e32", title: "כשל QC - אצווה C2026-08", description: "סטייה במידות - החזרה ומחזור", entityType: "operations", eventType: "qc_failure", severity: "high", date: "2026-04-02T10:20:00", relatedEntity: "קו ייצור 2", user: "רחל דוד" },
  { id: "e33", title: "תשלום התקבל - טבע", description: "תשלום חלקי על ההסכם השנתי", entityType: "customers", eventType: "payment_received", severity: "info", date: "2026-04-03T14:40:00", relatedEntity: "טבע", user: "דנה לוי", amount: 600000 },
  { id: "e34", title: "פגישת ספקים רבעונית", description: "כל הספקים העיקריים התייצבו - הישגים וסיכונים", entityType: "suppliers", eventType: "meeting", severity: "medium", date: "2026-04-04T10:00:00", relatedEntity: "כל הספקים", user: "אלון פרץ" },
  { id: "e35", title: "תקרית סייבר - Phishing", description: "ניסיון phishing לא מוצלח - עובדים הגיבו נכון", entityType: "operations", eventType: "incident", severity: "high", date: "2026-04-05T11:15:00", relatedEntity: "מערכת IT", user: "אבטחת מידע" },
  { id: "e36", title: "פרויקט אפסילון - השקה", description: "השקת פרויקט חדש למנורה מבטחים", entityType: "projects", eventType: "contract_signing", severity: "medium", date: "2026-04-06T13:00:00", relatedEntity: "פרויקט אפסילון", user: "יוסי כהן", amount: 3400000 },
  { id: "e37", title: "הזמנה #4530 - אמדוקס", description: "הזמנה חודשית רגילה - 450 יחידות", entityType: "customers", eventType: "order_placed", severity: "info", date: "2026-04-07T09:00:00", relatedEntity: "אמדוקס", user: "דנה לוי", amount: 67500 },
  { id: "e38", title: "משלוח יצא - בזק החלפה", description: "החלפת הפריטים הפגומים - 200 יחידות", entityType: "customers", eventType: "shipment", severity: "medium", date: "2026-04-08T11:30:00", relatedEntity: "בזק", user: "משה אברהם", relatedEvents: ["e26"] },
  { id: "e39", title: "בדיקה תקופתית OSHA", description: "בטיחות בעבודה - בדיקה שנתית הצליחה", entityType: "operations", eventType: "inspection", severity: "info", date: "2026-04-09T10:45:00", relatedEntity: "כלל המפעל", user: "רחל דוד" },
  { id: "e40", title: "תלונת לקוח - אלקטרה", description: "איחור של יומיים במסירה דחופה", entityType: "customers", eventType: "complaint", severity: "medium", date: "2026-04-09T14:20:00", relatedEntity: "אלקטרה", user: "יוסי כהן" },
  { id: "e41", title: "תשלום - בזק", description: "תשלום התקבל על ההזמנה המקורית", entityType: "customers", eventType: "payment_received", severity: "info", date: "2026-04-09T15:30:00", relatedEntity: "בזק", user: "דנה לוי", amount: 345000 },
  { id: "e42", title: "חוזה - ספק חדש", description: "ספק חדש לחומרי פלסטיק - הסכם שנתי", entityType: "suppliers", eventType: "contract_signing", severity: "medium", date: "2026-04-09T16:45:00", relatedEntity: "ספק פלסטיק ד'", user: "אלון פרץ", amount: 780000 },
  { id: "e43", title: "פרויקט זתא - תכנון", description: "תכנון ראשוני לפרויקט גדול חדש", entityType: "projects", eventType: "meeting", severity: "info", date: "2026-04-10T09:00:00", relatedEntity: "פרויקט זתא", user: "יוסי כהן" },
  { id: "e44", title: "כשל QC חמור - קו 3", description: "15% פסילה - חקירה מיוחדת נפתחה", entityType: "operations", eventType: "qc_failure", severity: "critical", date: "2026-04-10T10:30:00", relatedEntity: "קו ייצור 3", user: "רחל דוד", relatedEvents: ["e17", "e14"] },
  { id: "e45", title: "משלוח דחוף - תעש ישראל", description: "משלוח הזמנה #4521 יצא לדרך", entityType: "customers", eventType: "shipment", severity: "info", date: "2026-04-10T11:15:00", relatedEntity: "תעש ישראל", user: "משה אברהם", relatedEvents: ["e1"] },
  { id: "e46", title: "הזמנה #4533 - אלביט", description: "למרות עיכובי תשלום בעבר - הזמנה חדשה", entityType: "customers", eventType: "order_placed", severity: "medium", date: "2026-04-10T12:00:00", relatedEntity: "אלביט", user: "אלון פרץ", amount: 450000 },
  { id: "e47", title: "פגישת דירקטוריון רבעונית", description: "סקירת ביצועי Q1 2026 - עודף 12%", entityType: "operations", eventType: "meeting", severity: "info", date: "2026-04-10T13:30:00", relatedEntity: "הנהלה", user: "מנכ\"ל" },
  { id: "e48", title: "תקרית - הפסקת חשמל", description: "הפסקת חשמל למשך שעתיים - קו 1 וקו 2", entityType: "operations", eventType: "incident", severity: "high", date: "2026-04-10T14:00:00", relatedEntity: "מפעל ראשי", user: "תפעול" },
  { id: "e49", title: "תשלום חלקי - אלביט", description: "עוד 20% מהחשבונית הישנה שולמו", entityType: "customers", eventType: "payment_received", severity: "info", date: "2026-04-10T15:20:00", relatedEntity: "אלביט", user: "דנה לוי", amount: 78000 },
  { id: "e50", title: "משלוח - פרויקט אפסילון", description: "משלוח חומרים לפרויקט החדש", entityType: "projects", eventType: "shipment", severity: "info", date: "2026-04-10T16:00:00", relatedEntity: "פרויקט אפסילון", user: "משה אברהם" },
  { id: "e51", title: "חוזה חדש - ספק בדיקות", description: "חוזה עם מעבדה חיצונית לבדיקות איכות", entityType: "suppliers", eventType: "contract_signing", severity: "medium", date: "2026-04-10T17:00:00", relatedEntity: "מעבדת בדיקות ICL", user: "רחל דוד", amount: 245000 },
  { id: "e52", title: "בדיקת סייבר חיצונית", description: "penetration test הסתיים - 3 ממצאים בינוניים", entityType: "operations", eventType: "inspection", severity: "medium", date: "2026-04-10T17:30:00", relatedEntity: "מערכת IT", user: "אבטחת מידע" },
];

export default function TimelineAnalysis() {
  const [selectedEventId, setSelectedEventId] = useState<string>("e44");
  const [entityFilter, setEntityFilter] = useState<EntityType | "all">("all");
  const [severityFilter, setSeverityFilter] = useState<Severity | "all">("all");
  const [eventTypeFilter, setEventTypeFilter] = useState<EventType | "all">("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [granularity, setGranularity] = useState<Granularity>("day");
  const [dateStart, setDateStart] = useState("2026-02-01");
  const [dateEnd, setDateEnd] = useState("2026-04-10");

  const { data } = useQuery({
    queryKey: ["timeline-analysis"],
    queryFn: async () => {
      try {
        const res = await authFetch("/api/palantir/timeline-analysis");
        if (!res.ok) throw new Error("fallback");
        return await res.json();
      } catch {
        return { events: MOCK_EVENTS };
      }
    },
  });

  const events: TimelineEvent[] = data?.events || MOCK_EVENTS;

  const filteredEvents = useMemo(() => {
    return events.filter((e) => {
      if (entityFilter !== "all" && e.entityType !== entityFilter) return false;
      if (severityFilter !== "all" && e.severity !== severityFilter) return false;
      if (eventTypeFilter !== "all" && e.eventType !== eventTypeFilter) return false;
      if (searchTerm && !e.title.includes(searchTerm) && !e.relatedEntity.includes(searchTerm)) return false;
      const d = new Date(e.date).getTime();
      if (d < new Date(dateStart).getTime() || d > new Date(dateEnd + "T23:59:59").getTime()) return false;
      return true;
    });
  }, [events, entityFilter, severityFilter, eventTypeFilter, searchTerm, dateStart, dateEnd]);

  const selected = events.find((e) => e.id === selectedEventId);
  const relatedEvents = selected?.relatedEvents?.map((id) => events.find((e) => e.id === id)).filter(Boolean) as TimelineEvent[] | undefined;

  const stats = {
    total: filteredEvents.length,
    critical: filteredEvents.filter((e) => e.severity === "critical").length,
    high: filteredEvents.filter((e) => e.severity === "high").length,
    byEntity: {
      customers: filteredEvents.filter((e) => e.entityType === "customers").length,
      suppliers: filteredEvents.filter((e) => e.entityType === "suppliers").length,
      projects: filteredEvents.filter((e) => e.entityType === "projects").length,
      operations: filteredEvents.filter((e) => e.entityType === "operations").length,
    },
  };

  // Position events on timeline
  const startTime = new Date(dateStart).getTime();
  const endTime = new Date(dateEnd + "T23:59:59").getTime();
  const totalRange = endTime - startTime;

  const getX = (dateStr: string) => {
    const t = new Date(dateStr).getTime();
    return ((t - startTime) / totalRange) * 100;
  };

  const swimlanes: EntityType[] = ["customers", "suppliers", "projects", "operations"];
  const swimlaneY: Record<EntityType, number> = {
    customers: 60,
    suppliers: 150,
    projects: 240,
    operations: 330,
  };

  // Detect anomaly clusters (3+ events in same 24h window)
  const anomalyClusters: { date: string; count: number; events: TimelineEvent[] }[] = [];
  const sortedEvents = [...filteredEvents].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  for (let i = 0; i < sortedEvents.length; i++) {
    const cluster = [sortedEvents[i]];
    const start = new Date(sortedEvents[i].date).getTime();
    for (let j = i + 1; j < sortedEvents.length; j++) {
      if (new Date(sortedEvents[j].date).getTime() - start < 86400000) cluster.push(sortedEvents[j]);
      else break;
    }
    if (cluster.length >= 3 && cluster.some((e) => e.severity === "critical" || e.severity === "high")) {
      anomalyClusters.push({ date: sortedEvents[i].date, count: cluster.length, events: cluster });
      i += cluster.length - 1;
    }
  }

  // Recurring events (same type, same entity)
  const recurring: { entity: string; eventType: EventType; count: number }[] = [];
  const grouped: Record<string, number> = {};
  filteredEvents.forEach((e) => {
    const key = `${e.relatedEntity}||${e.eventType}`;
    grouped[key] = (grouped[key] || 0) + 1;
  });
  Object.entries(grouped)
    .filter(([_, count]) => count >= 2)
    .forEach(([key, count]) => {
      const [entity, eventType] = key.split("||");
      recurring.push({ entity, eventType: eventType as EventType, count });
    });

  const timelineHeight = 420;

  return (
    <div dir="rtl" className="min-h-screen bg-[#0a0e1a] text-white p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-gradient-to-br from-cyan-500/20 to-indigo-500/20 border border-cyan-500/40">
            <Clock className="h-7 w-7 text-cyan-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Timeline Analysis — ניתוח ציר זמן</h1>
            <p className="text-sm text-gray-400">ניתוח אירועים עסקיים לאורך זמן — זיהוי דפוסים, אנומליות והתנהגויות חוזרות</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-cyan-500/40 text-cyan-400">{events.length} אירועים במערכת</Badge>
          <Badge variant="outline" className="border-indigo-500/40 text-indigo-400">טווח {Math.ceil(totalRange / 86400000)} ימים</Badge>
        </div>
      </div>

      {/* Filter bar */}
      <Card className="bg-[#111827] border-[#1f2937] mb-4">
        <CardContent className="p-4">
          <div className="grid grid-cols-6 gap-3">
            <div>
              <div className="text-xs text-gray-400 mb-1">מתאריך</div>
              <Input type="date" value={dateStart} onChange={(e) => setDateStart(e.target.value)} className="bg-[#0a0e1a] border-[#1f2937] h-9 text-xs" />
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-1">עד תאריך</div>
              <Input type="date" value={dateEnd} onChange={(e) => setDateEnd(e.target.value)} className="bg-[#0a0e1a] border-[#1f2937] h-9 text-xs" />
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-1">סוג ישות</div>
              <select value={entityFilter} onChange={(e) => setEntityFilter(e.target.value as any)} className="w-full bg-[#0a0e1a] border border-[#1f2937] rounded-md px-3 py-2 text-xs h-9">
                <option value="all">הכל</option>
                {swimlanes.map((e) => <option key={e} value={e}>{ENTITY_CONFIG[e].label}</option>)}
              </select>
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-1">סוג אירוע</div>
              <select value={eventTypeFilter} onChange={(e) => setEventTypeFilter(e.target.value as any)} className="w-full bg-[#0a0e1a] border border-[#1f2937] rounded-md px-3 py-2 text-xs h-9">
                <option value="all">הכל</option>
                {Object.entries(EVENT_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-1">חומרה</div>
              <select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value as any)} className="w-full bg-[#0a0e1a] border border-[#1f2937] rounded-md px-3 py-2 text-xs h-9">
                <option value="all">הכל</option>
                {(Object.keys(SEVERITY_CONFIG) as Severity[]).map((s) => <option key={s} value={s}>{SEVERITY_CONFIG[s].label}</option>)}
              </select>
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-1">חיפוש</div>
              <div className="relative">
                <Search className="h-3.5 w-3.5 absolute right-3 top-2.5 text-gray-500" />
                <Input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="bg-[#0a0e1a] border-[#1f2937] h-9 text-xs pr-9" placeholder="טקסט חופשי..." />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats row */}
      <div className="grid grid-cols-6 gap-3 mb-4">
        <Card className="bg-[#111827] border-[#1f2937]">
          <CardContent className="p-3">
            <div className="text-[10px] text-gray-400">סה"כ אירועים</div>
            <div className="text-xl font-bold text-cyan-400">{stats.total}</div>
          </CardContent>
        </Card>
        <Card className="bg-[#111827] border-red-500/30">
          <CardContent className="p-3">
            <div className="text-[10px] text-gray-400">קריטיים</div>
            <div className="text-xl font-bold text-red-400">{stats.critical}</div>
          </CardContent>
        </Card>
        <Card className="bg-[#111827] border-orange-500/30">
          <CardContent className="p-3">
            <div className="text-[10px] text-gray-400">חמורים</div>
            <div className="text-xl font-bold text-orange-400">{stats.high}</div>
          </CardContent>
        </Card>
        <Card className="bg-[#111827] border-[#1f2937]">
          <CardContent className="p-3">
            <div className="text-[10px] text-gray-400">אשכולות אנומליה</div>
            <div className="text-xl font-bold text-amber-400">{anomalyClusters.length}</div>
          </CardContent>
        </Card>
        <Card className="bg-[#111827] border-[#1f2937]">
          <CardContent className="p-3">
            <div className="text-[10px] text-gray-400">דפוסים חוזרים</div>
            <div className="text-xl font-bold text-purple-400">{recurring.length}</div>
          </CardContent>
        </Card>
        <Card className="bg-[#111827] border-[#1f2937]">
          <CardContent className="p-3">
            <div className="text-[10px] text-gray-400">רזולוציה</div>
            <div className="flex items-center gap-1 mt-0.5">
              {(["hour", "day", "week", "month"] as Granularity[]).map((g) => (
                <button key={g} onClick={() => setGranularity(g)} className={`text-[10px] px-2 py-1 rounded ${granularity === g ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/40" : "text-gray-500 border border-[#1f2937]"}`}>
                  {g === "hour" ? "ש" : g === "day" ? "י" : g === "week" ? "ש'" : "ח"}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main content: Left list / Middle timeline / Right details */}
      <div className="grid grid-cols-12 gap-4">
        {/* LEFT: Event list */}
        <div className="col-span-3">
          <Card className="bg-[#111827] border-[#1f2937] h-full">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-white text-sm">
                <Filter className="h-4 w-4 text-cyan-400" />
                רשימת אירועים ({filteredEvents.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[680px] overflow-y-auto">
                {[...filteredEvents].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((ev) => {
                  const sev = SEVERITY_CONFIG[ev.severity];
                  const ent = ENTITY_CONFIG[ev.entityType];
                  const isSelected = ev.id === selectedEventId;
                  return (
                    <div
                      key={ev.id}
                      onClick={() => setSelectedEventId(ev.id)}
                      className={`px-3 py-2.5 border-b border-[#1f2937] cursor-pointer hover:bg-[#0a0e1a] ${isSelected ? "bg-cyan-500/10 border-r-2 border-r-cyan-500" : ""}`}
                    >
                      <div className="flex items-start gap-2">
                        <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: sev.bgHex }} />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium truncate">{ev.title}</div>
                          <div className="text-[10px] text-gray-500 mt-0.5 flex items-center gap-2">
                            <span className={ent.color}>{ent.label}</span>
                            <span>•</span>
                            <span>{new Date(ev.date).toLocaleDateString("he-IL")}</span>
                            <span>•</span>
                            <span>{new Date(ev.date).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* MIDDLE: Timeline + bottom patterns */}
        <div className="col-span-6 space-y-4">
          <Card className="bg-[#111827] border-[#1f2937]">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-white text-sm">
                  <Activity className="h-4 w-4 text-cyan-400" />
                  ציר זמן ויזואלי — {swimlanes.length} נתיבים
                </CardTitle>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0"><ZoomIn className="h-3.5 w-3.5" /></Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0"><ZoomOut className="h-3.5 w-3.5" /></Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0"><ChevronLeft className="h-3.5 w-3.5" /></Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0"><ChevronRight className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg bg-[#0a0e1a] border border-[#1f2937] overflow-hidden">
                <svg viewBox={`0 0 1000 ${timelineHeight}`} className="w-full" style={{ height: `${timelineHeight}px` }}>
                  <defs>
                    <linearGradient id="laneGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#1f2937" stopOpacity="0.3" />
                      <stop offset="100%" stopColor="#1f2937" stopOpacity="0.1" />
                    </linearGradient>
                  </defs>
                  {/* Time axis */}
                  <line x1="100" y1="20" x2="980" y2="20" stroke="#374151" strokeWidth="1" />
                  {Array.from({ length: 11 }).map((_, i) => {
                    const x = 100 + (i / 10) * 880;
                    const date = new Date(startTime + (i / 10) * totalRange);
                    return (
                      <g key={i}>
                        <line x1={x} y1="18" x2={x} y2="24" stroke="#6b7280" strokeWidth="1" />
                        <text x={x} y="14" fill="#9ca3af" fontSize="9" textAnchor="middle">
                          {date.toLocaleDateString("he-IL", { month: "short", day: "numeric" })}
                        </text>
                      </g>
                    );
                  })}

                  {/* Swimlanes */}
                  {swimlanes.map((lane, i) => {
                    const y = swimlaneY[lane];
                    const cfg = ENTITY_CONFIG[lane];
                    return (
                      <g key={lane}>
                        <rect x="100" y={y - 30} width="880" height="60" fill="url(#laneGradient)" stroke="#1f2937" strokeWidth="0.5" />
                        <text x="90" y={y + 4} fill={cfg.bgHex} fontSize="10" textAnchor="end" fontWeight="bold">
                          {cfg.label}
                        </text>
                        <line x1="100" y1={y} x2="980" y2={y} stroke="#1f2937" strokeWidth="0.5" strokeDasharray="2,4" />
                      </g>
                    );
                  })}

                  {/* Events as dots */}
                  {filteredEvents.map((ev) => {
                    const x = 100 + (getX(ev.date) / 100) * 880;
                    const y = swimlaneY[ev.entityType];
                    const sev = SEVERITY_CONFIG[ev.severity];
                    const isSelected = ev.id === selectedEventId;
                    const r = ev.severity === "critical" ? 7 : ev.severity === "high" ? 6 : 5;
                    return (
                      <g key={ev.id} onClick={() => setSelectedEventId(ev.id)} style={{ cursor: "pointer" }}>
                        {isSelected && (
                          <circle cx={x} cy={y} r={r + 5} fill="none" stroke={sev.bgHex} strokeWidth="2" className="animate-pulse" />
                        )}
                        <circle cx={x} cy={y} r={r + 2} fill={sev.bgHex} fillOpacity="0.2" />
                        <circle cx={x} cy={y} r={r} fill={sev.bgHex} stroke={isSelected ? "white" : "#0a0e1a"} strokeWidth={isSelected ? 2 : 1} />
                      </g>
                    );
                  })}

                  {/* Anomaly cluster markers */}
                  {anomalyClusters.map((cluster, i) => {
                    const x = 100 + (getX(cluster.date) / 100) * 880;
                    return (
                      <g key={i}>
                        <line x1={x} y1="25" x2={x} y2={timelineHeight - 40} stroke="#ef4444" strokeWidth="1" strokeDasharray="3,3" strokeOpacity="0.4" />
                        <rect x={x - 14} y={timelineHeight - 35} width="28" height="14" rx="3" fill="#ef4444" fillOpacity="0.2" stroke="#ef4444" />
                        <text x={x} y={timelineHeight - 25} fill="#fca5a5" fontSize="8" textAnchor="middle">{cluster.count}</text>
                      </g>
                    );
                  })}
                </svg>
              </div>

              {/* Legend */}
              <div className="flex items-center gap-4 mt-3 justify-center text-[10px]">
                {(Object.entries(SEVERITY_CONFIG) as [Severity, typeof SEVERITY_CONFIG.info][]).map(([key, cfg]) => (
                  <div key={key} className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cfg.bgHex }} />
                    <span className="text-gray-400">{cfg.label}</span>
                  </div>
                ))}
                <div className="flex items-center gap-1.5 pr-4 border-r border-[#1f2937]">
                  <div className="w-2.5 h-2.5 rounded bg-red-500/30 border border-red-500" />
                  <span className="text-gray-400">אשכול אנומליות</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Pattern Detection */}
          <div className="grid grid-cols-2 gap-4">
            <Card className="bg-[#111827] border-[#1f2937]">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-white text-xs">
                  <AlertCircle className="h-3.5 w-3.5 text-red-400" />
                  אשכולות אנומליה שזוהו
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 max-h-[220px] overflow-y-auto">
                {anomalyClusters.length === 0 ? (
                  <div className="text-[11px] text-gray-500 text-center py-4">לא זוהו אשכולות חריגים</div>
                ) : (
                  anomalyClusters.map((cluster, i) => (
                    <div key={i} className="p-2 rounded bg-red-500/5 border border-red-500/20">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[11px] font-semibold text-red-400">אשכול #{i + 1}</span>
                        <Badge variant="outline" className="h-4 text-[9px] border-red-500/40 text-red-400">{cluster.count} אירועים</Badge>
                      </div>
                      <div className="text-[10px] text-gray-400">{new Date(cluster.date).toLocaleDateString("he-IL")} — {cluster.events[0].title.substring(0, 35)}...</div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card className="bg-[#111827] border-[#1f2937]">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-white text-xs">
                  <GitBranch className="h-3.5 w-3.5 text-purple-400" />
                  אירועים חוזרים
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 max-h-[220px] overflow-y-auto">
                {recurring.slice(0, 8).map((r, i) => (
                  <div key={i} className="flex items-center justify-between p-2 rounded bg-purple-500/5 border border-purple-500/20">
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] font-semibold text-purple-400 truncate">{r.entity}</div>
                      <div className="text-[10px] text-gray-500">{EVENT_TYPE_LABELS[r.eventType]}</div>
                    </div>
                    <Badge variant="outline" className="h-4 text-[9px] border-purple-500/40 text-purple-400">{r.count}x</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* RIGHT: Selected event details */}
        <div className="col-span-3">
          {selected && (
            <Card className="bg-[#111827] border-[#1f2937] h-full">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <CardTitle className="flex items-center gap-2 text-white text-sm">
                    <Zap className="h-4 w-4 text-cyan-400" />
                    פרטי האירוע
                  </CardTitle>
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setSelectedEventId("")}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2">
                  <Badge style={{ backgroundColor: SEVERITY_CONFIG[selected.severity].bgHex + "30", color: SEVERITY_CONFIG[selected.severity].textHex, borderColor: SEVERITY_CONFIG[selected.severity].bgHex + "80" }}>
                    {SEVERITY_CONFIG[selected.severity].label}
                  </Badge>
                  <Badge variant="outline" className={ENTITY_CONFIG[selected.entityType].color + " border-[#1f2937]"}>
                    {ENTITY_CONFIG[selected.entityType].label}
                  </Badge>
                </div>
                <div className="text-sm font-bold text-white">{selected.title}</div>
                <div className="text-xs text-gray-400 leading-relaxed">{selected.description}</div>

                <div className="border-t border-[#1f2937] pt-3 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">תאריך:</span>
                    <span className="text-white">{new Date(selected.date).toLocaleDateString("he-IL")}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">שעה:</span>
                    <span className="text-white">{new Date(selected.date).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">ישות:</span>
                    <span className="text-cyan-400">{selected.relatedEntity}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">אחראי:</span>
                    <span className="text-white">{selected.user}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">סוג:</span>
                    <span className="text-white">{EVENT_TYPE_LABELS[selected.eventType]}</span>
                  </div>
                  {selected.amount && (
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">סכום:</span>
                      <span className="text-green-400 font-bold">₪{selected.amount.toLocaleString()}</span>
                    </div>
                  )}
                </div>

                {relatedEvents && relatedEvents.length > 0 && (
                  <div className="border-t border-[#1f2937] pt-3">
                    <div className="text-xs text-gray-500 mb-2 flex items-center gap-1">
                      <GitBranch className="h-3 w-3" /> אירועים קשורים
                    </div>
                    <div className="space-y-1.5">
                      {relatedEvents.map((re) => (
                        <div
                          key={re.id}
                          onClick={() => setSelectedEventId(re.id)}
                          className="p-2 rounded bg-[#0a0e1a] border border-[#1f2937] hover:border-cyan-500/40 cursor-pointer"
                        >
                          <div className="flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: SEVERITY_CONFIG[re.severity].bgHex }} />
                            <div className="text-[11px] truncate">{re.title}</div>
                          </div>
                          <div className="text-[9px] text-gray-500 mt-0.5">{new Date(re.date).toLocaleDateString("he-IL")}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <Button className="w-full h-8 text-xs bg-cyan-600 hover:bg-cyan-700">
                  <Target className="h-3 w-3 ml-1" /> העבר לחקירה
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Distribution by entity */}
      <div className="grid grid-cols-4 gap-4 mt-4">
        {swimlanes.map((lane) => {
          const cfg = ENTITY_CONFIG[lane];
          const Icon = cfg.icon;
          const count = stats.byEntity[lane];
          const pct = stats.total > 0 ? (count / stats.total) * 100 : 0;
          return (
            <Card key={lane} className="bg-[#111827] border-[#1f2937]">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <Icon className={`h-5 w-5 ${cfg.color}`} />
                  <span className="text-2xl font-bold" style={{ color: cfg.bgHex }}>{count}</span>
                </div>
                <div className="text-xs text-gray-400">{cfg.label}</div>
                <div className="h-1 bg-[#0a0e1a] rounded-full overflow-hidden mt-2">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: cfg.bgHex }} />
                </div>
                <div className="text-[10px] text-gray-500 mt-1">{pct.toFixed(1)}% מכלל האירועים</div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
