/**
 * Auto-generated Supabase database types.
 * Project: kobi-el-system-2026 (ponypxhushxeskxgrmha)
 * Generated: 2026-04-18
 *
 * To regenerate:
 *   claude → mcp__supabase__generate_typescript_types
 *   or: supabase gen types typescript --project-id ponypxhushxeskxgrmha
 *
 * NOTE: only the `public` schema is exposed to PostgREST by default.
 * Use direct SQL / RPC for commercial, procurement, finance, workforce,
 * execution, inventory, governance, analytics schemas.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      app_menu: {
        Row: {
          created_at: string | null;
          icon: string | null;
          id: number;
          is_visible: boolean | null;
          label: string;
          order_index: number | null;
          parent_id: number | null;
          required_permission: string | null;
          route: string | null;
        };
        Insert: {
          created_at?: string | null;
          icon?: string | null;
          id?: number;
          is_visible?: boolean | null;
          label: string;
          order_index?: number | null;
          parent_id?: number | null;
          required_permission?: string | null;
          route?: string | null;
        };
        Update: {
          created_at?: string | null;
          icon?: string | null;
          id?: number;
          is_visible?: boolean | null;
          label?: string;
          order_index?: number | null;
          parent_id?: number | null;
          required_permission?: string | null;
          route?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "app_menu_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "app_menu";
            referencedColumns: ["id"];
          }
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;
type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<T extends keyof DefaultSchema["Tables"]> =
  DefaultSchema["Tables"][T]["Row"];
export type TablesInsert<T extends keyof DefaultSchema["Tables"]> =
  DefaultSchema["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof DefaultSchema["Tables"]> =
  DefaultSchema["Tables"][T]["Update"];

export const Constants = {
  public: { Enums: {} },
} as const;
