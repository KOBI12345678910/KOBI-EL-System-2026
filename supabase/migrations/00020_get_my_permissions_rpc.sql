-- ============================================================
-- FILE: supabase/migrations/00020_get_my_permissions_rpc.sql
-- Returns the current user's permission codes as a text array.
-- Used by the frontend to conditionally show/hide UI elements.
-- ============================================================

create or replace function governance.get_my_permissions()
returns text[]
language sql
stable
security definer
set search_path = governance, public
as $$
  select coalesce(array_agg(distinct p.permission_code order by p.permission_code), '{}')
  from governance.user_roles ur
  join governance.role_permissions rp on rp.role_id = ur.role_id
  join governance.permissions p on p.id = rp.permission_id
  where ur.user_id = governance.current_user_profile_id()
    and ur.active = true
$$;
