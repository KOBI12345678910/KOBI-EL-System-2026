CREATE TABLE IF NOT EXISTS "chat_channels" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" varchar(200) NOT NULL,
  "description" text,
  "type" varchar(20) NOT NULL DEFAULT 'group',
  "department" varchar(100),
  "is_default" boolean NOT NULL DEFAULT false,
  "created_by" integer REFERENCES "users"("id"),
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "chat_channel_members" (
  "id" serial PRIMARY KEY NOT NULL,
  "channel_id" integer NOT NULL REFERENCES "chat_channels"("id") ON DELETE CASCADE,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role" varchar(20) NOT NULL DEFAULT 'member',
  "joined_at" timestamp NOT NULL DEFAULT now(),
  "last_read_at" timestamp
);

CREATE TABLE IF NOT EXISTS "chat_messages" (
  "id" serial PRIMARY KEY NOT NULL,
  "channel_id" integer REFERENCES "chat_channels"("id") ON DELETE CASCADE,
  "sender_id" integer NOT NULL REFERENCES "users"("id"),
  "recipient_id" integer REFERENCES "users"("id"),
  "content" text NOT NULL,
  "message_type" varchar(20) NOT NULL DEFAULT 'text',
  "attachments" jsonb,
  "is_edited" boolean NOT NULL DEFAULT false,
  "is_deleted" boolean NOT NULL DEFAULT false,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "chat_direct_conversations" (
  "id" serial PRIMARY KEY NOT NULL,
  "user1_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "user2_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "last_message_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "chat_read_receipts" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "channel_id" integer REFERENCES "chat_channels"("id") ON DELETE CASCADE,
  "direct_conversation_id" integer REFERENCES "chat_direct_conversations"("id") ON DELETE CASCADE,
  "last_read_message_id" integer REFERENCES "chat_messages"("id"),
  "last_read_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_chat_messages_channel_id" ON "chat_messages"("channel_id");
CREATE INDEX IF NOT EXISTS "idx_chat_messages_sender_id" ON "chat_messages"("sender_id");
CREATE INDEX IF NOT EXISTS "idx_chat_messages_recipient_id" ON "chat_messages"("recipient_id");
CREATE INDEX IF NOT EXISTS "idx_chat_channel_members_channel_id" ON "chat_channel_members"("channel_id");
CREATE INDEX IF NOT EXISTS "idx_chat_channel_members_user_id" ON "chat_channel_members"("user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_chat_channel_members_unique" ON "chat_channel_members"("channel_id", "user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_chat_dm_conversations_unique" ON "chat_direct_conversations"("user1_id", "user2_id");
CREATE INDEX IF NOT EXISTS "idx_chat_read_receipts_user_channel" ON "chat_read_receipts"("user_id", "channel_id");
CREATE INDEX IF NOT EXISTS "idx_chat_read_receipts_user_dm" ON "chat_read_receipts"("user_id", "direct_conversation_id");
