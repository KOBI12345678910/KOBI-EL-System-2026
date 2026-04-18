CREATE TABLE IF NOT EXISTS "category_definitions" (
  "id" serial PRIMARY KEY NOT NULL,
  "entity_id" integer NOT NULL REFERENCES "module_entities"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "description" text,
  "allow_multiple" boolean NOT NULL DEFAULT false,
  "is_required" boolean NOT NULL DEFAULT false,
  "is_active" boolean NOT NULL DEFAULT true,
  "settings" jsonb DEFAULT '{}'::jsonb,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "button_definitions" (
  "id" serial PRIMARY KEY NOT NULL,
  "entity_id" integer NOT NULL REFERENCES "module_entities"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "placement" text NOT NULL DEFAULT 'toolbar',
  "style" text DEFAULT 'primary',
  "icon" text,
  "color" text,
  "action_id" integer,
  "action_type" text,
  "action_config" jsonb DEFAULT '{}'::jsonb,
  "conditions" jsonb DEFAULT '{}'::jsonb,
  "sort_order" integer NOT NULL DEFAULT 0,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "category_items" (
  "id" serial PRIMARY KEY NOT NULL,
  "entity_id" integer NOT NULL REFERENCES "module_entities"("id") ON DELETE CASCADE,
  "category_def_id" integer,
  "parent_id" integer,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "icon" text,
  "color" text,
  "sort_order" integer NOT NULL DEFAULT 0,
  "is_active" boolean NOT NULL DEFAULT true,
  "settings" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "detail_page_definitions" (
  "id" serial PRIMARY KEY NOT NULL,
  "entity_id" integer NOT NULL REFERENCES "module_entities"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "header_fields" jsonb DEFAULT '[]'::jsonb,
  "tabs" jsonb DEFAULT '[]'::jsonb,
  "related_lists" jsonb DEFAULT '[]'::jsonb,
  "action_bar" jsonb DEFAULT '[]'::jsonb,
  "sections" jsonb DEFAULT '[]'::jsonb,
  "settings" jsonb DEFAULT '{}'::jsonb,
  "is_default" boolean NOT NULL DEFAULT false,
  "is_active" boolean NOT NULL DEFAULT true,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

ALTER TABLE "detail_definitions" ADD COLUMN IF NOT EXISTS "header_fields" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE "detail_definitions" ADD COLUMN IF NOT EXISTS "tabs" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE "detail_definitions" ADD COLUMN IF NOT EXISTS "related_lists" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE "detail_definitions" ADD COLUMN IF NOT EXISTS "action_bar" jsonb DEFAULT '[]'::jsonb;
