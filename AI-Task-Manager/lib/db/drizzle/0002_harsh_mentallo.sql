-- P1 Schema Expansion: ALTER TABLE for existing core tables + CREATE TABLE for new scaffolding tables

-- platform_modules: add new P1 columns
ALTER TABLE "platform_modules" ADD COLUMN IF NOT EXISTS "name_he" text;
ALTER TABLE "platform_modules" ADD COLUMN IF NOT EXISTS "name_en" text;
ALTER TABLE "platform_modules" ADD COLUMN IF NOT EXISTS "module_key" text;
ALTER TABLE "platform_modules" ADD COLUMN IF NOT EXISTS "show_in_sidebar" boolean DEFAULT true NOT NULL;
ALTER TABLE "platform_modules" ADD COLUMN IF NOT EXISTS "show_in_dashboard" boolean DEFAULT false NOT NULL;
ALTER TABLE "platform_modules" ADD COLUMN IF NOT EXISTS "permissions_scope" text;
ALTER TABLE "platform_modules" ADD COLUMN IF NOT EXISTS "notes" text;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'platform_modules_module_key_unique') THEN
    ALTER TABLE "platform_modules" ADD CONSTRAINT "platform_modules_module_key_unique" UNIQUE("module_key");
  END IF;
END $$;
--> statement-breakpoint

-- module_entities: add new P1 columns
ALTER TABLE "module_entities" ADD COLUMN IF NOT EXISTS "name_he" text;
ALTER TABLE "module_entities" ADD COLUMN IF NOT EXISTS "name_en" text;
ALTER TABLE "module_entities" ADD COLUMN IF NOT EXISTS "entity_key" text;
ALTER TABLE "module_entities" ADD COLUMN IF NOT EXISTS "table_name" text;
ALTER TABLE "module_entities" ADD COLUMN IF NOT EXISTS "primary_display_field" text;
ALTER TABLE "module_entities" ADD COLUMN IF NOT EXISTS "has_status" boolean DEFAULT false NOT NULL;
ALTER TABLE "module_entities" ADD COLUMN IF NOT EXISTS "has_categories" boolean DEFAULT false NOT NULL;
ALTER TABLE "module_entities" ADD COLUMN IF NOT EXISTS "has_attachments" boolean DEFAULT false NOT NULL;
ALTER TABLE "module_entities" ADD COLUMN IF NOT EXISTS "has_notes" boolean DEFAULT false NOT NULL;
ALTER TABLE "module_entities" ADD COLUMN IF NOT EXISTS "has_owner" boolean DEFAULT false NOT NULL;
ALTER TABLE "module_entities" ADD COLUMN IF NOT EXISTS "has_numbering" boolean DEFAULT false NOT NULL;
ALTER TABLE "module_entities" ADD COLUMN IF NOT EXISTS "has_created_updated" boolean DEFAULT true NOT NULL;
ALTER TABLE "module_entities" ADD COLUMN IF NOT EXISTS "has_soft_delete" boolean DEFAULT false NOT NULL;
ALTER TABLE "module_entities" ADD COLUMN IF NOT EXISTS "has_audit" boolean DEFAULT false NOT NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'module_entities_entity_key_unique') THEN
    ALTER TABLE "module_entities" ADD CONSTRAINT "module_entities_entity_key_unique" UNIQUE("entity_key");
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'module_entities_table_name_unique') THEN
    ALTER TABLE "module_entities" ADD CONSTRAINT "module_entities_table_name_unique" UNIQUE("table_name");
  END IF;
END $$;
--> statement-breakpoint

-- entity_fields: add new P1 columns
ALTER TABLE "entity_fields" ADD COLUMN IF NOT EXISTS "name_he" text;
ALTER TABLE "entity_fields" ADD COLUMN IF NOT EXISTS "name_en" text;
ALTER TABLE "entity_fields" ADD COLUMN IF NOT EXISTS "field_key" text;
ALTER TABLE "entity_fields" ADD COLUMN IF NOT EXISTS "is_filterable" boolean DEFAULT false NOT NULL;
ALTER TABLE "entity_fields" ADD COLUMN IF NOT EXISTS "is_read_only" boolean DEFAULT false NOT NULL;
ALTER TABLE "entity_fields" ADD COLUMN IF NOT EXISTS "is_system_field" boolean DEFAULT false NOT NULL;
ALTER TABLE "entity_fields" ADD COLUMN IF NOT EXISTS "is_calculated" boolean DEFAULT false NOT NULL;
ALTER TABLE "entity_fields" ADD COLUMN IF NOT EXISTS "formula_expression" text;
ALTER TABLE "entity_fields" ADD COLUMN IF NOT EXISTS "min_value" real;
ALTER TABLE "entity_fields" ADD COLUMN IF NOT EXISTS "max_value" real;
ALTER TABLE "entity_fields" ADD COLUMN IF NOT EXISTS "max_length" integer;
ALTER TABLE "entity_fields" ADD COLUMN IF NOT EXISTS "options_json" jsonb;
ALTER TABLE "entity_fields" ADD COLUMN IF NOT EXISTS "relation_type" text;
ALTER TABLE "entity_fields" ADD COLUMN IF NOT EXISTS "section_key" text;
ALTER TABLE "entity_fields" ADD COLUMN IF NOT EXISTS "tab_key" text;
CREATE UNIQUE INDEX IF NOT EXISTS "entity_fields_entity_id_field_key_unique" ON "entity_fields" ("entity_id", "field_key");
--> statement-breakpoint

-- Scaffolding tables (new tables for future phases)
-- All columns match the Drizzle schema in lib/db/src/schema/scaffolding-tables.ts

