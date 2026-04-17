-- KOBI-EL System 2026 — Seed Data
-- Roles and initial admin user

INSERT INTO public.roles (name, description) VALUES
  ('admin', 'System Administrator'),
  ('manager', 'Department Manager'),
  ('employee', 'Regular Employee'),
  ('viewer', 'Read-only access')
ON CONFLICT (name) DO NOTHING;
