# ERP Delete Operations Skill

This skill documents every deletion pattern in the ERP project so an agent can implement or fix delete operations without re-reading the codebase each time.

---

## Overview of Deletion Contexts

There are three distinct deletion contexts in this project:

1. **Database records** — rows deleted from PostgreSQL tables (soft or hard)
2. **Files from the filesystem** — physical files in `uploads/documents/` removed with `fs.unlinkSync`
3. **UI elements** — triggered from the frontend via a confirmation dialog and toast feedback

---

## Backend Patterns

### Pattern 1 — Generic CRUD (soft/hard delete via `generic-crud.ts`)

**File:** `artifacts/api-server/src/routes/generic-crud.ts`

The `crudAll` helper auto-registers a `DELETE /<route>/:id` handler for any table passed to it.

**Behavior:**
- If the table has an `is_active` column → **soft delete**: sets `is_active = false` and updates `updated_at`.
- If soft-delete update returns zero rows → **hard delete** fallback: `DELETE FROM table WHERE id = $1`.
- If the table has **no** `is_active` column → **hard delete** always.

**Code example:**
```typescript
router.delete(`${route}/:id`, async (req: Request, res: Response) => {
  const allCols = await getColumns(table);
  if (allCols.includes("is_active")) {
    const updatedAt = allCols.includes("updated_at") ? `, "updated_at" = NOW()` : "";
    const { rows } = await pool.query(
      `UPDATE ${table} SET is_active = false${updatedAt} WHERE id = $1 RETURNING id`,
      [req.params.id]
    );
    if (!rows[0]) {
      await pool.query(`DELETE FROM ${table} WHERE id = $1`, [req.params.id]);
    }
  } else {
    await pool.query(`DELETE FROM ${table} WHERE id = $1`, [req.params.id]);
  }
  res.json({ success: true });
});
```

**Tables registered with `crudAll`:** Check `artifacts/api-server/src/index.ts` for all `crudAll(router, "/route", "table_name")` calls.

**Response:** Always `{ success: true }` on success; `{ error: string }` on failure (500).

---

### Pattern 2 — Platform Entity Records (permissions + audit + cascade)

**Files:**
- `artifacts/api-server/src/routes/platform/records.ts` — single and bulk delete
- `artifacts/api-server/src/routes/platform/child-records.ts` — child record delete

#### Single record delete

**Endpoint:** `DELETE /platform/records/:id`

**Behavior:**
1. Looks up the record by ID in `entity_records`.
2. Checks permissions via `checkEntityAccess` and `checkModuleCrudForEntity` (returns 403 if denied).
3. Checks data scope via `enforceScopeForRecord` (returns 403 if out of scope).
4. Writes a `record_audit_log` entry with `action: "delete"` and the old `data` snapshot.
5. Emits a `record.deleted` event on the event bus.
6. Cascades to `inline_child` related entity records where `cascadeDelete = true`.
7. Hard-deletes the row from `entity_records`.
8. Returns `204 No Content`.

**Code example:**
```typescript
router.delete("/platform/records/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [existing] = await db.select().from(entityRecordsTable).where(eq(entityRecordsTable.id, id));
  if (existing && req.permissions) {
    const entityAllowed = checkEntityAccess(req.permissions, existing.entityId, "delete");
    const moduleAllowed = await checkModuleCrudForEntity(req.permissions, existing.entityId, "delete");
    if (!entityAllowed && !moduleAllowed) {
      await logPermissionDenied(req.userId || "", "delete", existing.entityId, id);
      return res.status(403).json({ message: "Access denied: no delete permission" });
    }
  }
  if (existing) {
    const scopeCheck = await enforceScopeForRecord(req, id, existing.entityId, "delete");
    if (scopeCheck.denied) return res.status(403).json({ message: "Access denied: record outside your data scope" });
    await db.insert(recordAuditLogTable).values({
      entityId: existing.entityId, recordId: id, action: "delete", changes: { data: existing.data },
    }).catch(() => {});
    eventBus.emitRecordEvent({ type: "record.deleted", entityId: existing.entityId, recordId: id, data: existing.data as Record<string, any>, status: existing.status, timestamp: new Date() });
    // cascade inline_child records with cascadeDelete=true ...
  }
  await db.delete(entityRecordsTable).where(eq(entityRecordsTable.id, id));
  res.status(204).send();
});
```