CREATE TABLE IF NOT EXISTS "system_form_sections" (
  "id" serial PRIMARY KEY NOT NULL,
  "entity_id" integer NOT NULL REFERENCES "module_entities"("id") ON DELETE CASCADE,
  "form_id" integer,
  "name" text NOT NULL,
  "name_he" text,
  "name_en" text,
  "slug" text NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "is_collapsible" boolean DEFAULT false NOT NULL,
  "is_collapsed" boolean DEFAULT false NOT NULL,
  "settings" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "system_form_fields" (
  "id" serial PRIMARY KEY NOT NULL,
  "section_id" integer NOT NULL REFERENCES "system_form_sections"("id") ON DELETE CASCADE,
  "field_id" integer NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "width" text DEFAULT 'full' NOT NULL,
  "is_visible" boolean DEFAULT true NOT NULL,
  "settings" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "system_view_columns" (
  "id" serial PRIMARY KEY NOT NULL,
  "view_id" integer NOT NULL,
  "field_id" integer NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "width" text,
  "is_visible" boolean DEFAULT true NOT NULL,
  "is_sortable" boolean DEFAULT true NOT NULL,
  "is_filterable" boolean DEFAULT false NOT NULL,
  "settings" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "system_detail_pages" (
  "id" serial PRIMARY KEY NOT NULL,
  "entity_id" integer NOT NULL REFERENCES "module_entities"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "is_default" boolean DEFAULT false NOT NULL,
  "settings" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "system_detail_sections" (
  "id" serial PRIMARY KEY NOT NULL,
  "detail_page_id" integer NOT NULL REFERENCES "system_detail_pages"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "section_type" text DEFAULT 'fields' NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "settings" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "system_buttons" (
  "id" serial PRIMARY KEY NOT NULL,
  "entity_id" integer NOT NULL REFERENCES "module_entities"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "button_type" text NOT NULL,
  "icon" text,
  "color" text,
  "action_type" text,
  "action_config" jsonb DEFAULT '{}'::jsonb,
  "conditions" jsonb DEFAULT '{}'::jsonb,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "system_categories" (
  "id" serial PRIMARY KEY NOT NULL,
  "entity_id" integer NOT NULL REFERENCES "module_entities"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "name_he" text,
  "name_en" text,
  "slug" text NOT NULL,
  "parent_id" integer,
  "color" text,
  "icon" text,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "settings" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "system_status_sets" (
  "id" serial PRIMARY KEY NOT NULL,
  "entity_id" integer NOT NULL REFERENCES "module_entities"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "is_default" boolean DEFAULT false NOT NULL,
  "settings" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "system_status_values" (
  "id" serial PRIMARY KEY NOT NULL,
  "status_set_id" integer NOT NULL REFERENCES "system_status_sets"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "name_he" text,
  "name_en" text,
  "slug" text NOT NULL,
  "color" text DEFAULT 'gray' NOT NULL,
  "icon" text,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "is_default" boolean DEFAULT false NOT NULL,
  "is_final" boolean DEFAULT false NOT NULL,
  "settings" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "system_permissions" (
  "id" serial PRIMARY KEY NOT NULL,
  "entity_id" integer,
  "module_id" integer,
  "role" text NOT NULL,
  "action" text NOT NULL,
  "is_allowed" boolean DEFAULT true NOT NULL,
  "conditions" jsonb DEFAULT '{}'::jsonb,
  "settings" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "system_menu_items" (
  "id" serial PRIMARY KEY NOT NULL,
  "module_id" integer,
  "entity_id" integer,
  "parent_id" integer,
  "label" text NOT NULL,
  "label_he" text,
  "label_en" text,
  "icon" text,
  "path" text,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "settings" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "system_dashboard_pages" (
  "id" serial PRIMARY KEY NOT NULL,
  "module_id" integer,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "is_default" boolean DEFAULT false NOT NULL,
  "layout" jsonb DEFAULT '{}'::jsonb,
  "settings" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "system_dashboard_widgets" (
  "id" serial PRIMARY KEY NOT NULL,
  "dashboard_id" integer NOT NULL REFERENCES "system_dashboard_pages"("id") ON DELETE CASCADE,
  "widget_type" text NOT NULL,
  "title" text NOT NULL,
  "entity_id" integer,
  "config" jsonb DEFAULT '{}'::jsonb,
  "position" jsonb DEFAULT '{}'::jsonb,
  "size" jsonb DEFAULT '{}'::jsonb,
  "settings" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "system_validations" (
  "id" serial PRIMARY KEY NOT NULL,
  "entity_id" integer NOT NULL REFERENCES "module_entities"("id") ON DELETE CASCADE,
  "field_id" integer,
  "validation_type" text NOT NULL,
  "rule" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "error_message" text,
  "error_message_he" text,
  "error_message_en" text,
  "is_active" boolean DEFAULT true NOT NULL,
  "settings" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "system_templates" (
  "id" serial PRIMARY KEY NOT NULL,
  "entity_id" integer,
  "module_id" integer,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "template_type" text NOT NULL,
  "content" jsonb DEFAULT '{}'::jsonb,
  "is_active" boolean DEFAULT true NOT NULL,
  "settings" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "system_versions" (
  "id" serial PRIMARY KEY NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" integer NOT NULL,
  "version_number" integer DEFAULT 1 NOT NULL,
  "data" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_by" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "system_publish_logs" (
  "id" serial PRIMARY KEY NOT NULL,
  "module_id" integer,
  "entity_type" text NOT NULL,
  "entity_id" integer NOT NULL,
  "action" text NOT NULL,
  "previous_version" integer,
  "new_version" integer,
  "published_by" text,
  "notes" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);
