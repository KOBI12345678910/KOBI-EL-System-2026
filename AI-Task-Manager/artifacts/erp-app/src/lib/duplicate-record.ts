import { authFetch } from "@/lib/utils";

const AUTO_FIELDS = new Set([
  "id", "created_at", "updated_at",
  "number", "invoice_number", "order_number", "po_number", "quote_number",
  "contract_number", "document_number", "reference_number", "check_number",
  "permit_number", "certificate_number", "report_number", "request_number",
  "batch_number", "ticket_number", "incident_number", "inspection_number",
  "procedure_number", "training_number", "assessment_number",
]);

export interface DuplicateOptions {
  nameSuffix?: string;
  nameField?: string;
  defaultStatus?: string;
  overrides?: Record<string, any>;
}

export async function duplicateRecord(
  apiBase: string,
  id: number | string,
  options: DuplicateOptions = {}
): Promise<{ ok: boolean; error?: string }> {
  const {
    nameSuffix = " (עותק)",
    nameField,
    defaultStatus = "draft",
    overrides = {},
  } = options;

  try {
    const res = await authFetch(`${apiBase}/${id}`);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { ok: false, error: data.error || data.message || "שגיאה בשליפת הרשומה" };
    }

    const row = await res.json();
    const copy: Record<string, any> = {};
    for (const [k, v] of Object.entries(row)) {
      if (!AUTO_FIELDS.has(k)) copy[k] = v;
    }

    const nameKey = nameField || Object.keys(copy).find(k =>
      ["title", "name", "description", "subject", "employee_name", "first_name", "item", "label"].includes(k)
    );
    if (nameKey && copy[nameKey]) {
      copy[nameKey] = String(copy[nameKey]) + nameSuffix;
    }

    if (defaultStatus && !overrides.status) {
      copy.status = defaultStatus;
    }

    Object.assign(copy, overrides);

    const createRes = await authFetch(apiBase, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(copy),
    });

    if (!createRes.ok) {
      const data = await createRes.json().catch(() => ({}));
      return { ok: false, error: data.error || data.message || "שגיאה ביצירת עותק" };
    }

    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e.message || "שגיאת רשת" };
  }
}