#### Bulk record delete

**Endpoint:** `DELETE /platform/records/bulk/delete` (body: `{ ids: number[], entityId?: number }`)

**Behavior:**
1. Validates `ids` is a non-empty array.
2. Optionally validates all records belong to `entityId`.
3. Runs permission and scope checks (same as single delete).
4. Writes audit log entries for each record.
5. Bulk hard-deletes with `inArray`.
6. Returns `{ deleted: number }`.

**Frontend call (React Query):**
```typescript
mutationFn: (ids: number[]) => authFetch(`${API}/platform/records/bulk/delete`, {
  method: "DELETE",
  body: JSON.stringify({ ids, entityId }),
})
```

#### Child record delete

**Endpoint:** `DELETE /platform/records/:parentId/children/:childEntityId/:childId`

Hard-deletes a specific child record from `entity_records`. Used when the child is a nested row linked to a parent by a field value.

---

### Pattern 3 — Specialized Drizzle ORM Routes

These routes use Drizzle ORM directly and are specific to a domain object. They do **not** use `generic-crud`.

#### Suppliers (`artifacts/api-server/src/routes/suppliers.ts`)

**Endpoint:** `DELETE /suppliers/:id`

**Behavior:**
- Validates `id` is a positive integer with zod.
- Hard-deletes from `suppliersTable` using Drizzle.
- Returns `{ message: "Supplier deleted" }` on success.
- Returns 409 with a Hebrew message if a foreign key constraint is violated (supplier has orders or evaluations).

```typescript
router.delete("/suppliers/:id", async (req, res) => {
  const { id } = IdParam.parse(req.params);
  const [deleted] = await db.delete(suppliersTable).where(eq(suppliersTable.id, id)).returning();
  if (!deleted) { res.status(404).json({ message: "Supplier not found" }); return; }
  res.status(200).json({ message: "Supplier deleted" });
  // catch: 23503 FK violation → 409 "לא ניתן למחוק ספק עם הזמנות או הערכות קיימות"
});
```

**Relevant table:** `suppliersTable` from `@workspace/db/schema`.

#### Other specialized routes

Many other routes in `artifacts/api-server/src/routes/` follow the same Drizzle pattern:
- Validate id with zod `z.coerce.number().int().positive()`
- `db.delete(table).where(eq(table.id, id)).returning()`
- Return 404 if no row returned
- Catch FK violations (code `23503`) and return 409

Examples:
- `DELETE /supplier-evaluations/:id` — `supplier_evaluations` table
- `DELETE /supplier-contracts/:id` — `supplier_contracts` table
- `DELETE /finance-control/payment-terms/:id` — uses raw pool query

---

## Frontend Pattern

### Hook: `useApiAction` → `executeDelete`

**File:** `artifacts/erp-app/src/hooks/use-api-action.tsx`

`executeDelete` is the primary frontend method for deletion. It:
1. Always shows a confirmation dialog with `variant: "danger"` before proceeding.
2. On confirmation, makes a `DELETE` fetch with a Bearer token.
3. Shows a success toast (`"נמחק בהצלחה"`) or error toast on failure.
4. Returns a `Promise<boolean>` indicating success.

**Signature:**
```typescript
executeDelete(
  fnOrUrl: (() => Promise<Response>) | string,
  optionsOrConfirm?: ApiActionOptions | string,  // confirmation message string
  p3?: () => void                                 // onSuccess callback
): Promise<boolean>
```

**Usage — URL shorthand (most common):**
```typescript
const { executeDelete } = useApiAction();

const handleDelete = async (id: number) => {
  await executeDelete(
    `${API}/suppliers/${id}`,
    "האם למחוק ספק זה? הפעולה אינה ניתנת לביטול.",
    () => refetch()
  );
};
```

