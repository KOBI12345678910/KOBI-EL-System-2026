-- ============================================================
-- B-SEC-32: Remove dangerous anon_read_* policies
-- ------------------------------------------------------------
-- These policies gave UNAUTHENTICATED users read access to
-- customers, employees, orders, order_items, inventory.
-- That's a major data exposure (PII + business confidential).
-- Resolves both multiple_permissive_policies lint AND the
-- underlying security issue.
-- ============================================================

-- Remove dangerous anon read on sensitive business data
DROP POLICY IF EXISTS anon_read_customers ON public.customers;
DROP POLICY IF EXISTS anon_read_employees ON public.employees;
DROP POLICY IF EXISTS anon_read_orders ON public.orders;
DROP POLICY IF EXISTS anon_read_order_items ON public.order_items;
DROP POLICY IF EXISTS anon_read_inventory ON public.inventory;

-- app_menu and products may be legitimate public catalog;
-- keep them but consolidate with role-based policies to satisfy lint.
-- If they should NOT be public, drop these too by uncommenting below:
-- DROP POLICY IF EXISTS anon_read_app_menu ON public.app_menu;
-- DROP POLICY IF EXISTS anon_read_products ON public.products;

-- === Consolidate overlapping policies on public.users (multiple_permissive) ===
-- users has 3 overlapping SELECT policies for authenticated role.
-- Keep a single merged policy.
DROP POLICY IF EXISTS users_self_read ON public.users;
DROP POLICY IF EXISTS users_manager_read ON public.users;
DROP POLICY IF EXISTS users_admin_all ON public.users;

CREATE POLICY users_read ON public.users
  FOR SELECT TO authenticated
  USING (
    (SELECT auth.uid()) = id
    OR current_user_role() IN ('admin','manager')
  );

-- Keep admin write separately (full DML)
CREATE POLICY users_admin_all ON public.users
  FOR ALL TO authenticated
  USING (current_user_role() = 'admin')
  WITH CHECK (current_user_role() = 'admin');
