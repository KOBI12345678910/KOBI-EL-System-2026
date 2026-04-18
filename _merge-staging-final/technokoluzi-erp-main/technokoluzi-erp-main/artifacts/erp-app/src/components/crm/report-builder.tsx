import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Download,
  Calendar,
  Clock,
  Play,
  Save,
  FileText,
  X,
  GripVertical,
} from "lucide-react";
import { toast } from "sonner";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
  ScatterChart,
  Scatter,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ComposedChart,
} from "recharts";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { useQuery } from "@tanstack/react-query";
import { entityList } from "@/lib/entity-api";

interface ReportData {
  leads?: Record<string, unknown>[];
  opportunities?: Record<string, unknown>[];
  customers?: Record<string, unknown>[];
  deals?: Record<string, unknown>[];
  activities?: Record<string, unknown>[];
}

interface ReportBuilderProps {
  data: ReportData;
  onSave?: (report: Record<string, unknown>) => void;
}

const METRICS = [
  { id: "leads_count", label: "מספר לידים", category: "leads" },
  { id: "leads_qualified", label: "לידים מוסמכים", category: "leads" },
  { id: "leads_conversion_rate", label: "שיעור המרת לידים", category: "leads" },
  { id: "opportunities_count", label: "מספר הזדמנויות", category: "opportunities" },
  { id: "opportunities_value", label: "ערך הזדמנויות", category: "opportunities" },
  { id: "deals_won", label: "עסקאות שנסגרו", category: "deals" },
  { id: "deals_revenue", label: "הכנסות מעסקאות", category: "deals" },
  { id: "deals_avg_size", label: "גודל עסקה ממוצע", category: "deals" },
  { id: "customers_count", label: "מספר לקוחות", category: "customers" },
  { id: "customers_active", label: "לקוחות פעילים", category: "customers" },
  { id: "customers_ltv", label: "LTV ממוצע", category: "customers" },
  { id: "activities_count", label: "מספר פעילויות", category: "activities" },
  { id: "win_rate", label: "Win Rate", category: "performance" },
  { id: "pipeline_value", label: "ערך Pipeline", category: "performance" },
];

const DATE_RANGES = [
  { id: "today", label: "היום" },
  { id: "yesterday", label: "אתמול" },
  { id: "last_7_days", label: "7 ימים אחרונים" },
  { id: "last_30_days", label: "30 ימים אחרונים" },
  { id: "this_month", label: "החודש" },
  { id: "last_month", label: "חודש שעבר" },
  { id: "this_quarter", label: "רבעון נוכחי" },
  { id: "last_quarter", label: "רבעון קודם" },
  { id: "this_year", label: "השנה" },
  { id: "custom", label: "טווח מותאם" },
];

const CHART_TYPES = [
  { id: "bar", label: "עמודות" },
  { id: "line", label: "קו" },
  { id: "area", label: "אזור" },
  { id: "pie", label: "עוגה" },
  { id: "scatter", label: "פיזור (Scatter)" },
  { id: "radar", label: "רדאר" },
  { id: "composed", label: "משולב" },
  { id: "table", label: "טבלה" },
];

