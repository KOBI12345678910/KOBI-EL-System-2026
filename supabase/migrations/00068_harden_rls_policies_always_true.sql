-- ============================================================
-- B-D030/SEC: Harden 24 RLS policies flagged as USING (true)
-- ------------------------------------------------------------
-- Uses governance.* helpers:
--   current_user_profile_id()  -> bigint (matches created_by)
--   current_user_is_admin()    -> boolean
--   current_user_is_finance()  -> boolean
--   current_user_is_ops()      -> boolean
--   current_user_has_any_role(text[]) -> boolean
-- Reference: Supabase advisor lint 0024_permissive_rls_policy
-- ============================================================

-- === execution.alerts ===
DROP POLICY IF EXISTS alerts_insert ON execution.alerts;
CREATE POLICY alerts_insert ON execution.alerts
  FOR INSERT TO authenticated
  WITH CHECK (governance.current_user_is_admin()
              OR governance.current_user_is_ops()
              OR governance.current_user_has_any_role(ARRAY['manager','field']));

DROP POLICY IF EXISTS alerts_update ON execution.alerts;
CREATE POLICY alerts_update ON execution.alerts
  FOR UPDATE TO authenticated
  USING (governance.current_user_is_admin()
         OR governance.current_user_is_ops()
         OR assigned_to_user_id = governance.current_user_profile_id())
  WITH CHECK (governance.current_user_is_admin()
              OR governance.current_user_is_ops()
              OR assigned_to_user_id = governance.current_user_profile_id());

DROP POLICY IF EXISTS alerts_delete ON execution.alerts;
CREATE POLICY alerts_delete ON execution.alerts
  FOR DELETE TO authenticated
  USING (governance.current_user_is_admin());

-- === execution.tasks ===
DROP POLICY IF EXISTS tasks_insert ON execution.tasks;
CREATE POLICY tasks_insert ON execution.tasks
  FOR INSERT TO authenticated
  WITH CHECK (governance.current_user_is_admin()
              OR governance.current_user_is_ops()
              OR governance.current_user_has_any_role(ARRAY['manager','field']));

DROP POLICY IF EXISTS tasks_update ON execution.tasks;
CREATE POLICY tasks_update ON execution.tasks
  FOR UPDATE TO authenticated
  USING (governance.current_user_is_admin()
         OR governance.current_user_is_ops()
         OR created_by = governance.current_user_profile_id())
  WITH CHECK (governance.current_user_is_admin()
              OR governance.current_user_is_ops()
              OR created_by = governance.current_user_profile_id());

DROP POLICY IF EXISTS tasks_delete ON execution.tasks;
CREATE POLICY tasks_delete ON execution.tasks
  FOR DELETE TO authenticated
  USING (governance.current_user_is_admin() OR governance.current_user_is_ops());

-- === execution.work_orders ===
DROP POLICY IF EXISTS wo_insert ON execution.work_orders;
CREATE POLICY wo_insert ON execution.work_orders
  FOR INSERT TO authenticated
  WITH CHECK (governance.current_user_is_admin() OR governance.current_user_is_ops());

DROP POLICY IF EXISTS wo_update ON execution.work_orders;
CREATE POLICY wo_update ON execution.work_orders
  FOR UPDATE TO authenticated
  USING (governance.current_user_is_admin()
         OR governance.current_user_is_ops()
         OR created_by = governance.current_user_profile_id())
  WITH CHECK (governance.current_user_is_admin()
              OR governance.current_user_is_ops()
              OR created_by = governance.current_user_profile_id());

DROP POLICY IF EXISTS wo_delete ON execution.work_orders;
CREATE POLICY wo_delete ON execution.work_orders
  FOR DELETE TO authenticated
  USING (governance.current_user_is_admin());

-- === finance.invoices (finance/admin only) ===
DROP POLICY IF EXISTS invoices_insert ON finance.invoices;
CREATE POLICY invoices_insert ON finance.invoices
  FOR INSERT TO authenticated
  WITH CHECK (governance.current_user_is_admin() OR governance.current_user_is_finance());

DROP POLICY IF EXISTS invoices_update ON finance.invoices;
CREATE POLICY invoices_update ON finance.invoices
  FOR UPDATE TO authenticated
  USING (governance.current_user_is_admin()
         OR governance.current_user_is_finance()
         OR created_by = governance.current_user_profile_id())
  WITH CHECK (governance.current_user_is_admin()
              OR governance.current_user_is_finance()
              OR created_by = governance.current_user_profile_id());

