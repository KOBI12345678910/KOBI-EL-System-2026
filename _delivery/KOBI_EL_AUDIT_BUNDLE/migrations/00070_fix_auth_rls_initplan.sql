-- ============================================================
-- B-PERF-RLS: Fix auth_rls_initplan (9 policies)
-- ------------------------------------------------------------
-- Wraps auth.uid() in (SELECT auth.uid()) so PG evaluates it once
-- per query rather than once per row. Same semantics, 10-100x faster
-- on large tables. Reference: Supabase lint 0003_auth_rls_initplan
-- ============================================================

-- === users ===
DROP POLICY IF EXISTS users_self_read ON public.users;
CREATE POLICY users_self_read ON public.users
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = id);

DROP POLICY IF EXISTS users_self_update_limited ON public.users;
CREATE POLICY users_self_update_limited ON public.users
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = id)
  WITH CHECK (
    (SELECT auth.uid()) = id
    AND role = (SELECT u.role FROM public.users u WHERE u.id = (SELECT auth.uid()))
  );

-- === customers ===
DROP POLICY IF EXISTS customers_field_read_assigned ON public.customers;
CREATE POLICY customers_field_read_assigned ON public.customers
  FOR SELECT TO authenticated
  USING (
    current_user_role() = 'field'::user_role
    AND id IN (
      SELECT o.customer_id FROM public.orders o
      WHERE o.assigned_field_user_id = (SELECT auth.uid())
    )
  );

-- === products ===
DROP POLICY IF EXISTS products_all_read ON public.products;
CREATE POLICY products_all_read ON public.products
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL);

-- === orders ===
DROP POLICY IF EXISTS orders_field_assigned ON public.orders;
CREATE POLICY orders_field_assigned ON public.orders
  FOR SELECT TO authenticated
  USING (
    current_user_role() = 'field'::user_role
    AND assigned_field_user_id = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS orders_field_update_assigned ON public.orders;
CREATE POLICY orders_field_update_assigned ON public.orders
  FOR UPDATE TO authenticated
  USING (
    current_user_role() = 'field'::user_role
    AND assigned_field_user_id = (SELECT auth.uid())
  );

-- === order_items ===
DROP POLICY IF EXISTS order_items_field_assigned ON public.order_items;
CREATE POLICY order_items_field_assigned ON public.order_items
  FOR ALL TO authenticated
  USING (
    current_user_role() = 'field'::user_role
    AND order_id IN (
      SELECT o.id FROM public.orders o
      WHERE o.assigned_field_user_id = (SELECT auth.uid())
    )
  );

-- === employees ===
DROP POLICY IF EXISTS employees_self_read ON public.employees;
CREATE POLICY employees_self_read ON public.employees
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- === order_status_history ===
DROP POLICY IF EXISTS order_history_insert ON public.order_status_history;
CREATE POLICY order_history_insert ON public.order_status_history
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL);
