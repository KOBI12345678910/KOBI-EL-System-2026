CREATE TABLE IF NOT EXISTS "integration_messages" (
  "id" serial PRIMARY KEY NOT NULL,
  "connection_id" integer NOT NULL REFERENCES "integration_connections"("id") ON DELETE CASCADE,
  "channel" text NOT NULL,
  "direction" text DEFAULT 'outbound' NOT NULL,
  "external_id" text,
  "from_address" text,
  "to_address" text NOT NULL,
  "subject" text,
  "body" text NOT NULL,
  "body_html" text,
  "status" text DEFAULT 'sent' NOT NULL,
  "entity_type" text,
  "entity_id" integer,
  "entity_name" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "sent_at" timestamp,
  "delivered_at" timestamp,
  "read_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_integration_messages_entity" ON "integration_messages" ("entity_type", "entity_id");
CREATE INDEX IF NOT EXISTS "idx_integration_messages_channel" ON "integration_messages" ("channel");
CREATE INDEX IF NOT EXISTS "idx_integration_messages_connection" ON "integration_messages" ("connection_id");

CREATE TABLE IF NOT EXISTS "integration_templates" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "channel" text NOT NULL,
  "subject" text,
  "body" text NOT NULL,
  "body_html" text,
  "variables" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "category" text,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
