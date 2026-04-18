import { useState } from "react";
import { useRoute, Link } from "wouter";
import { useDetail, useList, Loading, ErrorBox, StatusBadge, formatNum, formatDate } from "./_shared";

export default function Material360() {
  const [, params] = useRoute("/materials/:id");
  const id = params?.id;
  const [tab, setTab] = useState<"overview" | "lots" | "movements" | "reservations">("overview");

  const mat = useDetail<any>(["inventory", "material", id], `/materials/${id}`, !!id);
  const stock = useList<any>(["inventory", "inventory", id], "/inventory", { material_id: id, limit: 100 });
  const lots = useList<any>(["inventory", "lots", id], "/material-lots", { material_id: id, limit: 100 });
  const movs = useList<any>(["inventory", "movements", id], "/inventory/journal", { material_id: id, limit: 200 });
  const rsvs = useList<any>(["inventory", "reservations", id], "/inventory/reservations", { material_id: id, limit: 100 });

  if (mat.isLoading) return <Loading />;
  if (mat.error) return <ErrorBox err={mat.error} />;
  if (!mat.data) return null;
  const m = mat.data;

  return (
    <div dir="rtl" className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/materials" className="text-sm text-indigo-600 hover:underline">← חזור לרשימת החומרים</Link>
          <h1 className="text-2xl font-semibold mt-2">{m.name}</h1>
          <div className="text-sm text-gray-600">קוד: {m.material_code} · יחידה: {m.unit_of_measure ?? "—"}</div>
        </div>
        <div className="text-sm text-gray-500">
          עודכן: {formatDate(m.updated_at)}
        </div>
      </div>

      <div className="flex gap-2 border-b">
        {[
          ["overview", "סקירה"],
          ["lots", "אצוות / עקיבות"],
          ["movements", "תנועות"],
          ["reservations", "שריונים"],
        ].map(([k, label]) => (
          <button key={k} onClick={() => setTab(k as any)}
            className={`px-4 py-2 text-sm ${tab === k ? "border-b-2 border-indigo-600 text-indigo-700 font-medium" : "text-gray-600"}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat label="עלות תקן" value={formatNum(m.standard_cost)} />
          <Stat label="נקודת הזמנה" value={formatNum(m.reorder_point)} />
          <Stat label="מלאי בטחון" value={formatNum(m.safety_stock)} />
          <Stat label="ברקוד" value={m.barcode ?? "—"} />
          <div className="col-span-full overflow-auto rounded border">
            <table className="w-full text-sm">
              <thead className="bg-gray-100">
                <tr><th className="p-2 text-right">מחסן</th><th className="p-2 text-right">במלאי</th><th className="p-2 text-right">משוריין</th><th className="p-2 text-right">זמין</th></tr>
              </thead>
              <tbody>
                {(stock.data?.rows ?? []).map((r: any) => (
                  <tr key={r.id} className="border-t">
                    <td className="p-2">#{r.warehouse_id}</td>
                    <td className="p-2">{formatNum(r.on_hand_qty)}</td>
                    <td className="p-2">{formatNum(r.reserved_qty)}</td>
                    <td className="p-2">{formatNum(r.available_qty)}</td>
                  </tr>
                ))}
                {stock.data && stock.data.rows.length === 0 && (
                  <tr><td colSpan={4} className="p-4 text-center text-gray-500">אין נתוני מלאי</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "lots" && (
        <div className="overflow-auto rounded border">
          <table className="w-full text-sm">
            <thead className="bg-gray-100">
              <tr><th className="p-2 text-right">מספר אצווה</th><th className="p-2 text-right">מחסן</th><th className="p-2 text-right">כמות</th><th className="p-2 text-right">תוקף</th><th className="p-2 text-right">סטטוס</th><th className="p-2 text-right">עקיבות</th></tr>
            </thead>
            <tbody>
              {(lots.data?.rows ?? []).map((r: any) => (
                <tr key={r.id} className="border-t">
                  <td className="p-2 font-medium">{r.lot_number}</td>
                  <td className="p-2">#{r.warehouse_id}</td>
                  <td className="p-2">{formatNum(r.quantity_on_hand)}</td>
                  <td className="p-2">{formatDate(r.expiry_date)}</td>
                  <td className="p-2"><StatusBadge state={r.status} /></td>
                  <td className="p-2"><Link href={`/inventory/lots/${r.id}`} className="text-indigo-600 hover:underline">שרשרת</Link></td>
                </tr>
              ))}
              {lots.data && lots.data.rows.length === 0 && (
                <tr><td colSpan={6} className="p-4 text-center text-gray-500">אין אצוות פעילות</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === "movements" && (
        <div className="overflow-auto rounded border">
          <table className="w-full text-sm">
            <thead className="bg-gray-100">
              <tr><th className="p-2 text-right">תאריך</th><th className="p-2 text-right">מחסן</th><th className="p-2 text-right">סוג</th><th className="p-2 text-right">כמות</th><th className="p-2 text-right">סטטוס</th><th className="p-2 text-right">הפניה</th></tr>
            </thead>
            <tbody>
              {(movs.data?.rows ?? []).map((r: any) => (
                <tr key={r.id} className="border-t">
                  <td className="p-2">{formatDate(r.movement_date)}</td>
                  <td className="p-2">#{r.warehouse_id}</td>
                  <td className="p-2">{r.movement_type}</td>
                  <td className="p-2">{formatNum(r.quantity)}</td>
                  <td className="p-2"><StatusBadge state={r.status} /></td>
                  <td className="p-2">{r.reference_type ?? "—"}{r.reference_id ? `#${r.reference_id}` : ""}</td>
                </tr>
              ))}
              {movs.data && movs.data.rows.length === 0 && (
                <tr><td colSpan={6} className="p-4 text-center text-gray-500">אין תנועות</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === "reservations" && (
        <div className="overflow-auto rounded border">
          <table className="w-full text-sm">
            <thead className="bg-gray-100">
              <tr><th className="p-2 text-right">מחסן</th><th className="p-2 text-right">כמות משוריינת</th><th className="p-2 text-right">פרויקט</th><th className="p-2 text-right">מצב</th><th className="p-2 text-right">נוצר</th></tr>
            </thead>
            <tbody>
              {(rsvs.data?.rows ?? []).map((r: any) => (
                <tr key={r.id} className="border-t">
                  <td className="p-2">#{r.warehouse_id}</td>
                  <td className="p-2">{formatNum(r.reserved_qty)}</td>
                  <td className="p-2">{r.project_id ?? "—"}</td>
                  <td className="p-2"><StatusBadge state={r.state} /></td>
                  <td className="p-2">{formatDate(r.created_at)}</td>
                </tr>
              ))}
              {rsvs.data && rsvs.data.rows.length === 0 && (
                <tr><td colSpan={5} className="p-4 text-center text-gray-500">אין שריונים פעילים</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded border bg-white p-4">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-lg font-semibold mt-1">{value}</div>
    </div>
  );
}
