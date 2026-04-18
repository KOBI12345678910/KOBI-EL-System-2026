import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  BarChart3, FileText, Users, Package, CreditCard, Download, FileSpreadsheet,
  TrendingUp, AlertTriangle, Receipt, Wallet, Scale, DollarSign, BookOpen,
  Search, Printer, Calendar, ChevronLeft, ShoppingCart, Mail, MessageSquare,
  Repeat, Building2, Clock, Ban, Gift, Phone, Landmark, CheckCircle, XCircle,
  ArrowLeftRight, Eye, Link2, UserX, Timer, CreditCard as CreditCardIcon,
  ListChecks, FileCheck, ShieldAlert, ArrowDown, ArrowUp, Banknote
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { authJson } from "@/lib/utils";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";

const API = "/api";
function fmt(n: number) { return new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", minimumFractionDigits: 0 }).format(n); }

const REPORT_SECTIONS = [
  {
    title: "לקוחות",
    color: "text-cyan-400",
    borderColor: "border-cyan-500/30",
    bgColor: "bg-cyan-500/5",
    reports: [
      { id: "all-customers", label: "כל הלקוחות", icon: Users, href: "/customers", desc: "רשימת כל הלקוחות במערכת" },
      { id: "customers-contact", label: "לקוחות ליצירת קשר", icon: Phone, href: "/customers", desc: "לקוחות שדרוש איתם קשר" },
      { id: "birthdays", label: "ימי הולדת קרובים", icon: Gift, href: "/customers", desc: "לקוחות עם ימי הולדת קרובים" },
      { id: "beneficiary-ledger", label: "כרטסת מוטב / מחויב", icon: BookOpen, href: "/finance/customer-vendor-ledger", desc: "כרטסת לפי מוטב או מחויב" },
      { id: "debtors-balances", label: "חייבים / יתרות", icon: Wallet, href: "/finance/debtors-balances", desc: "יתרות חייבים ופירוט חובות" },
    ],
  },
  {
    title: "דוחות הכנסות",
    color: "text-green-400",
    borderColor: "border-green-500/30",
    bgColor: "bg-green-500/5",
    reports: [
      { id: "income-expenses", label: "דוח הכנסות והוצאות", icon: BarChart3, href: "/finance/income-expenses-report", desc: "סיכום הכנסות והוצאות לפי תקופה" },
      { id: "all-documents", label: "כל המסמכים", icon: FileText, href: "/finance/income", desc: "רשימת כל מסמכי ההכנסה" },
      { id: "all-accounting-docs", label: "כל המסמכים החשבונאיים", icon: BookOpen, href: "/finance/invoices", desc: "חשבוניות מס, קבלות, תעודות משלוח" },
      { id: "income-by-customer-invoices", label: "הכנסות לפי לקוח/ה (חשבוניות)", icon: Users, href: "/finance/customers/invoices", desc: "פילוח הכנסות לפי לקוחות — חשבוניות" },
      { id: "income-by-customer-receipts", label: "הכנסות לפי לקוח/ה (קבלות)", icon: Users, href: "/finance/customers/payments", desc: "פילוח הכנסות לפי לקוחות — קבלות" },
      { id: "income-by-product", label: "סיכום הכנסות לפי מוצר/שירות", icon: Package, href: "/finance/invoice-analysis", desc: "סיכום הכנסות מפורט לפי מוצר" },
      { id: "sales-qty-by-product", label: "כמות מכירות לפי מוצר/שירות", icon: Package, href: "/finance/invoice-analysis", desc: "כמויות שנמכרו לפי מוצר" },
      { id: "sales-summary", label: "סיכום מכירות", icon: TrendingUp, href: "/finance/income-expenses-report", desc: "סיכום מכירות כללי לתקופה" },
      { id: "income-by-payment-type", label: "סיכום הכנסות לפי סוג תשלום", icon: CreditCard, href: "/finance/income", desc: "הכנסות לפי שיק, אשראי, מזומן, העברה" },
      { id: "income-no-linked-doc", label: "הכנסות ללא מסמך מקושר", icon: FileText, href: "/finance/income", desc: "הכנסות שלא קושרו למסמך חשבונאי" },
    ],
  },
  {
    title: "דוחות הוצאות",
    color: "text-orange-400",
    borderColor: "border-orange-500/30",
    bgColor: "bg-orange-500/5",
    reports: [
      { id: "expenses-by-item", label: "סיכום הוצאות לפי פריט הוצאה", icon: Receipt, href: "/finance/expenses", desc: "פילוח הוצאות לפי סוג פריט" },
      { id: "expenses-by-supplier", label: "סיכום הוצאות לפי ספק/ית", icon: Building2, href: "/finance/suppliers/invoices", desc: "פילוח הוצאות לפי ספקים" },
      { id: "suppliers-awaiting-payment", label: "ספקים מחכים לתשלום", icon: Clock, href: "/finance/suppliers/payments", desc: "ספקים עם חשבוניות פתוחות לתשלום" },
      { id: "payments-awaiting-invoice", label: "תשלומים מחכים לחשבונית", icon: FileCheck, href: "/finance/payment-runs", desc: "תשלומים שבוצעו ללא חשבונית מתאימה" },
      { id: "duplicate-expenses-check", label: "בדיקת הוצאות כפולות", icon: ShieldAlert, href: "/finance/expenses", desc: "זיהוי הוצאות חשודות ככפולות" },
      { id: "open-payment-requests", label: "בקשות תשלום פתוחות", icon: Receipt, href: "/finance/payment-runs", desc: "דרישות תשלום שטרם שולמו" },
      { id: "supplier-invoices-unpaid", label: "חשבוניות ספק ללא תשלום", icon: AlertTriangle, href: "/finance/suppliers/invoices", desc: "חשבוניות ספקים שלא שולמו" },
      { id: "income-expenses-report-2", label: "דוח הכנסות והוצאות", icon: BarChart3, href: "/finance/income-expenses-report", desc: "דוח הכנסות והוצאות מפורט" },
    ],
  },
  {
    title: "סליקת אשראי",
    color: "text-violet-400",
    borderColor: "border-violet-500/30",
    bgColor: "bg-violet-500/5",
    reports: [
      { id: "cc-charge-history", label: "היסטוריית חיובים", icon: CreditCard, href: "/finance/credit-card-processing", desc: "כל חיובי האשראי שבוצעו" },
      { id: "cc-monthly-charges", label: "כל הסליקות לפי חודש", icon: Calendar, href: "/finance/credit-card-processing", desc: "ריכוז סליקות חודשי" },
      { id: "cc-by-company", label: "ריכוזים לפי חברות סליקה", icon: Building2, href: "/finance/credit-card-processing", desc: "סיכום לפי חברת סליקה" },
      { id: "cc-failed-charges", label: "חיובים שנכשלו", icon: XCircle, href: "/finance/credit-card-processing", desc: "סליקות שנכשלו ודורשות טיפול" },
      { id: "cc-expiring-cards", label: "תוקף כרטיס עומד להסתיים", icon: Timer, href: "/finance/credit-card-processing", desc: "כרטיסי אשראי עם תוקף קרוב" },
      { id: "cc-refunds", label: "זיכויים שבוצעו", icon: ArrowLeftRight, href: "/finance/customers/refunds", desc: "כל הזיכויים שבוצעו בסליקה" },
    ],
  },
  {
    title: "דפי תשלום",
    color: "text-teal-400",
    borderColor: "border-teal-500/30",
    bgColor: "bg-teal-500/5",
    reports: [
      { id: "pp-purchase-history", label: "היסטוריית רכישות", icon: ShoppingCart, href: "/finance/income", desc: "כל הרכישות דרך דפי תשלום" },
      { id: "pp-sales-amount-catalog", label: "סכום מכירות לחודש לפי קטלוג", icon: DollarSign, href: "/finance/invoice-analysis", desc: "סיכום מכירות חודשי לפי קטלוג" },
      { id: "pp-sales-qty-catalog", label: "כמות מכירות לחודש לפי קטלוג", icon: Package, href: "/finance/invoice-analysis", desc: "כמות מכירות חודשית לפי קטלוג" },
      { id: "pp-sales-amount-coupon", label: "סכום מכירות לחודש לפי קופון", icon: DollarSign, href: "/finance/income-expenses-report", desc: "סיכום מכירות חודשי לפי קופון" },
      { id: "pp-sales-qty-coupon", label: "כמות מכירות לחודש לפי קופון", icon: Package, href: "/finance/income-expenses-report", desc: "כמות מכירות חודשית לפי קופון" },
    ],
  },
  {
    title: "חיוב מס\"ב",
    color: "text-amber-400",
    borderColor: "border-amber-500/30",
    bgColor: "bg-amber-500/5",
    reports: [
      { id: "masav-charge-history", label: "היסטוריית חיובים", icon: Landmark, href: "/finance/bank-reconciliation", desc: "כל חיובי המס\"ב שבוצעו" },
      { id: "masav-monthly", label: "כל החיובים לפי חודש", icon: Calendar, href: "/finance/bank-reconciliation", desc: "ריכוז חיובי מס\"ב חודשי" },
      { id: "masav-expiring-auth", label: "תוקף הרשאה עומד להסתיים", icon: Timer, href: "/finance/bank-reconciliation", desc: "הרשאות מס\"ב שעומדות לפוג" },
    ],
  },
  {
    title: "הוראות קבע",
    color: "text-indigo-400",
    borderColor: "border-indigo-500/30",
    bgColor: "bg-indigo-500/5",
    reports: [
      { id: "so-active", label: "הוראות קבע פעילות", icon: CheckCircle, href: "/finance/standing-orders", desc: "כל הוראות הקבע הפעילות" },
      { id: "so-all", label: "כל הוראות הקבע", icon: ListChecks, href: "/finance/standing-orders", desc: "רשימה מלאה של הוראות קבע" },
      { id: "so-upcoming", label: "הוראות קבע לחיוב בקרוב", icon: Clock, href: "/finance/standing-orders", desc: "חיובים קרובים מהוראות קבע" },
      { id: "so-ended", label: "הוראות קבע שהסתיימו", icon: Ban, href: "/finance/standing-orders", desc: "הוראות קבע שכבר לא פעילות" },
      { id: "so-by-customers", label: "סיכום לפי לקוחות", icon: Users, href: "/finance/standing-orders", desc: "הוראות קבע מקובצות לפי לקוח" },
      { id: "so-by-products", label: "סיכום לפי מוצרים/שירותים", icon: Package, href: "/finance/standing-orders", desc: "הוראות קבע לפי מוצר" },
      { id: "so-active-charges-summary", label: "סיכום חיובים פעילים", icon: DollarSign, href: "/finance/standing-orders", desc: "סה\"כ חיובים מהוראות פעילות" },
      { id: "so-needs-attention", label: "הוראות קבע דורשות טיפול", icon: AlertTriangle, href: "/finance/standing-orders", desc: "הוראות קבע עם בעיות" },
      { id: "so-no-end-date", label: "הוראות קבע ללא תאריך סיום", icon: Calendar, href: "/finance/standing-orders", desc: "הוראות ללא תאריך סיום מוגדר" },
      { id: "so-by-end-date", label: "הוראות קבע לפי תאריך סיום", icon: Calendar, href: "/finance/standing-orders", desc: "מיון לפי תאריך סיום" },
      { id: "so-inconsistent-dates", label: "לקוחות עם תאריכים לא אחידים", icon: ShieldAlert, href: "/finance/aging-report", desc: "אי-התאמות בתאריכי חיוב" },
      { id: "so-expiring-cards", label: "תוקף כרטיס עומד להסתיים", icon: Timer, href: "/finance/credit-card-processing", desc: "כרטיסים עם תוקף קרוב" },
    ],
  },
  {
    title: "דוח גביה מפורט",
    color: "text-rose-400",
    borderColor: "border-rose-500/30",
    bgColor: "bg-rose-500/5",
    reports: [
      { id: "detailed-collection", label: "דוח גביה מפורט", icon: Banknote, href: "/finance/aging-report", desc: "דוח גביה מלא עם פירוט תשלומים" },
    ],
  },
  {
    title: "דוחות כספיים",
    color: "text-purple-400",
    borderColor: "border-purple-500/30",
    bgColor: "bg-purple-500/5",
    reports: [
      { id: "trial-balance", label: "מאזן בוחן", icon: Scale, href: "/finance/balance-sheet", desc: "מאזן בוחן מפורט" },
      { id: "profit-loss", label: "רווח והפסד", icon: TrendingUp, href: "/finance/profit-loss", desc: "דוח רווח והפסד" },
      { id: "balance-sheet", label: "מאזן", icon: Scale, href: "/finance/balance-sheet", desc: "מאזן כללי" },
      { id: "aging-report", label: "דוח גיול חובות", icon: Calendar, href: "/finance/aging-report", desc: "גיול AP/AR" },
      { id: "cash-flow", label: "דוח תזרים מזומנים", icon: Wallet, href: "/finance/reports", desc: "תזרים מזומנים" },
      { id: "annual-report", label: "דוח שנתי", icon: BarChart3, href: "/finance/executive-summary", desc: "דוח שנתי מסכם" },
    ],
  },
  {
    title: "דוחות מערכת",
    color: "text-blue-400",
    borderColor: "border-blue-500/30",
    bgColor: "bg-blue-500/5",
    reports: [
      { id: "download-period-docs", label: "הורדת מסמכים לתקופה", icon: Download, href: "/finance/expense-files", desc: "הורדת כל המסמכים בטווח תאריכים" },
      { id: "export-hashbeshbet", label: "יצוא לחשבשבת", icon: FileSpreadsheet, href: "/finance/accounting-export", desc: "ייצוא נתונים חודשיים לתוכנת חשבשבת / פריורטי" },
      { id: "operational-profit", label: "רווח תפעולי", icon: TrendingUp, href: "/finance/operational-profit", desc: "דוח רווח תפעולי לפי תקופה" },
    ],
  },
  {
    title: "דיוור במייל",
    color: "text-sky-400",
    borderColor: "border-sky-500/30",
    bgColor: "bg-sky-500/5",
    reports: [
      { id: "email-messages-report", label: "דוח מסרים", icon: Mail, href: "/communications", desc: "היסטוריית מסרים שנשלחו במייל" },
      { id: "email-link-clicks", label: "קישורים במסרים", icon: Link2, href: "/communications", desc: "מעקב אחר לחיצות בקישורים" },
      { id: "email-blocked-recipients", label: "נמענים חסומים", icon: UserX, href: "/communications", desc: "נמענים שחסמו קבלת מיילים" },
    ],
  },
  {
    title: "שליחת סמסים",
    color: "text-lime-400",
    borderColor: "border-lime-500/30",
    bgColor: "bg-lime-500/5",
    reports: [
      { id: "sms-messages-report", label: "דוח מסרונים", icon: MessageSquare, href: "/communications", desc: "היסטוריית מסרונים שנשלחו" },
      { id: "sms-blocked-recipients", label: "נמענים חסומים", icon: UserX, href: "/communications", desc: "נמענים שחסמו קבלת סמסים" },
    ],
  },
];

function ReportDetailView({ reportId, onBack }: { reportId: string; onBack: () => void }) {
  const [dateFrom, setDateFrom] = useState(() => { const d = new Date(); d.setMonth(0, 1); return d.toISOString().slice(0, 10); });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const token = localStorage.getItem("erp_token") || "";
  const headers: Record<string, string> = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const EXPENSE_REPORTS = [
    "expenses-by-item", "expenses-by-supplier", "suppliers-awaiting-payment",
    "payments-awaiting-invoice", "duplicate-expenses-check", "supplier-invoices-unpaid", "open-payment-requests"
  ];
  const isExpenseReport = EXPENSE_REPORTS.includes(reportId);

  const { data, isLoading } = useQuery({
    queryKey: ["accounting-report", reportId, dateFrom, dateTo],
    queryFn: async () => {
      const dateParams = `&date_from=${dateFrom}&date_to=${dateTo}`;
      let url = "";
      if (isExpenseReport) {
        url = `${API}/finance/expenses?limit=1000${dateParams}`;
      } else {
        switch (reportId) {
          case "open-invoices":
          case "open-transaction-invoices":
            url = `${API}/finance/income?status=draft&limit=1000${dateParams}`;
            break;
          default:
            url = `${API}/finance/income?limit=1000${dateParams}`;
        }
      }
      const res = await fetch(url, { headers });
      return res.json();
    },
  });

  const rawData = data?.data || data?.items || [];
  const items = Array.isArray(rawData) ? rawData : [];
  const reportInfo = REPORT_SECTIONS.flatMap(s => s.reports).find(r => r.id === reportId);

  const getAmount = (item: any) => Number(item.total_amount || item.amount || 0);

  const groupByField = (arr: any[], field: string) => {
    const groups: Record<string, { items: any[]; total: number }> = {};
    arr.forEach((item: any) => {
      const key = item[field] || "לא ידוע";
      if (!groups[key]) groups[key] = { items: [], total: 0 };
      groups[key].items.push(item);
      groups[key].total += getAmount(item);
    });
    return Object.entries(groups).sort((a, b) => b[1].total - a[1].total);
  };

  const renderContent = () => {
    if (isLoading) return <div className="text-center py-12 text-muted-foreground">טוען דוח...</div>;

    if (reportId === "income-by-customer-invoices" || reportId === "income-by-customer-receipts") {
      const grouped = groupByField(items, "customer_name");
      return (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700/50 bg-slate-800/30">
              <th className="p-3 text-right text-muted-foreground">לקוח/ה</th>
              <th className="p-3 text-right text-muted-foreground">מס' מסמכים</th>
              <th className="p-3 text-right text-muted-foreground">סה"כ</th>
            </tr>
          </thead>
          <tbody>
            {grouped.map(([name, g]) => (
              <tr key={name} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                <td className="p-3 text-foreground font-medium">{name}</td>
                <td className="p-3 text-slate-300">{g.items.length}</td>
                <td className="p-3 text-green-400 font-medium">{fmt(g.total)}</td>
              </tr>
            ))}
            {grouped.length === 0 && <tr><td colSpan={3} className="p-8 text-center text-muted-foreground">אין נתונים</td></tr>}
          </tbody>
          <tfoot>
            <tr className="bg-slate-800/50 font-bold">
              <td className="p-3 text-foreground">סה"כ</td>
              <td className="p-3 text-foreground">{items.length}</td>
              <td className="p-3 text-green-400">{fmt(items.reduce((s: number, i: any) => s + getAmount(i), 0))}</td>
            </tr>
          </tfoot>
        </table>
      );
    }

    if (reportId === "income-by-product" || reportId === "sales-qty-by-product") {
      const productMap: Record<string, { qty: number; total: number }> = {};
      items.forEach((item: any) => {
        const prods = (item.products || item.description || "שירותים").split(",");
        prods.forEach((p: string) => {
          const name = p.trim() || "אחר";
          if (!productMap[name]) productMap[name] = { qty: 0, total: 0 };
          productMap[name].qty += 1;
          productMap[name].total += Number(item.amount || 0) / prods.length;
        });
      });
      const sorted = Object.entries(productMap).sort((a, b) => b[1].total - a[1].total);
      return (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700/50 bg-slate-800/30">
              <th className="p-3 text-right text-muted-foreground">מוצר/שירות</th>
              <th className="p-3 text-right text-muted-foreground">כמות</th>
              <th className="p-3 text-right text-muted-foreground">סה"כ הכנסה</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(([name, d]) => (
              <tr key={name} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                <td className="p-3 text-foreground font-medium">{name}</td>
                <td className="p-3 text-slate-300">{d.qty}</td>
                <td className="p-3 text-green-400 font-medium">{fmt(d.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    }

    if (reportId === "income-by-payment-type") {
      const grouped = groupByField(items, "payment_method");
      const payLabels: Record<string, string> = { check: "שיק", credit_card: "סליקת אשראי", bank_transfer: "העברה בנקאית", cash: "מזומן" };
      return (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700/50 bg-slate-800/30">
              <th className="p-3 text-right text-muted-foreground">סוג תשלום</th>
              <th className="p-3 text-right text-muted-foreground">מס' מסמכים</th>
              <th className="p-3 text-right text-muted-foreground">סה"כ</th>
            </tr>
          </thead>
          <tbody>
            {grouped.map(([name, g]) => (
              <tr key={name} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                <td className="p-3 text-foreground font-medium">{payLabels[name] || name}</td>
                <td className="p-3 text-slate-300">{g.items.length}</td>
                <td className="p-3 text-green-400 font-medium">{fmt(g.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    }

    if (reportId === "expenses-by-item") {
      const grouped = groupByField(items, "category");
      return (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700/50 bg-slate-800/30">
              <th className="p-3 text-right text-muted-foreground">פריט הוצאה</th>
              <th className="p-3 text-right text-muted-foreground">מס' רשומות</th>
              <th className="p-3 text-right text-muted-foreground">סה"כ</th>
            </tr>
          </thead>
          <tbody>
            {grouped.map(([name, g]) => (
              <tr key={name} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                <td className="p-3 text-foreground font-medium">{name}</td>
                <td className="p-3 text-slate-300">{g.items.length}</td>
                <td className="p-3 text-red-400 font-medium">{fmt(g.total)}</td>
              </tr>
            ))}
            {grouped.length === 0 && <tr><td colSpan={3} className="p-8 text-center text-muted-foreground">אין נתונים</td></tr>}
          </tbody>
          <tfoot>
            <tr className="bg-slate-800/50 font-bold">
              <td className="p-3 text-foreground">סה"כ</td>
              <td className="p-3 text-foreground">{items.length}</td>
              <td className="p-3 text-red-400">{fmt(items.reduce((s: number, i: any) => s + Number(i.amount || i.total_amount || 0), 0))}</td>
            </tr>
          </tfoot>
        </table>
      );
    }

    if (reportId === "expenses-by-supplier") {
      const grouped = groupByField(items, "supplier_name");
      return (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700/50 bg-slate-800/30">
              <th className="p-3 text-right text-muted-foreground">ספק/ית</th>
              <th className="p-3 text-right text-muted-foreground">מס' חשבוניות</th>
              <th className="p-3 text-right text-muted-foreground">סה"כ</th>
            </tr>
          </thead>
          <tbody>
            {grouped.map(([name, g]) => (
              <tr key={name} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                <td className="p-3 text-foreground font-medium">{name}</td>
                <td className="p-3 text-slate-300">{g.items.length}</td>
                <td className="p-3 text-red-400 font-medium">{fmt(g.total)}</td>
              </tr>
            ))}
            {grouped.length === 0 && <tr><td colSpan={3} className="p-8 text-center text-muted-foreground">אין נתונים</td></tr>}
          </tbody>
        </table>
      );
    }

    if (reportId === "payments-awaiting-invoice" || reportId === "open-payment-requests") {
      const pending = items.filter((i: any) => !i.invoice_number && (i.status === "pending" || i.status === "paid" || i.status === "draft"));
      return (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700/50 bg-slate-800/30">
              <th className="p-3 text-right text-muted-foreground">ספק/ית</th>
              <th className="p-3 text-right text-muted-foreground">תאריך</th>
              <th className="p-3 text-right text-muted-foreground">סכום</th>
              <th className="p-3 text-right text-muted-foreground">קטגוריה</th>
              <th className="p-3 text-right text-muted-foreground">סטטוס</th>
            </tr>
          </thead>
          <tbody>
            {pending.map((item: any) => (
              <tr key={item.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                <td className="p-3 text-foreground font-medium">{item.supplier_name || "—"}</td>
                <td className="p-3 text-slate-300">{item.expense_date || item.invoice_date ? new Date(item.expense_date || item.invoice_date).toLocaleDateString("he-IL") : "—"}</td>
                <td className="p-3 text-orange-400 font-medium">{fmt(getAmount(item))}</td>
                <td className="p-3 text-slate-300">{item.category || "—"}</td>
                <td className="p-3"><Badge className="bg-orange-500/20 text-orange-400">ממתין לחשבונית</Badge></td>
              </tr>
            ))}
            {pending.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">אין תשלומים ממתינים לחשבונית</td></tr>}
          </tbody>
          <tfoot>
            <tr className="bg-slate-800/50 font-bold">
              <td className="p-3 text-foreground" colSpan={2}>סה"כ</td>
              <td className="p-3 text-orange-400">{fmt(pending.reduce((s: number, i: any) => s + getAmount(i), 0))}</td>
              <td className="p-3" colSpan={2}></td>
            </tr>
          </tfoot>
        </table>
      );
    }

    if (reportId === "suppliers-awaiting-payment" || reportId === "supplier-invoices-unpaid") {
      const unpaid = items.filter((i: any) => i.status === "pending" || i.status === "draft" || !i.payment_date);
      const grouped = groupByField(unpaid, "supplier_name");
      return (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700/50 bg-slate-800/30">
              <th className="p-3 text-right text-muted-foreground">ספק/ית</th>
              <th className="p-3 text-right text-muted-foreground">חשבוניות פתוחות</th>
              <th className="p-3 text-right text-muted-foreground">סה"כ לתשלום</th>
              <th className="p-3 text-right text-muted-foreground">סטטוס</th>
            </tr>
          </thead>
          <tbody>
            {grouped.map(([name, g]) => (
              <tr key={name} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                <td className="p-3 text-foreground font-medium">{name}</td>
                <td className="p-3 text-slate-300">{g.items.length}</td>
                <td className="p-3 text-yellow-400 font-medium">{fmt(g.total)}</td>
                <td className="p-3"><Badge className="bg-yellow-500/20 text-yellow-400">ממתין</Badge></td>
              </tr>
            ))}
            {grouped.length === 0 && <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">אין ספקים ממתינים לתשלום</td></tr>}
          </tbody>
        </table>
      );
    }

    if (reportId === "duplicate-expenses-check") {
      const dupeGroups: Record<string, any[]> = {};
      items.forEach((item: any) => {
        const key = `${item.amount || item.total_amount}_${item.supplier_name}_${item.invoice_date || item.expense_date}`;
        if (!dupeGroups[key]) dupeGroups[key] = [];
        dupeGroups[key].push(item);
      });
      const dupes = Object.entries(dupeGroups).filter(([, arr]) => arr.length > 1);
      return (
        <div>
          {dupes.length === 0 ? (
            <div className="text-center py-12">
              <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-3" />
              <p className="text-green-400 font-medium text-lg">לא נמצאו הוצאות חשודות ככפולות</p>
              <p className="text-muted-foreground mt-1">כל ההוצאות נראות תקינות</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50 bg-slate-800/30">
                  <th className="p-3 text-right text-muted-foreground">ספק</th>
                  <th className="p-3 text-right text-muted-foreground">סכום</th>
                  <th className="p-3 text-right text-muted-foreground">תאריך</th>
                  <th className="p-3 text-right text-muted-foreground">מס' כפילויות</th>
                </tr>
              </thead>
              <tbody>
                {dupes.map(([key, arr]) => (
                  <tr key={key} className="border-b border-slate-800/50 hover:bg-slate-800/30 bg-red-900/10">
                    <td className="p-3 text-foreground font-medium">{arr[0].supplier_name || "—"}</td>
                    <td className="p-3 text-red-400 font-medium">{fmt(Number(arr[0].amount || arr[0].total_amount || 0))}</td>
                    <td className="p-3 text-slate-300">{arr[0].invoice_date || arr[0].expense_date || "—"}</td>
                    <td className="p-3"><Badge className="bg-red-500/20 text-red-400">{arr.length} כפילויות</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      );
    }

    if (reportId === "beneficiary-ledger" || reportId === "detailed-collection") {
      const grouped = groupByField(items, "customer_name");
      return (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700/50 bg-slate-800/30">
              <th className="p-3 text-right text-muted-foreground">שם</th>
              <th className="p-3 text-right text-muted-foreground">מסמכים</th>
              <th className="p-3 text-right text-muted-foreground">יתרה</th>
              <th className="p-3 text-right text-muted-foreground">סטטוס</th>
            </tr>
          </thead>
          <tbody>
            {grouped.map(([name, g]) => (
              <tr key={name} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                <td className="p-3 text-foreground font-medium">{name}</td>
                <td className="p-3 text-slate-300">{g.items.length}</td>
                <td className="p-3 text-yellow-400 font-medium">{fmt(g.total)}</td>
                <td className="p-3">
                  <Badge className={g.total > 0 ? "bg-yellow-500/20 text-yellow-400" : "bg-green-500/20 text-green-400"}>
                    {g.total > 0 ? "חוב פתוח" : "מאוזן"}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    }

    if (reportId === "customers-contact" || reportId === "birthdays") {
      return (
        <div className="text-center py-12">
          <Users className="w-12 h-12 text-cyan-400 mx-auto mb-3" />
          <p className="text-muted-foreground text-lg font-medium">
            {reportId === "customers-contact" ? "לקוחות ליצירת קשר" : "ימי הולדת קרובים"}
          </p>
          <p className="text-muted-foreground mt-1">הדוח יוצג כאן בהתבסס על נתוני הלקוחות במערכת</p>
        </div>
      );
    }

    if (["cc-charge-history", "cc-monthly-charges", "cc-by-company", "cc-failed-charges", "cc-expiring-cards", "cc-refunds"].includes(reportId)) {
      return (
        <div className="text-center py-12">
          <CreditCard className="w-12 h-12 text-violet-400 mx-auto mb-3" />
          <p className="text-muted-foreground text-lg font-medium">סליקת אשראי</p>
          <p className="text-muted-foreground mt-1">חבר מערכת סליקה כדי לצפות בנתונים</p>
        </div>
      );
    }

    if (["pp-purchase-history", "pp-sales-amount-catalog", "pp-sales-qty-catalog", "pp-sales-amount-coupon", "pp-sales-qty-coupon"].includes(reportId)) {
      return (
        <div className="text-center py-12">
          <ShoppingCart className="w-12 h-12 text-teal-400 mx-auto mb-3" />
          <p className="text-muted-foreground text-lg font-medium">דפי תשלום</p>
          <p className="text-muted-foreground mt-1">הגדר דפי תשלום כדי לצפות בנתונים</p>
        </div>
      );
    }

    if (["masav-charge-history", "masav-monthly", "masav-expiring-auth"].includes(reportId)) {
      return (
        <div className="text-center py-12">
          <Landmark className="w-12 h-12 text-amber-400 mx-auto mb-3" />
          <p className="text-muted-foreground text-lg font-medium">חיוב מס"ב</p>
          <p className="text-muted-foreground mt-1">חבר שירות מס"ב כדי לצפות בנתונים</p>
        </div>
      );
    }

    if (reportId.startsWith("so-")) {
      return (
        <div className="text-center py-12">
          <Repeat className="w-12 h-12 text-indigo-400 mx-auto mb-3" />
          <p className="text-muted-foreground text-lg font-medium">הוראות קבע</p>
          <p className="text-muted-foreground mt-1">הגדר הוראות קבע כדי לצפות בנתונים</p>
        </div>
      );
    }

    if (["email-messages-report", "email-link-clicks", "email-blocked-recipients"].includes(reportId)) {
      return (
        <div className="text-center py-12">
          <Mail className="w-12 h-12 text-sky-400 mx-auto mb-3" />
          <p className="text-muted-foreground text-lg font-medium">דיוור במייל</p>
          <p className="text-muted-foreground mt-1">הגדר שירות דיוור כדי לצפות בנתוני שליחה</p>
        </div>
      );
    }

    if (["sms-messages-report", "sms-blocked-recipients"].includes(reportId)) {
      return (
        <div className="text-center py-12">
          <MessageSquare className="w-12 h-12 text-lime-400 mx-auto mb-3" />
          <p className="text-muted-foreground text-lg font-medium">שליחת סמסים</p>
          <p className="text-muted-foreground mt-1">הגדר שירות סמסים כדי לצפות בנתוני שליחה</p>
        </div>
      );
    }

    return (
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-700/50 bg-slate-800/30">
            <th className="p-3 text-right text-muted-foreground">מסמך</th>
            <th className="p-3 text-right text-muted-foreground">תאריך</th>
            <th className="p-3 text-right text-muted-foreground">{isExpenseReport ? "ספק" : "לקוח"}</th>
            <th className="p-3 text-right text-muted-foreground">סכום</th>
            <th className="p-3 text-right text-muted-foreground">סטטוס</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item: any) => {
            const date = item.invoice_date || item.expense_date;
            const name = isExpenseReport ? (item.supplier_name || "—") : (item.customer_name || "—");
            return (
              <tr key={item.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                <td className="p-3 text-foreground">{item.document_number || item.invoice_number || item.id}</td>
                <td className="p-3 text-slate-300">{date ? new Date(date).toLocaleDateString("he-IL") : "—"}</td>
                <td className="p-3 text-slate-300">{name}</td>
                <td className="p-3 text-green-400 font-medium">{fmt(getAmount(item))}</td>
                <td className="p-3"><Badge className="bg-slate-600 text-slate-300">{item.status || "—"}</Badge></td>
              </tr>
            );
          })}
          {items.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">אין נתונים</td></tr>}
        </tbody>
        <tfoot>
          <tr className="bg-slate-800/50 font-bold">
            <td className="p-3 text-foreground" colSpan={3}>סה"כ ({items.length} רשומות)</td>
            <td className="p-3 text-green-400">{fmt(items.reduce((s: number, i: any) => s + getAmount(i), 0))}</td>
            <td className="p-3"></td>
          </tr>
        </tfoot>
      </table>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="outline" className="border-slate-600" onClick={onBack}>
            <ChevronLeft className="w-4 h-4 ml-1" />חזרה לדוחות
          </Button>
          <h2 className="text-xl font-bold text-foreground">{reportInfo?.label}</h2>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 bg-slate-800 rounded-lg px-3 py-1.5 border border-slate-700">
            <span className="text-xs text-muted-foreground">מ:</span>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="bg-transparent text-sm text-foreground border-0 outline-none" />
            <span className="text-xs text-muted-foreground">עד:</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="bg-transparent text-sm text-foreground border-0 outline-none" />
          </div>
          <Button variant="outline" size="sm" className="border-slate-600"><Printer className="w-4 h-4 ml-1" />הדפסה</Button>
          <Button variant="outline" size="sm" className="border-slate-600"><Download className="w-4 h-4 ml-1" />ייצוא</Button>
        </div>
      </div>
      <Card className="bg-slate-900/50 border-slate-700/50">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            {renderContent()}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AccountingReportsPage() {
  const [activeReport, setActiveReport] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  if (activeReport) {
    return (
      <div className="space-y-4 sm:space-y-6" dir="rtl">
        <ReportDetailView reportId={activeReport} onBack={() => setActiveReport(null)} />
      </div>
    );
  }

  const filteredSections = searchQuery.trim()
    ? REPORT_SECTIONS.map(s => ({
        ...s,
        reports: s.reports.filter(r =>
          r.label.includes(searchQuery) || r.desc.includes(searchQuery)
        ),
      })).filter(s => s.reports.length > 0)
    : REPORT_SECTIONS;

  const totalReports = REPORT_SECTIONS.reduce((sum, s) => sum + s.reports.length, 0);

  return (
    <div className="space-y-4 sm:space-y-6" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-emerald-400" /> דוחות מערכת
          </h1>
          <p className="text-muted-foreground mt-1">
            {REPORT_SECTIONS.length} קטגוריות · {totalReports} דוחות — הכנסות, הוצאות, לקוחות, סליקה, הוראות קבע ועוד
          </p>
        </div>
        <div className="relative w-72">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="חיפוש דוח..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pr-9 bg-slate-800 border-slate-700 text-foreground placeholder:text-muted-foreground"
          />
        </div>
      </div>

      {filteredSections.map((section) => (
        <Card key={section.title} className={`bg-slate-900/50 border-slate-700/50 ${section.bgColor}`}>
          <CardHeader className="pb-3">
            <CardTitle className={`text-lg flex items-center gap-2 ${section.color}`}>
              {section.title}
              <Badge variant="outline" className="text-xs border-slate-600 text-muted-foreground font-normal">{section.reports.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {section.reports.map((report) => {
                const isInternalLink = report.href.startsWith("/") && report.href !== "#";
                return (
                  <button
                    key={report.id}
                    className={`flex items-start gap-3 p-4 rounded-lg border transition-all text-right ${section.borderColor} hover:bg-slate-800/50 bg-slate-800/20`}
                    onClick={() => {
                      if (isInternalLink) {
                        window.location.href = report.href;
                      } else {
                        setActiveReport(report.id);
                      }
                    }}
                  >
                    <div className="mt-0.5">
                      <report.icon className={`w-5 h-5 ${section.color}`} />
                    </div>
                    <div>
                      <div className="text-foreground font-medium text-sm">{report.label}</div>
                      <div className="text-muted-foreground text-xs mt-0.5">{report.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ))}

      {filteredSections.length === 0 && (
        <div className="text-center py-16">
          <Search className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground text-lg">לא נמצאו דוחות מתאימים ל-"{searchQuery}"</p>
          <Button variant="link" className="text-blue-400 mt-2" onClick={() => setSearchQuery("")}>נקה חיפוש</Button>
        </div>
      )}

      <div className="mt-8 space-y-6">
        <RelatedRecords
          tabs={[
            {
              key: "journal_entries",
              label: "פקודות יומן אחרונות",
              icon: "documents",
              endpoint: `${API}/journal-entries?limit=5`,
              columns: [
                { key: "entry_number", label: "מספר" },
                { key: "date", label: "תאריך" },
                { key: "description", label: "תיאור" },
                { key: "amount", label: "סכום" },
              ],
            },
            {
              key: "recent_transactions",
              label: "תנועות אחרונות",
              icon: "payments",
              endpoint: `${API}/transactions?limit=5`,
              columns: [
                { key: "transaction_number", label: "מספר" },
                { key: "date", label: "תאריך" },
                { key: "type", label: "סוג" },
                { key: "amount", label: "סכום" },
              ],
            },
          ]}
        />
        <ActivityLog entityType="accounting-reports" />
      </div>
    </div>
  );
}