**Usage — function form (custom fetch logic):**
```typescript
await executeDelete(
  () => authFetch(`${API}/platform/records/${id}`, { method: "DELETE" }),
  { confirm: "למחוק רשומה זו?", successMessage: "הרשומה נמחקה", onSuccess: () => reload() }
);
```

**Auth header:** The hook reads `localStorage.getItem("token")` and sets `Authorization: Bearer <token>`. For `authFetch` (used in bulk actions), it reads `localStorage.getItem("erp_token")`.

---

### Confirmation Dialog

**File:** `artifacts/erp-app/src/components/confirm-dialog.tsx`

`executeDelete` internally calls `confirm({ variant: "danger", title: "אישור מחיקה", message: ..., confirmText: "מחק לצמיתות", cancelText: "ביטול" })`.

**Variants:**
- `"danger"` — red icon (Trash2), red confirm button. Used for deletion.
- `"warning"` — amber icon (AlertTriangle). Used for reversible actions.
- `"info"` — blue icon (Info). Used for informational confirmations.

**Direct usage (outside `executeDelete`):**
```typescript
const { confirm } = useConfirmDialog();
const ok = await confirm({
  title: "אישור מחיקה",
  message: "האם אתה בטוח שברצונך למחוק?",
  variant: "danger",
  confirmText: "מחק",
  cancelText: "ביטול",
});
if (ok) { /* proceed */ }
```

**Global confirm (for bulk-actions outside React hooks):**
```typescript
import { globalConfirm } from "@/components/confirm-dialog";
const confirmed = await globalConfirm("למחוק 3 רשומות? פעולה זו אינה ניתנת לביטול.");
```

---

### Bulk Delete via `BulkActions` Component

**File:** `artifacts/erp-app/src/components/bulk-actions.tsx`

The `BulkActions` component renders an action bar when `selectedIds.length > 0`. For destructive actions it calls `globalConfirm` before running the handler.

**Wiring pattern:**
```typescript
import BulkActions, { useBulkSelection, defaultBulkActions } from "@/components/bulk-actions";

function MyPage() {
  const { selectedIds, toggle, toggleAll, clear, isSelected } = useBulkSelection();

  const bulkDeleteAction = defaultBulkActions.delete(async (ids) => {
    await authFetch(`${API}/platform/records/bulk/delete`, {
      method: "DELETE",
      body: JSON.stringify({ ids }),
    });
    refetch();
  });

  return (
    <>
      <BulkActions selectedIds={selectedIds} onClear={clear} actions={[bulkDeleteAction]} />
      {/* table rows with checkboxes */}
    </>
  );
}
```

**`defaultBulkActions` presets:**
- `defaultBulkActions.delete(handler)` — destructive, shows confirm, red button
- `defaultBulkActions.archive(handler)` — non-destructive
- `defaultBulkActions.restore(handler)` — non-destructive
- `defaultBulkActions.export(handler)` — non-destructive
- `defaultBulkActions.statusChange(label, handler)` — non-destructive

**`useBulkSelection` helpers:**
- `toggle(id)` — toggle one ID
- `toggleAll(items, idField?)` — select/deselect all
- `clear()` — empty selection
- `isSelected(id)` — boolean check

---

## File Deletion (Uploads Directory)

**File:** `artifacts/api-server/src/routes/documents.ts`

Uploaded files are stored at: `artifacts/api-server/uploads/documents/<unique-filename>` (e.g., `1711100000000-123456789.pdf`).

The DB row in `document_files` stores `filePath` (just the filename, not the full path) and `thumbnailPath`.

### Soft delete (trash)

**Endpoint:** `DELETE /document-files/:id` (no query params, or `?permanent=false`)

Sets `isTrashed = true` on the DB row. Does **not** touch the filesystem.

```typescript
await db.update(documentFilesTable)
  .set({ isTrashed: true, updatedAt: new Date() })
  .where(eq(documentFilesTable.id, id));
```

### Hard delete (permanent)

**Endpoint:** `DELETE /document-files/:id?permanent=true`

