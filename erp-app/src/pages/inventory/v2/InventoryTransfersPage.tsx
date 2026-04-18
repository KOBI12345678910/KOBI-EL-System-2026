import { useQueryClient } from "@tanstack/react-query";
import { useList, useSearchState, SearchBar, Pagination, StatusBadge, Loading, ErrorBox, EmptyBox, formatNum, formatDate, apiSend } from "./_shared";

export default function InventoryTransfersPage() {
  const s = useSearchState({ limit: 50 });
  const qc = useQueryClient();
  const { data, isLoading, error } = useList<any>(
    ["inventory", "transfers", s.q, s.state, s.offset],
    "/inventory/transfers",
    { q: s.q || undefined, status: s.state || undefined, limit: s.limit, offset: s.offset },
  );

  const handleExec = async (id: number) => {
    try {
      await apiSend("POST", `/inventory/transfers/${id}/execute`);
      await qc.invalidateQueries({ queryKey: ["inventory", "transfers"] });
    } catch (e: any) {
      alert(`שגיאה בביצוע ההעברה: ${e.message}`);
    }
  };

  return (
    <div dir="rtl" className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">העברות בין מחסנים</h1>
      <div className="flex gap-2 items-center">
        <SearchBar value={s.q} onChange={(v) => { s.setQ(v); s.setOffset(0); }} placeholder="חיפוש לפי מספר העברה…" />
        <select value={s.state} onChange={(e) => { s.setState(e.target.value); s.setOffset(0); }} className="rounded border px-2 py-2 text-sm">
          <option value="">כל הסטטוסים</option>
          <option value="pending">ממתין</option>
          <option value="in_transit">במעבר</option>
          <option value="executed">בוצע</option>
          <option value="cancelled">בוטל</option>
        </select>
      </div>
      {isLoading && <Loading />}
      {error && <ErrorBox err={error} />}
      {data && data.rows.length === 0 && <EmptyBox />}
      {data && data.rows.length > 0 && (
        <div className="overflow-auto rounded border">
          <table className="w-full text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="p-2 text-right">מס' העברה</th>
                <th className="p-2 text-right">תאריך</th>
                <th className="p-2 text-right">חומר</th>
                <th className="p-2 text-right">מ־מחסן</th>
                <th className="p-2 text-right">אל־מחסן</th>
                <th className="p-2 text-right">כמות</th>
                <th className="p-2 text-right">סטטוס</th>
                <th className="p-2 text-right">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r: any) => (
                <tr key={r.id} className="border-t hover:bg-gray-50">
                  <td className="p-2 font-medium">{r.transfer_number}</td>
                  <td className="p-2">{formatDate(r.transfer_date)}</td>
                  <td className="p-2">#{r.material_id}</td>
                  <td className="p-2">#{r.from_warehouse_id}</td>
                  <td className="p-2">#{r.to_warehouse_id}</td>
                  <td className="p-2">{formatNum(r.quantity_transferred)}</td>
                  <td className="p-2"><StatusBadge state={r.status} /></td>
                  <td className="p-2">
                    {r.status !== "executed" && r.status !== "cancelled" && (
                      <button onClick={() => handleExec(r.id)} className="rounded bg-emerald-600 text-white px-3 py-1 text-xs">בצע העברה</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination offset={s.offset} limit={s.limit} total={data?.total} onChange={s.setOffset} />
    </div>
  );
}
