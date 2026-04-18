import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Calculator, TrendingUp, DollarSign, BarChart3,
  CheckCircle, AlertTriangle, Percent, Ruler,
  FileText, Scale, ArrowLeftRight, ChevronLeft
} from "lucide-react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { authJson, authFetch } from "@/lib/utils";
import { VAT_RATE } from "@/utils/money";
import RelatedRecords from "@/components/related-records";
import AttachmentsSection from "@/components/attachments-section";
import ActivityLog from "@/components/activity-log";
import { useFormValidation, FormFieldError, RequiredMark } from "@/hooks/use-form-validation";

const API = "/api";

function fmt(n: number) {
  return new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", minimumFractionDigits: 0 }).format(n);
}

const RECOMMENDATION_LABELS: Record<string, string> = {
  percent: "אחוזים",
  sqm: "מ״ר",
  equal: "שווה",
};

const RECOMMENDATION_COLORS: Record<string, string> = {
  percent: "bg-blue-500/20 text-blue-400",
  sqm: "bg-purple-500/20 text-purple-400",
  equal: "bg-muted/20 text-muted-foreground",
};

export default function ContractorDecisionPage() {
  const [calcForm, setCalcForm] = useState({
    invoiceAmount: "",
    squareMeters: "",
    ratePerSqm: "85",
    contractorPercent: "30",
  });

  const [calcResult, setCalcResult] = useState<any>(null);
  const [detailTab, setDetailTab] = useState("details");
  const calcValidation = useFormValidation({ invoiceAmount: { required: true, min: 1 }, squareMeters: { required: true, min: 1 } });

  const calcMutation = useMutation({
    mutationFn: async (data: typeof calcForm) => {
      const res = await authFetch(`${API}/crm/contractor-decision/calculate`, {
        method: "POST",
        body: JSON.stringify({
          invoiceAmount: Number(data.invoiceAmount),
          squareMeters: Number(data.squareMeters),
          ratePerSqm: Number(data.ratePerSqm),
          contractorPercent: Number(data.contractorPercent),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "שגיאה" }));
        throw new Error(err.error);
      }
      return res.json();
    },
    onSuccess: (data) => setCalcResult(data),
  });

  const { data: summaryData } = useQuery({
    queryKey: ["contractor-decision-summary"],
    queryFn: () => authJson(`${API}/crm/contractor-decision/summary`),
  });

  const { data: quotesData, isLoading: quotesLoading } = useQuery({
    queryKey: ["contractor-decision-quotes"],
    queryFn: () => authJson(`${API}/crm/contractor-decision/quotes`),
  });

  const { data: dealsData, isLoading: dealsLoading } = useQuery({
    queryKey: ["contractor-decision-deals"],
    queryFn: () => authJson(`${API}/crm/contractor-decision/deals`),
  });

  const summary = summaryData || {};
  const quotes = quotesData?.quotes || [];
  const deals = dealsData?.deals || [];

  const handleCalculate = () => {
    if (!calcValidation.validate({ invoiceAmount: calcForm.invoiceAmount, squareMeters: calcForm.squareMeters })) return;
    calcMutation.mutate(calcForm);
  };

  const invoiceVal = Number(calcForm.invoiceAmount || 0);
  const exVat = invoiceVal > 0 ? Math.round((invoiceVal / (1 + VAT_RATE)) * 100) / 100 : 0;
  const livePercentCost = exVat * (Number(calcForm.contractorPercent || 0) / 100);
  const liveSqmCost = Number(calcForm.squareMeters || 0) * Number(calcForm.ratePerSqm || 0);

  return (
    <div className="space-y-4 sm:space-y-6" dir="rtl">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Link href="/crm" className="flex items-center gap-1 hover:text-foreground transition-colors">
          <ChevronLeft className="w-4 h-4" />
          CRM
        </Link>
        <span>/</span>
        <span className="text-foreground">מודל קבלת החלטות</span>
      </div>

      <div>
        <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-3">
          <Scale className="w-7 h-7 text-cyan-400" />
          מודל קבלת החלטות — תשלום קבלנים
        </h1>
        <p className="text-muted-foreground mt-1">
          השוואה: תשלום לפי אחוזים מהחשבונית מול תשלום לפי מ״ר — מה עדיף לחברה?
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-cyan-500/10 to-cyan-600/5 border-cyan-500/20">
          <CardContent className="p-4">
            <DollarSign className="w-8 h-8 text-cyan-400" />
            <p className="text-lg sm:text-2xl font-bold text-foreground mt-2">{fmt(summary.totalSavings || 0)}</p>
            <p className="text-xs text-cyan-400/70">חיסכון מצטבר</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
          <CardContent className="p-4">
            <BarChart3 className="w-8 h-8 text-green-400" />
            <p className="text-lg sm:text-2xl font-bold text-foreground mt-2">{summary.totalDeals || 0}</p>
            <p className="text-xs text-green-400/70">עסקאות שטופלו</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
          <CardContent className="p-4">
            <Percent className="w-8 h-8 text-blue-400" />
            <p className="text-lg sm:text-2xl font-bold text-foreground mt-2">{summary.percentRecommended || 0}</p>
            <p className="text-xs text-blue-400/70">המלצות: אחוזים</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-500/20">
          <CardContent className="p-4">
            <Ruler className="w-8 h-8 text-purple-400" />
            <p className="text-lg sm:text-2xl font-bold text-foreground mt-2">{summary.sqmRecommended || 0}</p>
            <p className="text-xs text-purple-400/70">המלצות: מ״ר</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Calculator className="w-5 h-5 text-primary" />
              מחשבון השוואת תשלום
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">סכום חשבונית כולל מע״מ (₪) <RequiredMark /></label>
                <input
                  value={calcForm.invoiceAmount}
                  onChange={e => setCalcForm(f => ({ ...f, invoiceAmount: e.target.value }))}
                  type="number"
                  placeholder="117,000"
                  className="w-full px-3 py-2 bg-card border border-border rounded-lg text-sm"
                />
                <FormFieldError error={calcValidation.errors.invoiceAmount} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">שטח (מ״ר) <RequiredMark /></label>
                <input
                  value={calcForm.squareMeters}
                  onChange={e => setCalcForm(f => ({ ...f, squareMeters: e.target.value }))}
                  type="number"
                  placeholder="50"
                  className="w-full px-3 py-2 bg-card border border-border rounded-lg text-sm"
                />
                <FormFieldError error={calcValidation.errors.squareMeters} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">תעריף למ״ר (₪)</label>
                <input
                  value={calcForm.ratePerSqm}
                  onChange={e => setCalcForm(f => ({ ...f, ratePerSqm: e.target.value }))}
                  type="number"
                  className="w-full px-3 py-2 bg-card border border-border rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">אחוז לקבלן (%)</label>
                <input
                  value={calcForm.contractorPercent}
                  onChange={e => setCalcForm(f => ({ ...f, contractorPercent: e.target.value }))}
                  type="number"
                  className="w-full px-3 py-2 bg-card border border-border rounded-lg text-sm"
                />
              </div>
            </div>

            <button
              onClick={handleCalculate}
              disabled={calcMutation.isPending || !calcForm.invoiceAmount || !calcForm.squareMeters}
              className="w-full px-4 py-2.5 bg-primary text-primary-foreground rounded-lg font-medium text-sm hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {calcMutation.isPending ? "מחשב..." : "חשב והשווה"}
            </button>

            {invoiceVal > 0 && (
              <div className="border-t border-border/50 pt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">סכום כולל מע״מ</span>
                  <span>{fmt(invoiceVal)}</span>
                </div>
                <div className="flex justify-between text-sm font-medium">
                  <span className="text-muted-foreground">סכום ללא מע״מ (÷{(1 + VAT_RATE).toFixed(2)})</span>
                  <span className="text-foreground">{fmt(exVat)}</span>
                </div>
                <div className="flex justify-between text-sm border-t border-border/30 pt-2">
                  <span className="text-blue-400 flex items-center gap-1"><Percent className="w-3 h-3" /> עלות לפי אחוז ({calcForm.contractorPercent}%)</span>
                  <span className="text-blue-400 font-medium">{fmt(livePercentCost)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-purple-400 flex items-center gap-1"><Ruler className="w-3 h-3" /> עלות לפי מ״ר ({calcForm.squareMeters} × ₪{calcForm.ratePerSqm})</span>
                  <span className="text-purple-400 font-medium">{fmt(liveSqmCost)}</span>
                </div>
              </div>
            )}

            {calcResult && (
              <div className={`p-4 rounded-xl border ${calcResult.recommendation === "percent" ? "bg-blue-500/10 border-blue-500/20" : calcResult.recommendation === "sqm" ? "bg-purple-500/10 border-purple-500/20" : "bg-muted/10 border-gray-500/20"}`}>
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="w-5 h-5 text-green-400" />
                  <span className="font-semibold text-foreground">
                    המלצה: תשלום לפי {RECOMMENDATION_LABELS[calcResult.recommendation] || calcResult.recommendation}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">עלות לפי אחוז:</span>
                    <span className="text-foreground mr-1">{fmt(calcResult.costByPercent)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">עלות לפי מ״ר:</span>
                    <span className="text-foreground mr-1">{fmt(calcResult.costBySqm)}</span>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-green-400" />
                  <span className="text-green-400 font-bold">חיסכון: {fmt(calcResult.savings)}</span>
                </div>
              </div>
            )}

            {calcMutation.isError && (
              <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                <AlertTriangle className="w-4 h-4 text-red-400" />
                <span className="text-xs text-red-300">{calcMutation.error?.message}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ArrowLeftRight className="w-5 h-5 text-primary" />
              סיכום פילוח שיטות תשלום
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="p-4 bg-blue-500/5 border border-blue-500/20 rounded-xl">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Percent className="w-5 h-5 text-blue-400" />
                    <span className="font-medium text-foreground">לפי אחוזים</span>
                  </div>
                  <span className="text-lg sm:text-2xl font-bold text-blue-400">{summary.percentRecommended || 0}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">עסקאות שבהן אחוזים היו עדיפים</p>
              </div>

              <div className="p-4 bg-purple-500/5 border border-purple-500/20 rounded-xl">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Ruler className="w-5 h-5 text-purple-400" />
                    <span className="font-medium text-foreground">לפי מ״ר</span>
                  </div>
                  <span className="text-lg sm:text-2xl font-bold text-purple-400">{summary.sqmRecommended || 0}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">עסקאות שבהן מ״ר היה עדיף</p>
              </div>

              <div className="p-4 bg-muted/5 border border-gray-500/20 rounded-xl">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Scale className="w-5 h-5 text-muted-foreground" />
                    <span className="font-medium text-foreground">שווה</span>
                  </div>
                  <span className="text-lg sm:text-2xl font-bold text-muted-foreground">{summary.equalRecommended || 0}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">עסקאות ללא הפרש</p>
              </div>

              {(summary.totalDeals || 0) > 0 && (
                <div className="p-4 bg-green-500/5 border border-green-500/20 rounded-xl text-center">
                  <p className="text-sm text-muted-foreground">חיסכון ממוצע לעסקה</p>
                  <p className="text-xl font-bold text-green-400 mt-1">{fmt(summary.avgSavingsPerDeal || 0)}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />
            הצעות מחיר פתוחות — השוואת תשלום אוטומטית
          </CardTitle>
        </CardHeader>
        <CardContent>
          {quotesLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500" />
            </div>
          ) : quotes.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">אין הצעות מחיר עם נתוני מ״ר וסכום</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50 text-muted-foreground text-xs">
                    <th className="text-right py-3 px-2">#</th>
                    <th className="text-right py-3 px-2">לקוח</th>
                    <th className="text-right py-3 px-2">סטטוס</th>
                    <th className="text-right py-3 px-2">סכום ללא מע״מ</th>
                    <th className="text-right py-3 px-2">מ״ר</th>
                    <th className="text-right py-3 px-2">עלות אחוז</th>
                    <th className="text-right py-3 px-2">עלות מ״ר</th>
                    <th className="text-right py-3 px-2">הפרש</th>
                    <th className="text-right py-3 px-2">המלצה</th>
                  </tr>
                </thead>
                <tbody>
                  {quotes.map((q: any) => (
                    <tr key={q.id} className="border-b border-border/20 hover:bg-muted/30 transition-colors">
                      <td className="py-2.5 px-2 text-muted-foreground">{q.id}</td>
                      <td className="py-2.5 px-2 font-medium text-foreground">{q.customerName || "—"}</td>
                      <td className="py-2.5 px-2">
                        <Badge variant="outline" className="text-xs">{q.status || "draft"}</Badge>
                      </td>
                      <td className="py-2.5 px-2">{q.amountExVat > 0 ? fmt(q.amountExVat) : "—"}</td>
                      <td className="py-2.5 px-2">{q.squareMeters > 0 ? `${q.squareMeters} מ״ר` : "—"}</td>
                      <td className="py-2.5 px-2 text-blue-400">{q.costByPercent > 0 ? fmt(q.costByPercent) : "—"}</td>
                      <td className="py-2.5 px-2 text-purple-400">{q.costBySqm > 0 ? fmt(q.costBySqm) : "—"}</td>
                      <td className="py-2.5 px-2 text-green-400 font-medium">{q.savings > 0 ? fmt(q.savings) : "—"}</td>
                      <td className="py-2.5 px-2">
                        {q.savings > 0 ? (
                          <Badge className={RECOMMENDATION_COLORS[q.recommendation] || ""}>
                            {RECOMMENDATION_LABELS[q.recommendation] || q.recommendation}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-400" />
            עסקאות סגורות — החלטות תשלום
          </CardTitle>
        </CardHeader>
        <CardContent>
          {dealsLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500" />
            </div>
          ) : deals.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">אין עסקאות סגורות עם נתוני מ״ר וסכום</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50 text-muted-foreground text-xs">
                    <th className="text-right py-3 px-2">#</th>
                    <th className="text-right py-3 px-2">לקוח</th>
                    <th className="text-right py-3 px-2">פרויקט</th>
                    <th className="text-right py-3 px-2">סכום ללא מע״מ</th>
                    <th className="text-right py-3 px-2">מ״ר</th>
                    <th className="text-right py-3 px-2">עלות אחוז</th>
                    <th className="text-right py-3 px-2">עלות מ״ר</th>
                    <th className="text-right py-3 px-2">הפרש</th>
                    <th className="text-right py-3 px-2">המלצה</th>
                    <th className="text-right py-3 px-2">שיטה שנבחרה</th>
                  </tr>
                </thead>
                <tbody>
                  {deals.map((d: any) => (
                    <tr key={d.id} className="border-b border-border/20 hover:bg-muted/30 transition-colors">
                      <td className="py-2.5 px-2 text-muted-foreground">{d.id}</td>
                      <td className="py-2.5 px-2 font-medium text-foreground">{d.customerName || "—"}</td>
                      <td className="py-2.5 px-2 text-muted-foreground">{d.projectName || "—"}</td>
                      <td className="py-2.5 px-2">{d.amountExVat > 0 ? fmt(d.amountExVat) : "—"}</td>
                      <td className="py-2.5 px-2">{d.squareMeters > 0 ? `${d.squareMeters} מ״ר` : "—"}</td>
                      <td className="py-2.5 px-2 text-blue-400">{d.costByPercent > 0 ? fmt(d.costByPercent) : "—"}</td>
                      <td className="py-2.5 px-2 text-purple-400">{d.costBySqm > 0 ? fmt(d.costBySqm) : "—"}</td>
                      <td className="py-2.5 px-2 text-green-400 font-medium">{d.savings > 0 ? fmt(d.savings) : "—"}</td>
                      <td className="py-2.5 px-2">
                        {d.savings > 0 ? (
                          <Badge className={RECOMMENDATION_COLORS[d.recommendation] || ""}>
                            {RECOMMENDATION_LABELS[d.recommendation] || d.recommendation}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-2">
                        {d.chosenMethod ? (
                          <Badge variant="outline">{d.chosenMethod}</Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Scale className="w-4 h-4 text-primary" />
            רשומות קשורות והיסטוריה
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex border-b border-border/50 mb-4">
            {[{key:"related",label:"רשומות קשורות"},{key:"docs",label:"מסמכים"},{key:"history",label:"היסטוריה"}].map(t => (
              <button key={t.key} onClick={() => setDetailTab(t.key)} className={`px-4 py-2.5 text-sm font-medium border-b-2 ${detailTab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t.label}</button>
            ))}
          </div>
          {detailTab === "related" && (
            <RelatedRecords tabs={[{key:"evaluations",label:"הערכות",endpoint:`${API}/crm/contractor-decision/evaluations`,columns:[{key:"contractor",label:"קבלן"},{key:"method",label:"שיטה"},{key:"savings",label:"חיסכון"}]},{key:"bids",label:"הצעות",endpoint:`${API}/crm/contractor-decision/bids`,columns:[{key:"bid_number",label:"מספר"},{key:"amount",label:"סכום"},{key:"status",label:"סטטוס"}]}]} />
          )}
          {detailTab === "docs" && (
            <AttachmentsSection entityType="contractor-decision" entityId={0} />
          )}
          {detailTab === "history" && (
            <ActivityLog entityType="contractor-decision" />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