DROP POLICY IF EXISTS invoices_delete ON finance.invoices;
CREATE POLICY invoices_delete ON finance.invoices
  FOR DELETE TO authenticated
  USING (governance.current_user_is_admin());

-- === finance.payments ===
DROP POLICY IF EXISTS payments_insert ON finance.payments;
CREATE POLICY payments_insert ON finance.payments
  FOR INSERT TO authenticated
  WITH CHECK (governance.current_user_is_admin() OR governance.current_user_is_finance());

DROP POLICY IF EXISTS payments_update ON finance.payments;
CREATE POLICY payments_update ON finance.payments
  FOR UPDATE TO authenticated
  USING (governance.current_user_is_admin()
         OR governance.current_user_is_finance()
         OR created_by = governance.current_user_profile_id())
  WITH CHECK (governance.current_user_is_admin()
              OR governance.current_user_is_finance()
              OR created_by = governance.current_user_profile_id());

DROP POLICY IF EXISTS payments_delete ON finance.payments;
CREATE POLICY payments_delete ON finance.payments
  FOR DELETE TO authenticated
  USING (governance.current_user_is_admin());

-- === inventory.materials ===
DROP POLICY IF EXISTS materials_insert ON inventory.materials;
CREATE POLICY materials_insert ON inventory.materials
  FOR INSERT TO authenticated
  WITH CHECK (governance.current_user_is_admin()
              OR governance.current_user_is_inventory()
              OR governance.current_user_is_ops());

DROP POLICY IF EXISTS materials_update ON inventory.materials;
CREATE POLICY materials_update ON inventory.materials
  FOR UPDATE TO authenticated
  USING (governance.current_user_is_admin()
         OR governance.current_user_is_inventory()
         OR governance.current_user_is_ops()
         OR created_by = governance.current_user_profile_id())
  WITH CHECK (governance.current_user_is_admin()
              OR governance.current_user_is_inventory()
              OR governance.current_user_is_ops()
              OR created_by = governance.current_user_profile_id());

DROP POLICY IF EXISTS materials_delete ON inventory.materials;
CREATE POLICY materials_delete ON inventory.materials
  FOR DELETE TO authenticated
  USING (governance.current_user_is_admin() OR governance.current_user_is_inventory());

-- === procurement.contracts (no created_by; role-only) ===
DROP POLICY IF EXISTS contracts_insert ON procurement.contracts;
CREATE POLICY contracts_insert ON procurement.contracts
  FOR INSERT TO authenticated
  WITH CHECK (governance.current_user_is_admin() OR governance.current_user_is_procurement());

DROP POLICY IF EXISTS contracts_update ON procurement.contracts;
CREATE POLICY contracts_update ON procurement.contracts
  FOR UPDATE TO authenticated
  USING (governance.current_user_is_admin() OR governance.current_user_is_procurement())
  WITH CHECK (governance.current_user_is_admin() OR governance.current_user_is_procurement());

DROP POLICY IF EXISTS contracts_delete ON procurement.contracts;
CREATE POLICY contracts_delete ON procurement.contracts
  FOR DELETE TO authenticated
  USING (governance.current_user_is_admin());

-- === procurement.purchase_orders ===
DROP POLICY IF EXISTS po_insert ON procurement.purchase_orders;
CREATE POLICY po_insert ON procurement.purchase_orders
  FOR INSERT TO authenticated
  WITH CHECK (governance.current_user_is_admin() OR governance.current_user_is_procurement());

DROP POLICY IF EXISTS po_update ON procurement.purchase_orders;
CREATE POLICY po_update ON procurement.purchase_orders
  FOR UPDATE TO authenticated
  USING (governance.current_user_is_admin()
         OR governance.current_user_is_procurement()
         OR created_by = governance.current_user_profile_id())
  WITH CHECK (governance.current_user_is_admin()
              OR governance.current_user_is_procurement()
              OR created_by = governance.current_user_profile_id());

DROP POLICY IF EXISTS po_delete ON procurement.purchase_orders;
CREATE POLICY po_delete ON procurement.purchase_orders
  FOR DELETE TO authenticated
  USING (governance.current_user_is_admin());
