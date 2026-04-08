CREATE TABLE "ai_providers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"website" text,
	"api_base_url" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ai_providers_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "ai_models" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider_id" integer NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"model_type" text NOT NULL,
	"max_tokens" integer,
	"cost_per_input_token" numeric(12, 8),
	"cost_per_output_token" numeric(12, 8),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ai_models_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "ai_api_keys" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider_id" integer NOT NULL,
	"key_name" text NOT NULL,
	"api_key" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_used_at" timestamp,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_usage_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"model_id" integer NOT NULL,
	"api_key_id" integer,
	"input_tokens" integer,
	"output_tokens" integer,
	"total_tokens" integer,
	"cost" numeric(12, 8),
	"response_time_ms" integer,
	"status_code" integer,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_queries" (
	"id" serial PRIMARY KEY NOT NULL,
	"model_id" integer NOT NULL,
	"prompt" text NOT NULL,
	"system_prompt" text,
	"parameters" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_responses" (
	"id" serial PRIMARY KEY NOT NULL,
	"query_id" integer NOT NULL,
	"content" text NOT NULL,
	"finish_reason" text,
	"tokens_used" integer,
	"response_time_ms" integer,
	"rating" integer,
	"feedback" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_recommendations" (
	"id" serial PRIMARY KEY NOT NULL,
	"model_id" integer,
	"title" text NOT NULL,
	"description" text,
	"category" text NOT NULL,
	"confidence" numeric(5, 2),
	"status" text DEFAULT 'pending' NOT NULL,
	"is_applied" boolean DEFAULT false NOT NULL,
	"metadata" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_permissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"role" text NOT NULL,
	"model_id" integer,
	"can_query" boolean DEFAULT false NOT NULL,
	"can_manage_keys" boolean DEFAULT false NOT NULL,
	"can_view_logs" boolean DEFAULT false NOT NULL,
	"can_manage_models" boolean DEFAULT false NOT NULL,
	"can_manage_providers" boolean DEFAULT false NOT NULL,
	"max_queries_per_day" integer,
	"max_tokens_per_day" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_prompt_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"category" text NOT NULL,
	"prompt_template" text NOT NULL,
	"system_prompt" text,
	"default_model_id" integer,
	"variables" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ai_prompt_templates_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"module_id" integer,
	"record_id" integer,
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_modules" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"icon" text DEFAULT 'Box' NOT NULL,
	"color" text DEFAULT 'blue' NOT NULL,
	"category" text DEFAULT 'כללי' NOT NULL,
	"parent_module_id" integer,
	"status" text DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "platform_modules_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "module_entities" (
	"id" serial PRIMARY KEY NOT NULL,
	"module_id" integer NOT NULL,
	"name" text NOT NULL,
	"name_plural" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"icon" text DEFAULT 'FileText' NOT NULL,
	"entity_type" text DEFAULT 'master' NOT NULL,
	"parent_entity_id" integer,
	"settings" jsonb DEFAULT '{}'::jsonb,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entity_fields" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity_id" integer NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"field_type" text NOT NULL,
	"group_name" text,
	"description" text,
	"placeholder" text,
	"help_text" text,
	"is_required" boolean DEFAULT false NOT NULL,
	"is_unique" boolean DEFAULT false NOT NULL,
	"is_searchable" boolean DEFAULT true NOT NULL,
	"is_sortable" boolean DEFAULT true NOT NULL,
	"show_in_list" boolean DEFAULT true NOT NULL,
	"show_in_form" boolean DEFAULT true NOT NULL,
	"show_in_detail" boolean DEFAULT true NOT NULL,
	"default_value" text,
	"validation_rules" jsonb DEFAULT '{}'::jsonb,
	"display_rules" jsonb DEFAULT '{}'::jsonb,
	"options" jsonb DEFAULT '[]'::jsonb,
	"related_entity_id" integer,
	"related_display_field" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"field_width" text DEFAULT 'full' NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entity_relations" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_entity_id" integer NOT NULL,
	"target_entity_id" integer NOT NULL,
	"relation_type" text NOT NULL,
	"source_field_slug" text,
	"target_field_slug" text,
	"label" text NOT NULL,
	"reverse_label" text,
	"cascade_delete" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entity_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity_id" integer NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text,
	"created_by" text,
	"updated_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entity_statuses" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity_id" integer NOT NULL,
	"name" text NOT NULL,
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
CREATE TABLE "status_transitions" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity_id" integer NOT NULL,
	"from_status_id" integer,
	"to_status_id" integer NOT NULL,
	"label" text NOT NULL,
	"icon" text,
	"conditions" jsonb DEFAULT '{}'::jsonb,
	"settings" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "view_definitions" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity_id" integer NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"view_type" text DEFAULT 'table' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"columns" jsonb DEFAULT '[]'::jsonb,
	"filters" jsonb DEFAULT '[]'::jsonb,
	"sorting" jsonb DEFAULT '[]'::jsonb,
	"grouping" jsonb DEFAULT '{}'::jsonb,
	"settings" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "form_definitions" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity_id" integer NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"form_type" text DEFAULT 'create' NOT NULL,
	"sections" jsonb DEFAULT '[]'::jsonb,
	"settings" jsonb DEFAULT '{}'::jsonb,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "action_definitions" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity_id" integer NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"action_type" text NOT NULL,
	"handler_type" text NOT NULL,
	"icon" text,
	"color" text,
	"conditions" jsonb DEFAULT '{}'::jsonb,
	"handler_config" jsonb DEFAULT '{}'::jsonb,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "record_audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity_id" integer NOT NULL,
	"record_id" integer NOT NULL,
	"action" text NOT NULL,
	"changes" jsonb DEFAULT '{}'::jsonb,
	"performed_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_widgets" (
	"id" serial PRIMARY KEY NOT NULL,
	"module_id" integer NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"widget_type" text DEFAULT 'count' NOT NULL,
	"entity_id" integer,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_workflows" (
	"id" serial PRIMARY KEY NOT NULL,
	"module_id" integer NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"trigger_type" text DEFAULT 'on_create' NOT NULL,
	"trigger_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"conditions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_models" ADD CONSTRAINT "ai_models_provider_id_ai_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."ai_providers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_api_keys" ADD CONSTRAINT "ai_api_keys_provider_id_ai_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."ai_providers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_model_id_ai_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."ai_models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_api_key_id_ai_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."ai_api_keys"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_queries" ADD CONSTRAINT "ai_queries_model_id_ai_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."ai_models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_responses" ADD CONSTRAINT "ai_responses_query_id_ai_queries_id_fk" FOREIGN KEY ("query_id") REFERENCES "public"."ai_queries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_recommendations" ADD CONSTRAINT "ai_recommendations_model_id_ai_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."ai_models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_permissions" ADD CONSTRAINT "ai_permissions_model_id_ai_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."ai_models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_prompt_templates" ADD CONSTRAINT "ai_prompt_templates_default_model_id_ai_models_id_fk" FOREIGN KEY ("default_model_id") REFERENCES "public"."ai_models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "module_entities" ADD CONSTRAINT "module_entities_module_id_platform_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."platform_modules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_fields" ADD CONSTRAINT "entity_fields_entity_id_module_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."module_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_relations" ADD CONSTRAINT "entity_relations_source_entity_id_module_entities_id_fk" FOREIGN KEY ("source_entity_id") REFERENCES "public"."module_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_relations" ADD CONSTRAINT "entity_relations_target_entity_id_module_entities_id_fk" FOREIGN KEY ("target_entity_id") REFERENCES "public"."module_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_records" ADD CONSTRAINT "entity_records_entity_id_module_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."module_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_statuses" ADD CONSTRAINT "entity_statuses_entity_id_module_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."module_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "status_transitions" ADD CONSTRAINT "status_transitions_entity_id_module_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."module_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "status_transitions" ADD CONSTRAINT "status_transitions_from_status_id_entity_statuses_id_fk" FOREIGN KEY ("from_status_id") REFERENCES "public"."entity_statuses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "status_transitions" ADD CONSTRAINT "status_transitions_to_status_id_entity_statuses_id_fk" FOREIGN KEY ("to_status_id") REFERENCES "public"."entity_statuses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "view_definitions" ADD CONSTRAINT "view_definitions_entity_id_module_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."module_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_definitions" ADD CONSTRAINT "form_definitions_entity_id_module_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."module_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_definitions" ADD CONSTRAINT "action_definitions_entity_id_module_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."module_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_widgets" ADD CONSTRAINT "platform_widgets_module_id_platform_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."platform_modules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_workflows" ADD CONSTRAINT "platform_workflows_module_id_platform_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."platform_modules"("id") ON DELETE cascade ON UPDATE no action;