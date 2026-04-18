import { GitBranch } from "lucide-react";
import GenericListPage from "./_GenericListPage";

export default function BomHeadersPage() {
  return (
    <GenericListPage
      icon={<GitBranch className="h-7 w-7 text-primary" />}
      title="עצי מוצר (BOM)"
      endpoint="/api/execution/bom-headers"
      searchPlaceholder="חיפוש לפי מספר / שם…"
      columns={[
        { key: "bom_number", label: "מספר" },
        { key: "name", label: "שם" },
        { key: "product_code", label: "קוד מוצר" },
        { key: "version", label: "גרסה" },
        { key: "bom_type", label: "סוג" },
        { key: "state", label: "סטטוס", kind: "state" },
        { key: "total_cost_estimate", label: "עלות משוערת", kind: "currency" },
      ]}
      filters={[
        { key: "bom_type", label: "סוג", options: [
          { value: "engineering", label: "הנדסה" },
          { value: "production", label: "ייצור" },
          { value: "service", label: "שירות" },
          { value: "costing", label: "תמחור" },
          { value: "phantom", label: "פנטום" },
        ]},
        { key: "state", label: "סטטוס", options: [
          { value: "draft", label: "טיוטה" },
          { value: "in_review", label: "בסקירה" },
          { value: "approved", label: "אושר" },
          { value: "released", label: "שוחרר" },
          { value: "obsolete", label: "מיושן" },
        ]},
      ]}
    />
  );
}
