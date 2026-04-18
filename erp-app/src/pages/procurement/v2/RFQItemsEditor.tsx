import { useRoute } from "wouter";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiSend, useList, Loading, ErrorBox, formatDate } from "./_shared";

export default function RFQItemsEditor() {
  const [, params] = useRoute<{ id: string }>("/rfqs/:id/items");
  const id = params?.id;
  const qc = useQueryClient();
  const { data, isLoading, error } = useList<any>(["procurement", "rfq-lines", id], `/rfqs/${id}/lines`);
  const [draft, setDraft] = useState({ line_number: 1, description: "", quantity: 1, unit_of_measure: "יח׳", target_delivery_date: "" });

  async function addLine() {
    if (!draft.description) return;
    await apiSend("POST", "/rfq-lines", { rfq_id: Number(id), ...draft });
    qc.invalidateQueries({ queryKey: ["procurement", "rfq-lines", id] });
    setDraft({ ...draft, line_number: draft.line_number + 1, description: "", quantity: 1 });
  }

  async function deleteLine(lineId: number) {
    if (!confirm("למחוק שורה?")) return;
    await apiSend("DELETE", `/rfq-lines/${lineId}`);
    qc.invalidateQueries({ queryKey: ["procurement", "rfq-lines", id] });
  }

  if (isLoading) return <Loading />;
  if (error) return <ErrorBox err={error} />;

  return (
    <div dir="rtl" className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">עריכת שורות RFQ #{id}</h1>

      <div className="rounded border bg-white p-4 grid grid-cols-1 md:grid-cols-5 gap-2 text-sm">
        <input type="number" value={draft.line_number} onChange={(e) => setDraft({ ...draft, line_number: Number(e.target.value) })} className="rounded border px-2 py-1" placeholder="מס׳ שורה" />
        <input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} className="rounded border px-2 py-1 md:col-span-2" placeholder="תיאור הפריט" />
        <input type="number" step="0.01" value={draft.quantity} onChange={(e) => setDraft({ ...draft, quantity: Number(e.target.value) })} className="rounded border px-2 py-1" placeholder="כמות" />
        <input value={draft.unit_of_measure} onChange={(e) => setDraft({ ...draft, unit_of_measure: e.target.value })} className="rounded border px-2 py-1" placeholder="יח׳" />
        <input type="date" value={draft.target_delivery_date} onChange={(e) => setDraft({ ...draft, target_delivery_date: e.target.value })} className="rounded border px-2 py-1" />
        <button onClick={addLine} className="rounded bg-indigo-600 text-white py-1">הוסף שורה</button>
      </div>

      <div className="overflow-auto rounded border">
        <table className="w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-2 text-right">#</th>
              <th className="p-2 text-right">תיאור</th>
              <th className="p-2 text-right">כמות</th>
              <th className="p-2 text-right">יח׳</th>
              <th className="p-2 text-right">תאריך יעד</th>
              <th className="p-2 text-right">פעולות</th>
            </tr>
          </thead>
          <tbody>
            {(data?.rows ?? []).map((l: any) => (
              <tr key={l.id} className="border-t">
                <td className="p-2">{l.line_number}</td>
                <td className="p-2">{l.description}</td>
                <td className="p-2">{l.quantity}</td>
                <td className="p-2">{l.unit_of_measure}</td>
                <td className="p-2">{formatDate(l.target_delivery_date)}</td>
                <td className="p-2"><button onClick={() => deleteLine(l.id)} className="text-red-600 hover:underline text-sm">מחק</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
