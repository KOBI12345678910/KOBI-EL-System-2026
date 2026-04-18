import { useRoute, Link } from "wouter";
import { useList, Loading, ErrorBox, EmptyBox, formatDate } from "./_shared";

export default function DocumentVersionsPage() {
  const [, params] = useRoute<{ id: string }>("/documents/:id/versions");
  const id = params?.id;
  const { data, isLoading, error } = useList<any>(
    ["docs", "versions-page", id],
    "/document-versions",
    { document_id: id, limit: 200 },
  );

  return (
    <div dir="rtl" className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">גרסאות מסמך #{id}</h1>
        <Link href={`/documents/${id}`} className="text-indigo-600 text-sm">חזרה ל-360</Link>
      </div>
      {isLoading && <Loading />}
      {error && <ErrorBox err={error} />}
      {data && data.rows.length === 0 && <EmptyBox />}
      {data && data.rows.length > 0 && (
        <div className="overflow-auto rounded border">
          <table className="w-full text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="p-2 text-right">גרסה</th>
                <th className="p-2 text-right">שם קובץ</th>
                <th className="p-2 text-right">גודל</th>
                <th className="p-2 text-right">נוכחי</th>
                <th className="p-2 text-right">הערות שינוי</th>
                <th className="p-2 text-right">נוצר</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((v: any) => (
                <tr key={v.id} className="border-t hover:bg-gray-50">
                  <td className="p-2 font-semibold">{v.version_number}</td>
                  <td className="p-2">{v.filename}</td>
                  <td className="p-2">{v.file_size_bytes ?? "—"}</td>
                  <td className="p-2">{v.is_current ? "✓" : ""}</td>
                  <td className="p-2">{v.change_summary ?? "—"}</td>
                  <td className="p-2">{formatDate(v.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
