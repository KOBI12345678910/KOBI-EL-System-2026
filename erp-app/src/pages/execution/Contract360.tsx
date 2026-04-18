// Contract360 — /contracts/:id — read-only 360 view backed by procurement.contracts
import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, ArrowRight } from "lucide-react";
import { formatHebrewDate, formatCurrencyILS, STATE_COLORS } from "./_list-helpers";

export default function Contract360() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const id = params.id;

  const { data, isLoading, error } = useQuery({
    queryKey: ["contract", id],
    queryFn: () => authFetch(`/api/supplier-contracts/${id}`).catch(() => authFetch(`/api/contracts/${id}`)),
    enabled: !!id,
  });
  const c = (data?.data ?? data) as Record<string, unknown> | undefined;

  if (isLoading) return <div className="p-10 text-center" dir="rtl">טוען חוזה…</div>;
  if (error || !c) return (
    <div className="p-10 text-center" dir="rtl">
      <div className="text-red-600 mb-3">חוזה לא נמצא</div>
      <Button variant="outline" onClick={() => navigate("/contracts")}>חזרה לרשימה</Button>
    </div>
  );

  return (
    <div className="p-6 space-y-5" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm text-muted-foreground font-mono">{String(c.contract_number ?? c.number ?? id)}</div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="h-7 w-7 text-primary" /> {String(c.title ?? c.name ?? "חוזה")}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {c.state && <Badge className={STATE_COLORS[String(c.state)] || "bg-gray-400"}>{String(c.state)}</Badge>}
          <Button variant="outline" onClick={() => navigate("/contracts")}><ArrowRight className="h-4 w-4 ml-2" /> חזרה</Button>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-lg">פרטי חוזה</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 text-sm">
          <div><span className="font-semibold">ספק/לקוח: </span>{String(c.supplier_id ?? c.customer_id ?? "—")}</div>
          <div><span className="font-semibold">סכום: </span>{formatCurrencyILS(Number(c.total_amount ?? c.amount ?? 0))}</div>
          <div><span className="font-semibold">תוקף: </span>{formatHebrewDate(c.valid_from as string)} — {formatHebrewDate(c.valid_to as string)}</div>
          <div><span className="font-semibold">נחתם: </span>{formatHebrewDate(c.signed_at as string)}</div>
        </CardContent>
      </Card>
    </div>
  );
}
