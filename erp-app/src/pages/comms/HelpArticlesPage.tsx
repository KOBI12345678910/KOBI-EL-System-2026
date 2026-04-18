import { CommsTable, CommsStatusBadge, fmtDate } from "./_CommsTable";

interface HelpArticle {
  id: number;
  article_code: string;
  title: string;
  category: string | null;
  status: string;
  view_count: number;
  published_at: string | null;
  updated_at: string;
}

export default function HelpArticlesPage() {
  return (
    <CommsTable<HelpArticle>
      title="מאמרי עזרה"
      apiPath="/api/comms/help-articles"
      columns={[
        { key: "article_code", label: "קוד" },
        { key: "title", label: "כותרת" },
        { key: "category", label: "קטגוריה", render: (r) => r.category ?? "—" },
        { key: "status", label: "סטטוס", render: (r) => <CommsStatusBadge status={r.status} /> },
        { key: "view_count", label: "צפיות" },
        { key: "published_at", label: "פורסם", render: (r) => fmtDate(r.published_at) },
        { key: "updated_at", label: "עודכן", render: (r) => fmtDate(r.updated_at) },
      ]}
    />
  );
}
