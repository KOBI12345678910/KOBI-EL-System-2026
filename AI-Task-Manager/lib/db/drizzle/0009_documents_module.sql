CREATE TABLE IF NOT EXISTS "document_folders" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "parent_id" integer,
  "color" text DEFAULT '#6366f1',
  "icon" text DEFAULT 'folder',
  "description" text,
  "is_system" boolean NOT NULL DEFAULT false,
  "is_trashed" boolean NOT NULL DEFAULT false,
  "created_by" text DEFAULT 'system',
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "document_files" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "original_name" text NOT NULL,
  "folder_id" integer,
  "mime_type" text NOT NULL DEFAULT 'application/octet-stream',
  "size" bigint NOT NULL DEFAULT 0,
  "file_path" text NOT NULL,
  "thumbnail_path" text,
  "tags" text[] DEFAULT '{}',
  "description" text,
  "uploaded_by" text DEFAULT 'system',
  "is_trashed" boolean NOT NULL DEFAULT false,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "document_tags" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "color" text DEFAULT '#6366f1',
  "created_at" timestamp DEFAULT now() NOT NULL
);