1. Removes the physical file from disk with `fs.unlinkSync`.
2. Hard-deletes the DB row.

```typescript
if (permanent) {
  const filePath = path.join(uploadsDir, file.filePath);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  await db.delete(documentFilesTable).where(eq(documentFilesTable.id, id));
}
```

**Important:** Always check `fs.existsSync` before `fs.unlinkSync` to avoid throwing if the file is already missing.

### Folder soft delete

**Endpoint:** `DELETE /document-folders/:id`

Sets `isTrashed = true` on the folder. Does not cascade to files inside it.

**Constraints:**
- System folders (`isSystem = true`) cannot be deleted (returns 400).
- Only the folder owner (`createdBy === userId`) can delete it (returns 403).

### Auth requirement

All document delete endpoints call `requireAuth(req, res)` which checks `req.userId`. If missing, returns 401.

---

## Summary Table

| Pattern | Endpoint | Mechanism | Response |
|---|---|---|---|
| generic-crud soft | `DELETE /:route/:id` | `UPDATE SET is_active=false` | `{ success: true }` |
| generic-crud hard | `DELETE /:route/:id` | `DELETE FROM table` | `{ success: true }` |
| platform single | `DELETE /platform/records/:id` | Drizzle + audit + cascade | `204 No Content` |
| platform bulk | `DELETE /platform/records/bulk/delete` | Drizzle inArray + audit | `{ deleted: N }` |
| supplier (Drizzle) | `DELETE /suppliers/:id` | Drizzle `.delete().returning()` | `{ message: "..." }` |
| doc file soft | `DELETE /document-files/:id` | `UPDATE SET isTrashed=true` | `{ success: true }` |
| doc file hard | `DELETE /document-files/:id?permanent=true` | `fs.unlinkSync` + Drizzle delete | `{ success: true }` |
| doc folder | `DELETE /document-folders/:id` | `UPDATE SET isTrashed=true` | `{ success: true }` |

---

## Key Files Reference

| Purpose | Path |
|---|---|
| Generic CRUD delete | `artifacts/api-server/src/routes/generic-crud.ts` (line 349) |
| Platform single record delete | `artifacts/api-server/src/routes/platform/records.ts` (line 1467) |
| Platform bulk delete | `artifacts/api-server/src/routes/platform/records.ts` (line 728) |
| Platform child record delete | `artifacts/api-server/src/routes/platform/child-records.ts` (line 157) |
| Supplier delete | `artifacts/api-server/src/routes/suppliers.ts` (line 184) |
| Document file delete | `artifacts/api-server/src/routes/documents.ts` (line 354) |
| Document folder delete | `artifacts/api-server/src/routes/documents.ts` (line 190) |
| Frontend hook | `artifacts/erp-app/src/hooks/use-api-action.tsx` (line 88) |
| Confirmation dialog | `artifacts/erp-app/src/components/confirm-dialog.tsx` |
| Bulk actions component | `artifacts/erp-app/src/components/bulk-actions.tsx` |
| Auth fetch utility | `artifacts/erp-app/src/lib/utils.ts` |

---

## Common Pitfalls

1. **Token key mismatch:** `useApiAction` reads `localStorage.getItem("token")` but `authFetch` in `utils.ts` reads `localStorage.getItem("erp_token")`. Use `authFetch` for bulk actions and manual fetches; use `executeDelete` for single-item deletes.

2. **Platform records return 204, not 200:** `DELETE /platform/records/:id` returns `204 No Content`. Do not try to parse the response body.

3. **Cascade only applies to `inline_child` relations with `cascadeDelete=true`:** Normal `many-to-one` or `lookup` relations are not auto-cascaded. If cascade is needed, add it to `entity_relations`.

4. **Generic CRUD soft-delete fallback:** If `is_active = false` succeeds but the record is still returned in queries, the caller's `WHERE is_active = true` filter may be missing.

5. **Document folders block system folders:** `isSystem = true` folders will always get a 400 on delete. Never attempt to delete them.

6. **File existence check before unlinking:** Always wrap `fs.unlinkSync` in `if (fs.existsSync(...))` to be safe.
