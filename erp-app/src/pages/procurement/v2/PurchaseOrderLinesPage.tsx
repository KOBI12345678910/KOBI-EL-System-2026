import { useRoute } from "wouter";
import { useList, Loading, ErrorBox, formatILS, formatDate } from "./_shared";

export default function PurchaseOrderLinesPage() {
  const [, params] = useRoute<{ id: string }>("/purchase-orders/:id/lines");
  const id = params?.id;
  const { data, isLoading, error } = useList<any>(["procurement", "po-lines-full", id], `/purchase-orders/${id}/lines`);

  if (isLoading) return <Loading />;
  if (error) return <ErrorBox err={error} />;

  return (
    <div dir="rtl" className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">שורות הזמנת רכש #{id}</h1>
      <div className="overflow-auto rounded border">
        <table className="w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-2 text-right">#</th>
              <th className="p-2 text-right">תיאור</th>
              <th className="p-2 text-right">כמות</th>
              <th className="p-2 text-right">התקבל</th>
              <th className="p-2 text-right">פתוח</th>
              <th className="p-2 text-right">יח׳</th>
              <th className="p-2 text-right">מחיר יח׳</th>
              <th className="p-2 text-right">הנחה %</th>
              <th className="p-2 text-right">סה״כ לפני מע״מ</th>
              <th className="p-2 text-right">מע״מ %</th>
              <th className="p-2 text-right">סה״כ שורה</th>
              <th className="p-2 text-right">מועד אספקה</th>
            </tr>
          </thead>
          <tbody>
            {(data?.rows ?? []).map((l: any) => (
              <tr key={l.id} className="border-t">
                <td className="p-2">{l.line_number}</td>
                <td className="p-2">{l.description}</td>
                <td className="p-2">{l.quantity_ordered}</td>
                <td className="p-2">{l.quantity_received}</td>
                <td className="p-2">{l.quantity_open}</td>
                <td className="p-2">{l.unit_of_measure ?? "—"}</td>
                <td className="p-2">{formatILS(l.unit_price)}</td>
                <td className="p-2">{l.discount_percent}</td>
                <td className="p-2">{formatILS(l.line_subtotal)}</td>
                <td className="p-2">{l.vat_percent}</td>
                <td className="p-2 font-semibold">{formatILS(l.line_total)}</td>
                <td className="p-2">{formatDate(l.delivery_date)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