const COLORS = ["#6366f1", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981"];

export default function ReportBuilder({ data, onSave }: ReportBuilderProps) {
  const [reportName, setReportName] = useState("דוח חדש");
  const [selectedMetrics, setSelectedMetrics] = useState(["leads_count", "deals_won"]);
  const [dateRange, setDateRange] = useState("last_30_days");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [chartType, setChartType] = useState("bar");
  const [groupBy, setGroupBy] = useState("day");
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleFrequency, setScheduleFrequency] = useState("weekly");
  const [scheduleDay, setScheduleDay] = useState("monday");
  const [scheduleTime, setScheduleTime] = useState("09:00");
  const [scheduleRecipients, setScheduleRecipients] = useState("");
  const [pdfBranding, setPdfBranding] = useState(true);

  const { data: companyConfig } = useQuery({
    queryKey: ["company-config"],
    queryFn: async () => {
      const configs = await entityList<Record<string, unknown>>("company-configs");
      return configs[0] || {};
    },
  });

  const {
    leads = [],
    opportunities = [],
    customers = [],
    deals = [],
    activities = [],
  } = data;

  const calculateMetric = (metricId: string): number => {
    switch (metricId) {
      case "leads_count": return leads.length;
      case "leads_qualified": return leads.filter((l) => l.status === "qualified").length;
      case "leads_conversion_rate":
        return leads.length > 0
          ? Number(((deals.filter((d) => d.status === "won").length / leads.length) * 100).toFixed(1))
          : 0;
      case "opportunities_count": return opportunities.length;
      case "opportunities_value":
        return opportunities.reduce((sum, o) => sum + ((o.estimated_value as number) || 0), 0);
      case "deals_won": return deals.filter((d) => d.status === "won").length;
      case "deals_revenue":
        return deals.filter((d) => d.status === "won").reduce((sum, d) => sum + ((d.deal_value as number) || 0), 0);
      case "deals_avg_size": {
        const wonDeals = deals.filter((d) => d.status === "won");
        return wonDeals.length > 0
          ? Math.round(wonDeals.reduce((sum, d) => sum + ((d.deal_value as number) || 0), 0) / wonDeals.length)
          : 0;
      }
      case "customers_count": return customers.length;
      case "customers_active": return customers.filter((c) => c.status === "active").length;
      case "customers_ltv":
        return customers.length > 0
          ? Math.round(customers.reduce((sum, c) => sum + ((c.lifetime_value as number) || 0), 0) / customers.length)
          : 0;
      case "activities_count": return activities.length;
      case "win_rate": {
        const closedDeals = deals.filter((d) => ["won", "lost"].includes(d.status as string));
        return closedDeals.length > 0
          ? Number(((deals.filter((d) => d.status === "won").length / closedDeals.length) * 100).toFixed(1))
          : 0;
      }
      case "pipeline_value":
        return deals.filter((d) => d.status === "active").reduce((sum, d) => sum + ((d.deal_value as number) || 0), 0);
      default: return 0;
    }
  };

  const toggleMetric = (metricId: string) => {
    setSelectedMetrics((prev) =>
      prev.includes(metricId) ? prev.filter((m) => m !== metricId) : [...prev, metricId]
    );
  };

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const items = Array.from(selectedMetrics);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
    setSelectedMetrics(items);
  };

  const getMetricLabel = (metricId: string) =>
    METRICS.find((m) => m.id === metricId)?.label || metricId;

  const chartData = selectedMetrics.map((metricId) => ({
    name: getMetricLabel(metricId),
    value: calculateMetric(metricId),
  }));

  const exportToCSV = () => {
    const headers = ["מדד", "ערך"];
    const rows = selectedMetrics.map((metricId) => [
      getMetricLabel(metricId),
      String(calculateMetric(metricId)),
    ]);
    const csvContent = [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");
    const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${reportName}_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    toast.success("הדוח יוצא בהצלחה");
  };

  const exportToPDF = async () => {
    const reportElement = document.getElementById("report-preview");
    if (!reportElement) return;
    try {
      const pdf = new jsPDF("p", "mm", "a4");
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      if (pdfBranding && companyConfig) {
        pdf.setFontSize(18);
        pdf.setTextColor(99, 102, 241);
        pdf.text((companyConfig.company_name as string) || "MetalPro ERP", 50, 15);
        pdf.setFontSize(16);
        pdf.setTextColor(0, 0, 0);
        pdf.text(reportName, pageWidth / 2, 40, { align: "center" });
        pdf.setDrawColor(99, 102, 241);
        pdf.setLineWidth(0.5);
        pdf.line(10, 52, pageWidth - 10, 52);
      }
      const canvas = await html2canvas(reportElement);
      const imgData = canvas.toDataURL("image/png");
      const imgWidth = pageWidth - 20;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      const startY = pdfBranding ? 60 : 10;
      pdf.addImage(imgData, "PNG", 10, startY, imgWidth, imgHeight);
      pdf.setFontSize(8);
      pdf.setTextColor(150, 150, 150);
      pdf.text(
        `נוצר על ידי MetalPro ERP | ${new Date().toLocaleString("he-IL")}`,
        pageWidth / 2,
        pageHeight - 10,
        { align: "center" }
      );
      pdf.save(`${reportName}_${new Date().toISOString().split("T")[0]}.pdf`);
      toast.success("הדוח יוצא ל-PDF בהצלחה");
    } catch {
      toast.error("שגיאה בייצוא PDF");
    }
  };

  const saveReport = () => {
    const report = {
      name: reportName,
      metrics: selectedMetrics,
      dateRange,
      chartType,
      groupBy,
      created: new Date().toISOString(),
    };
    if (onSave) onSave(report);
    toast.success("הדוח נשמר בהצלחה");
  };

  const scheduleReport = () => {
    toast.success(`הדוח תוזמן ל-${scheduleFrequency} ב-${scheduleDay} בשעה ${scheduleTime}`);
    setScheduleOpen(false);
  };

  const renderChart = () => {
    if (chartData.length === 0) return null;
    switch (chartType) {
      case "bar":
        return (<ResponsiveContainer width="100%" height={300}><BarChart data={chartData}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="name" /><YAxis /><Tooltip /><Legend /><Bar dataKey="value" fill="#6366f1" radius={[8, 8, 0, 0]} /></BarChart></ResponsiveContainer>);
      case "line":
        return (<ResponsiveContainer width="100%" height={300}><LineChart data={chartData}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="name" /><YAxis /><Tooltip /><Legend /><Line type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={3} /></LineChart></ResponsiveContainer>);
      case "area":
        return (<ResponsiveContainer width="100%" height={300}><AreaChart data={chartData}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="name" /><YAxis /><Tooltip /><Legend /><Area type="monotone" dataKey="value" stroke="#6366f1" fill="#6366f1" fillOpacity={0.6} /></AreaChart></ResponsiveContainer>);
      case "pie":
        return (<ResponsiveContainer width="100%" height={300}><PieChart><Pie data={chartData} cx="50%" cy="50%" labelLine={false} label={({ name, value }: { name: string; value: number }) => `${name}: ${value}`} outerRadius={100} fill="#8884d8" dataKey="value">{chartData.map((_, index) => (<Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />))}</Pie><Tooltip /></PieChart></ResponsiveContainer>);
      case "scatter": {
        const scatterData = chartData.map((item, idx) => ({ x: idx + 1, y: item.value, name: item.name }));
        return (<ResponsiveContainer width="100%" height={300}><ScatterChart><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis type="number" dataKey="x" name="Index" /><YAxis type="number" dataKey="y" name="Value" /><Tooltip cursor={{ strokeDasharray: "3 3" }} /><Legend /><Scatter name="מדדים" data={scatterData} fill="#8b5cf6" /></ScatterChart></ResponsiveContainer>);
      }
      case "radar":
        return (<ResponsiveContainer width="100%" height={300}><RadarChart data={chartData}><PolarGrid stroke="#e2e8f0" /><PolarAngleAxis dataKey="name" /><PolarRadiusAxis /><Tooltip /><Legend /><Radar name="מדדים" dataKey="value" stroke="#6366f1" fill="#6366f1" fillOpacity={0.6} /></RadarChart></ResponsiveContainer>);
      case "composed":
        return (<ResponsiveContainer width="100%" height={300}><ComposedChart data={chartData}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="name" /><YAxis /><Tooltip /><Legend /><Bar dataKey="value" fill="#6366f1" radius={[8, 8, 0, 0]} /><Line type="monotone" dataKey="value" stroke="#8b5cf6" strokeWidth={2} /></ComposedChart></ResponsiveContainer>);
      case "table":
        return (<div className="overflow-x-auto"><table className="w-full"><thead><tr className="border-b"><th className="text-right p-3 font-semibold">מדד</th><th className="text-right p-3 font-semibold">ערך</th></tr></thead><tbody>{chartData.map((item, idx) => (<tr key={idx} className="border-b hover:bg-slate-50"><td className="p-3">{item.name}</td><td className="p-3 font-semibold">{item.value.toLocaleString()}</td></tr>))}</tbody></table></div>);
      default: return null;
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="border-0 shadow-lg">
          <CardHeader><CardTitle className="text-lg">בחירת מדדים</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {Object.entries(METRICS.reduce<Record<string, typeof METRICS>>((acc, metric) => { if (!acc[metric.category]) acc[metric.category] = []; acc[metric.category].push(metric); return acc; }, {})).map(([category, metrics]) => (
                <div key={category} className="space-y-2">
                  <p className="text-xs font-semibold text-slate-500 uppercase mt-3">{category}</p>
                  {metrics.map((metric) => (
                    <div key={metric.id} className="flex items-center gap-2">
                      <Checkbox checked={selectedMetrics.includes(metric.id)} onCheckedChange={() => toggleMetric(metric.id)} />
                      <Label className="text-sm cursor-pointer">{metric.label}</Label>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-lg">
          <CardHeader><CardTitle className="text-lg">הגדרות דוח</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div><Label>שם הדוח</Label><Input value={reportName} onChange={(e) => setReportName(e.target.value)} className="mt-1" /></div>
            <div><Label>טווח תאריכים</Label><Select value={dateRange} onValueChange={setDateRange}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent>{DATE_RANGES.map((r) => (<SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>))}</SelectContent></Select></div>
            {dateRange === "custom" && (<div className="grid grid-cols-2 gap-2"><div><Label className="text-xs">מתאריך</Label><Input type="date" value={customStartDate} onChange={(e) => setCustomStartDate(e.target.value)} className="mt-1" /></div><div><Label className="text-xs">עד תאריך</Label><Input type="date" value={customEndDate} onChange={(e) => setCustomEndDate(e.target.value)} className="mt-1" /></div></div>)}
            <div><Label>סוג תצוגה</Label><Select value={chartType} onValueChange={setChartType}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent>{CHART_TYPES.map((t) => (<SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>))}</SelectContent></Select></div>
            <div><Label>קיבוץ לפי</Label><Select value={groupBy} onValueChange={setGroupBy}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="day">יום</SelectItem><SelectItem value="week">שבוע</SelectItem><SelectItem value="month">חודש</SelectItem><SelectItem value="quarter">רבעון</SelectItem></SelectContent></Select></div>
            <div className="pt-4 space-y-2"><Button onClick={saveReport} className="w-full gap-2"><Save className="w-4 h-4" />שמור דוח</Button><Button onClick={() => setScheduleOpen(true)} variant="outline" className="w-full gap-2"><Clock className="w-4 h-4" />תזמן דוח</Button></div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-lg">
          <CardHeader><CardTitle className="text-lg">פעולות מהירות</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <Button onClick={exportToCSV} variant="outline" className="w-full gap-2 justify-start"><FileText className="w-4 h-4" />ייצא ל-CSV</Button>
            <Button onClick={exportToPDF} variant="outline" className="w-full gap-2 justify-start"><Download className="w-4 h-4" />ייצא ל-PDF</Button>
            <div className="pt-4"><p className="text-sm font-semibold mb-2">מדדים נבחרים (גרור לסידור):</p>
              <DragDropContext onDragEnd={handleDragEnd}><Droppable droppableId="metrics">{(provided) => (<div {...provided.droppableProps} ref={provided.innerRef} className="space-y-2">{selectedMetrics.map((metricId, index) => (<Draggable key={metricId} draggableId={metricId} index={index}>{(provided) => (<div ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps} className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg border"><GripVertical className="w-4 h-4 text-slate-400" /><span className="flex-1 text-sm">{getMetricLabel(metricId)}</span><X className="w-4 h-4 cursor-pointer text-slate-400 hover:text-red-600" onClick={() => toggleMetric(metricId)} /></div>)}</Draggable>))}{provided.placeholder}</div>)}</Droppable></DragDropContext>
            </div>
            <div className="pt-4 border-t"><div className="flex items-center justify-between mb-2"><Label className="text-sm">PDF עם מיתוג חברה</Label><Checkbox checked={pdfBranding} onCheckedChange={(v) => setPdfBranding(v as boolean)} /></div></div>
          </CardContent>
        </Card>
      </div>
      <Card className="border-0 shadow-lg" id="report-preview">
        <CardHeader><div className="flex items-center justify-between"><CardTitle className="text-xl">{reportName}</CardTitle><div className="flex items-center gap-2 text-sm text-slate-500"><Calendar className="w-4 h-4" /><span>{DATE_RANGES.find((r) => r.id === dateRange)?.label}</span></div></div></CardHeader>
        <CardContent>{selectedMetrics.length > 0 ? renderChart() : (<div className="text-center py-12"><FileText className="w-16 h-16 mx-auto text-slate-300 mb-4" /><p className="text-slate-400">בחר מדדים כדי להציג את הדוח</p></div>)}</CardContent>
      </Card>
      <Sheet open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <SheetContent side="left" className="w-full sm:max-w-md">
          <SheetHeader><SheetTitle>תזמון דוח אוטומטי</SheetTitle></SheetHeader>
          <div className="space-y-4 mt-6">
            <div><Label>תדירות</Label><Select value={scheduleFrequency} onValueChange={setScheduleFrequency}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="hourly">כל שעה</SelectItem><SelectItem value="daily">יומי</SelectItem><SelectItem value="weekly">שבועי</SelectItem><SelectItem value="biweekly">דו-שבועי</SelectItem><SelectItem value="monthly">חודשי</SelectItem><SelectItem value="quarterly">רבעוני</SelectItem><SelectItem value="yearly">שנתי</SelectItem></SelectContent></Select></div>
            {scheduleFrequency === "weekly" && (<div><Label>יום בשבוע</Label><Select value={scheduleDay} onValueChange={setScheduleDay}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="sunday">ראשון</SelectItem><SelectItem value="monday">שני</SelectItem><SelectItem value="tuesday">שלישי</SelectItem><SelectItem value="wednesday">רביעי</SelectItem><SelectItem value="thursday">חמישי</SelectItem><SelectItem value="friday">שישי</SelectItem></SelectContent></Select></div>)}
            <div><Label>שעה</Label><Input type="time" value={scheduleTime} onChange={(e) => setScheduleTime(e.target.value)} className="mt-1" /></div>
            <div><Label>נמענים (מופרדים בפסיק)</Label><Input value={scheduleRecipients} onChange={(e) => setScheduleRecipients(e.target.value)} placeholder="email@example.com, email2@example.com" className="mt-1" /></div>
            <Button onClick={scheduleReport} className="w-full gap-2"><Play className="w-4 h-4" />אשר תזמון</Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
