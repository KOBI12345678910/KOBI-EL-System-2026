// AUTO-GENERATED from Supabase project ponypxhushxeskxgrmha (kobi-el-system-2026)
// Generated: 2026-04-29
// DO NOT EDIT — re-run `mcp__supabase__generate_typescript_types` to refresh

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      _temp_file_transfer: {
        Row: {
          content: string
          created_at: string | null
          filename: string
          id: number
        }
        Insert: {
          content: string
          created_at?: string | null
          filename: string
          id?: number
        }
        Update: {
          content?: string
          created_at?: string | null
          filename?: string
          id?: number
        }
        Relationships: []
      }
      ab_experiments: {
        Row: {
          confidence_pct: number | null
          created_at: string | null
          end_date: string | null
          hypothesis: string | null
          id: string
          metric: string | null
          name: string | null
          participants: number | null
          project_id: string | null
          start_date: string | null
          status: string | null
          traffic_pct: number | null
          variants: Json | null
          winner: string | null
        }
        Insert: {
          confidence_pct?: number | null
          created_at?: string | null
          end_date?: string | null
          hypothesis?: string | null
          id: string
          metric?: string | null
          name?: string | null
          participants?: number | null
          project_id?: string | null
          start_date?: string | null
          status?: string | null
          traffic_pct?: number | null
          variants?: Json | null
          winner?: string | null
        }
        Update: {
          confidence_pct?: number | null
          created_at?: string | null
          end_date?: string | null
          hypothesis?: string | null
          id?: string
          metric?: string | null
          name?: string | null
          participants?: number | null
          project_id?: string | null
          start_date?: string | null
          status?: string | null
          traffic_pct?: number | null
          variants?: Json | null
          winner?: string | null
        }
        Relationships: []
      }
      activity_feed: {
        Row: {
          action: string | null
          created_at: string | null
          description: string | null
          id: string
          metadata: Json | null
          project_id: string | null
          title: string | null
          user_id: string | null
        }
        Insert: {
          action?: string | null
          created_at?: string | null
          description?: string | null
          id: string
          metadata?: Json | null
          project_id?: string | null
          title?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          metadata?: Json | null
          project_id?: string | null
          title?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      agri_crops: {
        Row: {
          category: string | null
          created_at: string | null
          crop_name: string
          days_to_maturity: number | null
          growing_season: string | null
          id: string
          notes: string | null
          optimal_temp_max: number | null
          optimal_temp_min: number | null
          planting_depth_cm: number | null
          soil_ph_max: number | null
          soil_ph_min: number | null
          spacing_cm: number | null
          tenant_id: string | null
          variety: string | null
          water_needs: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          crop_name: string
          days_to_maturity?: number | null
          growing_season?: string | null
          id?: string
          notes?: string | null
          optimal_temp_max?: number | null
          optimal_temp_min?: number | null
          planting_depth_cm?: number | null
          soil_ph_max?: number | null
          soil_ph_min?: number | null
          spacing_cm?: number | null
          tenant_id?: string | null
          variety?: string | null
          water_needs?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          crop_name?: string
          days_to_maturity?: number | null
          growing_season?: string | null
          id?: string
          notes?: string | null
          optimal_temp_max?: number | null
          optimal_temp_min?: number | null
          planting_depth_cm?: number | null
          soil_ph_max?: number | null
          soil_ph_min?: number | null
          spacing_cm?: number | null
          tenant_id?: string | null
          variety?: string | null
          water_needs?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agri_crops_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      agri_farms: {
        Row: {
          address: string | null
          area_unit: string | null
          certifications: string[] | null
          city: string | null
          climate_zone: string | null
          country: string | null
          created_at: string | null
          farm_name: string
          farm_type: string | null
          id: string
          latitude: number | null
          longitude: number | null
          manager: string | null
          owner: string | null
          region: string | null
          soil_type: string | null
          tenant_id: string | null
          total_area: number | null
        }
        Insert: {
          address?: string | null
          area_unit?: string | null
          certifications?: string[] | null
          city?: string | null
          climate_zone?: string | null
          country?: string | null
          created_at?: string | null
          farm_name: string
          farm_type?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          manager?: string | null
          owner?: string | null
          region?: string | null
          soil_type?: string | null
          tenant_id?: string | null
          total_area?: number | null
        }
        Update: {
          address?: string | null
          area_unit?: string | null
          certifications?: string[] | null
          city?: string | null
          climate_zone?: string | null
          country?: string | null
          created_at?: string | null
          farm_name?: string
          farm_type?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          manager?: string | null
          owner?: string | null
          region?: string | null
          soil_type?: string | null
          tenant_id?: string | null
          total_area?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "agri_farms_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      agri_fields: {
        Row: {
          area: number | null
          area_unit: string | null
          current_crop: string | null
          expected_harvest: string | null
          farm_id: string
          field_name: string
          gps_boundary: Json | null
          id: string
          irrigation_type: string | null
          planting_date: string | null
          soil_type: string | null
          status: string | null
        }
        Insert: {
          area?: number | null
          area_unit?: string | null
          current_crop?: string | null
          expected_harvest?: string | null
          farm_id: string
          field_name: string
          gps_boundary?: Json | null
          id?: string
          irrigation_type?: string | null
          planting_date?: string | null
          soil_type?: string | null
          status?: string | null
        }
        Update: {
          area?: number | null
          area_unit?: string | null
          current_crop?: string | null
          expected_harvest?: string | null
          farm_id?: string
          field_name?: string
          gps_boundary?: Json | null
          id?: string
          irrigation_type?: string | null
          planting_date?: string | null
          soil_type?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agri_fields_farm_id_fkey"
            columns: ["farm_id"]
            isOneToOne: false
            referencedRelation: "agri_farms"
            referencedColumns: ["id"]
          },
        ]
      }
      agri_harvest_logs: {
        Row: {
          buyer: string | null
          created_at: string | null
          crop_id: string | null
          field_id: string
          harvest_date: string
          id: string
          moisture_percent: number | null
          notes: string | null
          price_per_unit: number | null
          quality_grade: string | null
          quantity: number | null
          storage_location: string | null
          unit: string | null
        }
        Insert: {
          buyer?: string | null
          created_at?: string | null
          crop_id?: string | null
          field_id: string
          harvest_date: string
          id?: string
          moisture_percent?: number | null
          notes?: string | null
          price_per_unit?: number | null
          quality_grade?: string | null
          quantity?: number | null
          storage_location?: string | null
          unit?: string | null
        }
        Update: {
          buyer?: string | null
          created_at?: string | null
          crop_id?: string | null
          field_id?: string
          harvest_date?: string
          id?: string
          moisture_percent?: number | null
          notes?: string | null
          price_per_unit?: number | null
          quality_grade?: string | null
          quantity?: number | null
          storage_location?: string | null
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agri_harvest_logs_crop_id_fkey"
            columns: ["crop_id"]
            isOneToOne: false
            referencedRelation: "agri_crops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agri_harvest_logs_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "agri_fields"
            referencedColumns: ["id"]
          },
        ]
      }
      agri_livestock: {
        Row: {
          animal_id: string | null
          animal_type: string
          breed: string | null
          created_at: string | null
          date_of_birth: string | null
          father_id: string | null
          gender: string | null
          health_status: string | null
          id: string
          location: string | null
          mother_id: string | null
          notes: string | null
          status: string | null
          tag_number: string | null
          tenant_id: string | null
          vaccinations: Json | null
          weight: number | null
        }
        Insert: {
          animal_id?: string | null
          animal_type: string
          breed?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          father_id?: string | null
          gender?: string | null
          health_status?: string | null
          id?: string
          location?: string | null
          mother_id?: string | null
          notes?: string | null
          status?: string | null
          tag_number?: string | null
          tenant_id?: string | null
          vaccinations?: Json | null
          weight?: number | null
        }
        Update: {
          animal_id?: string | null
          animal_type?: string
          breed?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          father_id?: string | null
          gender?: string | null
          health_status?: string | null
          id?: string
          location?: string | null
          mother_id?: string | null
          notes?: string | null
          status?: string | null
          tag_number?: string | null
          tenant_id?: string | null
          vaccinations?: Json | null
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "agri_livestock_father_id_fkey"
            columns: ["father_id"]
            isOneToOne: false
            referencedRelation: "agri_livestock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agri_livestock_mother_id_fkey"
            columns: ["mother_id"]
            isOneToOne: false
            referencedRelation: "agri_livestock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agri_livestock_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agents: {
        Row: {
          created_at: string | null
          id: string
          last_active_at: string | null
          memory: Json | null
          model: string | null
          name: string | null
          personality: string | null
          skills: Json | null
          status: string | null
          success_rate: number | null
          tasks_completed: number | null
          tokens_consumed: number | null
          type: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id: string
          last_active_at?: string | null
          memory?: Json | null
          model?: string | null
          name?: string | null
          personality?: string | null
          skills?: Json | null
          status?: string | null
          success_rate?: number | null
          tasks_completed?: number | null
          tokens_consumed?: number | null
          type?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          last_active_at?: string | null
          memory?: Json | null
          model?: string | null
          name?: string | null
          personality?: string | null
          skills?: Json | null
          status?: string | null
          success_rate?: number | null
          tasks_completed?: number | null
          tokens_consumed?: number | null
          type?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      ai_code_reviews: {
        Row: {
          auto_fixable: boolean | null
          category: string | null
          created_at: string | null
          description: string | null
          file_path: string | null
          id: string
          line_end: number | null
          line_start: number | null
          model_used: string | null
          project_id: string | null
          severity: string | null
          status: string | null
          suggested_fix: string | null
          title: string | null
        }
        Insert: {
          auto_fixable?: boolean | null
          category?: string | null
          created_at?: string | null
          description?: string | null
          file_path?: string | null
          id: string
          line_end?: number | null
          line_start?: number | null
          model_used?: string | null
          project_id?: string | null
          severity?: string | null
          status?: string | null
          suggested_fix?: string | null
          title?: string | null
        }
        Update: {
          auto_fixable?: boolean | null
          category?: string | null
          created_at?: string | null
          description?: string | null
          file_path?: string | null
          id?: string
          line_end?: number | null
          line_start?: number | null
          model_used?: string | null
          project_id?: string | null
          severity?: string | null
          status?: string | null
          suggested_fix?: string | null
          title?: string | null
        }
        Relationships: []
      }
      ai_messages: {
        Row: {
          content: string
          created_at: string | null
          id: string
          role: string
          session_id: string | null
          tenant_id: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          role: string
          session_id?: string | null
          tenant_id?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          role?: string
          session_id?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "ai_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_models: {
        Row: {
          category: string | null
          context_window: number | null
          cost_per_1k_input: number | null
          cost_per_1k_output: number | null
          created_at: string | null
          id: string
          max_tokens: number | null
          metadata: Json | null
          model_id: string | null
          name: string | null
          provider: string | null
          quality_rating: string | null
          speed_rating: string | null
          status: string | null
          supports_function_calling: boolean | null
          supports_streaming: boolean | null
          supports_vision: boolean | null
        }
        Insert: {
          category?: string | null
          context_window?: number | null
          cost_per_1k_input?: number | null
          cost_per_1k_output?: number | null
          created_at?: string | null
          id: string
          max_tokens?: number | null
          metadata?: Json | null
          model_id?: string | null
          name?: string | null
          provider?: string | null
          quality_rating?: string | null
          speed_rating?: string | null
          status?: string | null
          supports_function_calling?: boolean | null
          supports_streaming?: boolean | null
          supports_vision?: boolean | null
        }
        Update: {
          category?: string | null
          context_window?: number | null
          cost_per_1k_input?: number | null
          cost_per_1k_output?: number | null
          created_at?: string | null
          id?: string
          max_tokens?: number | null
          metadata?: Json | null
          model_id?: string | null
          name?: string | null
          provider?: string | null
          quality_rating?: string | null
          speed_rating?: string | null
          status?: string | null
          supports_function_calling?: boolean | null
          supports_streaming?: boolean | null
          supports_vision?: boolean | null
        }
        Relationships: []
      }
      ai_sessions: {
        Row: {
          created_at: string | null
          id: string
          model: string | null
          tenant_id: string | null
          title: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          model?: string | null
          tenant_id?: string | null
          title?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          model?: string | null
          tenant_id?: string | null
          title?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_sessions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_workflows: {
        Row: {
          avg_duration_sec: number | null
          created_at: string | null
          description: string | null
          id: string
          last_run_at: string | null
          name: string | null
          run_count: number | null
          status: string | null
          steps: Json | null
          trigger_type: string | null
          user_id: string | null
        }
        Insert: {
          avg_duration_sec?: number | null
          created_at?: string | null
          description?: string | null
          id: string
          last_run_at?: string | null
          name?: string | null
          run_count?: number | null
          status?: string | null
          steps?: Json | null
          trigger_type?: string | null
          user_id?: string | null
        }
        Update: {
          avg_duration_sec?: number | null
          created_at?: string | null
          description?: string | null
          id?: string
          last_run_at?: string | null
          name?: string | null
          run_count?: number | null
          status?: string | null
          steps?: Json | null
          trigger_type?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      analytics_events: {
        Row: {
          city: string | null
          country: string | null
          created_at: string | null
          device: string | null
          element: string | null
          event_type: string | null
          id: string
          metadata: Json | null
          page: string | null
          project_id: string | null
          session_id: string | null
          user_agent: string | null
          value: number | null
        }
        Insert: {
          city?: string | null
          country?: string | null
          created_at?: string | null
          device?: string | null
          element?: string | null
          event_type?: string | null
          id: string
          metadata?: Json | null
          page?: string | null
          project_id?: string | null
          session_id?: string | null
          user_agent?: string | null
          value?: number | null
        }
        Update: {
          city?: string | null
          country?: string | null
          created_at?: string | null
          device?: string | null
          element?: string | null
          event_type?: string | null
          id?: string
          metadata?: Json | null
          page?: string | null
          project_id?: string | null
          session_id?: string | null
          user_agent?: string | null
          value?: number | null
        }
        Relationships: []
      }
      ap_invoice_lines: {
        Row: {
          amount: number
          cost_center: string | null
          created_at: string | null
          department: string | null
          description: string
          gl_account_id: string | null
          id: string
          invoice_id: string
          line_number: number
          po_line_id: string | null
          project: string | null
          quantity: number | null
          receipt_line_id: string | null
          tax_amount: number | null
          total_amount: number
          unit_price: number
        }
        Insert: {
          amount: number
          cost_center?: string | null
          created_at?: string | null
          department?: string | null
          description: string
          gl_account_id?: string | null
          id?: string
          invoice_id: string
          line_number: number
          po_line_id?: string | null
          project?: string | null
          quantity?: number | null
          receipt_line_id?: string | null
          tax_amount?: number | null
          total_amount: number
          unit_price: number
        }
        Update: {
          amount?: number
          cost_center?: string | null
          created_at?: string | null
          department?: string | null
          description?: string
          gl_account_id?: string | null
          id?: string
          invoice_id?: string
          line_number?: number
          po_line_id?: string | null
          project?: string | null
          quantity?: number | null
          receipt_line_id?: string | null
          tax_amount?: number | null
          total_amount?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "ap_invoice_lines_gl_account_id_fkey"
            columns: ["gl_account_id"]
            isOneToOne: false
            referencedRelation: "gl_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ap_invoice_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "ap_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      ap_invoices: {
        Row: {
          amount_paid: number | null
          approval_status: string | null
          approved_at: string | null
          approved_by: string | null
          attachment_url: string | null
          balance_due: number | null
          cost_center: string | null
          created_at: string | null
          created_by: string | null
          currency: string | null
          department: string | null
          description: string | null
          discount_amount: number | null
          due_date: string
          exchange_rate: number | null
          gl_account_id: string | null
          id: string
          invoice_date: string
          invoice_number: string
          notes: string | null
          po_id: string | null
          project: string | null
          received_date: string | null
          shipping_amount: number | null
          status: string | null
          subtotal: number
          tax_amount: number | null
          tax_rate: number | null
          tenant_id: string | null
          three_way_match_status: string | null
          total_amount: number
          updated_at: string | null
          vendor_id: string
        }
        Insert: {
          amount_paid?: number | null
          approval_status?: string | null
          approved_at?: string | null
          approved_by?: string | null
          attachment_url?: string | null
          balance_due?: number | null
          cost_center?: string | null
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          department?: string | null
          description?: string | null
          discount_amount?: number | null
          due_date: string
          exchange_rate?: number | null
          gl_account_id?: string | null
          id?: string
          invoice_date: string
          invoice_number: string
          notes?: string | null
          po_id?: string | null
          project?: string | null
          received_date?: string | null
          shipping_amount?: number | null
          status?: string | null
          subtotal?: number
          tax_amount?: number | null
          tax_rate?: number | null
          tenant_id?: string | null
          three_way_match_status?: string | null
          total_amount?: number
          updated_at?: string | null
          vendor_id: string
        }
        Update: {
          amount_paid?: number | null
          approval_status?: string | null
          approved_at?: string | null
          approved_by?: string | null
          attachment_url?: string | null
          balance_due?: number | null
          cost_center?: string | null
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          department?: string | null
          description?: string | null
          discount_amount?: number | null
          due_date?: string
          exchange_rate?: number | null
          gl_account_id?: string | null
          id?: string
          invoice_date?: string
          invoice_number?: string
          notes?: string | null
          po_id?: string | null
          project?: string | null
          received_date?: string | null
          shipping_amount?: number | null
          status?: string | null
          subtotal?: number
          tax_amount?: number | null
          tax_rate?: number | null
          tenant_id?: string | null
          three_way_match_status?: string | null
          total_amount?: number
          updated_at?: string | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ap_invoices_gl_account_id_fkey"
            columns: ["gl_account_id"]
            isOneToOne: false
            referencedRelation: "gl_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ap_invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ap_invoices_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "ap_vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      ap_payment_allocations: {
        Row: {
          amount: number
          created_at: string | null
          discount: number | null
          id: string
          invoice_id: string
          payment_id: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          discount?: number | null
          id?: string
          invoice_id: string
          payment_id: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          discount?: number | null
          id?: string
          invoice_id?: string
          payment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ap_payment_allocations_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "ap_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ap_payment_allocations_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "ap_payments"
            referencedColumns: ["id"]
          },
        ]
      }
      ap_payments: {
        Row: {
          amount: number
          approved_by: string | null
          bank_account: string | null
          check_number: string | null
          created_at: string | null
          created_by: string | null
          currency: string | null
          discount_taken: number | null
          exchange_rate: number | null
          id: string
          memo: string | null
          net_amount: number
          payment_date: string
          payment_method: string
          payment_number: string
          reference: string | null
          status: string | null
          tenant_id: string | null
          updated_at: string | null
          vendor_id: string
          withholding_tax: number | null
        }
        Insert: {
          amount: number
          approved_by?: string | null
          bank_account?: string | null
          check_number?: string | null
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          discount_taken?: number | null
          exchange_rate?: number | null
          id?: string
          memo?: string | null
          net_amount: number
          payment_date: string
          payment_method: string
          payment_number: string
          reference?: string | null
          status?: string | null
          tenant_id?: string | null
          updated_at?: string | null
          vendor_id: string
          withholding_tax?: number | null
        }
        Update: {
          amount?: number
          approved_by?: string | null
          bank_account?: string | null
          check_number?: string | null
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          discount_taken?: number | null
          exchange_rate?: number | null
          id?: string
          memo?: string | null
          net_amount?: number
          payment_date?: string
          payment_method?: string
          payment_number?: string
          reference?: string | null
          status?: string | null
          tenant_id?: string | null
          updated_at?: string | null
          vendor_id?: string
          withholding_tax?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ap_payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ap_payments_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "ap_vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      ap_price_history: {
        Row: {
          created_at: string | null
          currency: string | null
          effective_date: string
          id: string
          invoice_id: string | null
          item_code: string | null
          item_description: string
          source: string | null
          tenant_id: string | null
          unit_price: number
          vendor_id: string
        }
        Insert: {
          created_at?: string | null
          currency?: string | null
          effective_date: string
          id?: string
          invoice_id?: string | null
          item_code?: string | null
          item_description: string
          source?: string | null
          tenant_id?: string | null
          unit_price: number
          vendor_id: string
        }
        Update: {
          created_at?: string | null
          currency?: string | null
          effective_date?: string
          id?: string
          invoice_id?: string | null
          item_code?: string | null
          item_description?: string
          source?: string | null
          tenant_id?: string | null
          unit_price?: number
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ap_price_history_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "ap_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ap_price_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ap_price_history_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "ap_vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      ap_vendor_contacts: {
        Row: {
          created_at: string | null
          department: string | null
          email: string | null
          id: string
          is_primary: boolean | null
          mobile: string | null
          name: string
          phone: string | null
          title: string | null
          vendor_id: string
        }
        Insert: {
          created_at?: string | null
          department?: string | null
          email?: string | null
          id?: string
          is_primary?: boolean | null
          mobile?: string | null
          name: string
          phone?: string | null
          title?: string | null
          vendor_id: string
        }
        Update: {
          created_at?: string | null
          department?: string | null
          email?: string | null
          id?: string
          is_primary?: boolean | null
          mobile?: string | null
          name?: string
          phone?: string | null
          title?: string | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ap_vendor_contacts_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "ap_vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      ap_vendors: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          bank_account: string | null
          bank_iban: string | null
          bank_name: string | null
          bank_routing: string | null
          bank_swift: string | null
          category: string | null
          city: string | null
          company_name: string
          company_name_en: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          country: string | null
          created_at: string | null
          credit_limit: number | null
          currency: string | null
          custom_fields: Json | null
          gl_account_id: string | null
          id: string
          is_active: boolean | null
          notes: string | null
          payment_method: string | null
          payment_terms: string | null
          postal_code: string | null
          rating: number | null
          state: string | null
          tags: string[] | null
          tax_id: string | null
          tax_withholding_rate: number | null
          tenant_id: string | null
          updated_at: string | null
          vendor_code: string
          vendor_type: string | null
          website: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          bank_account?: string | null
          bank_iban?: string | null
          bank_name?: string | null
          bank_routing?: string | null
          bank_swift?: string | null
          category?: string | null
          city?: string | null
          company_name: string
          company_name_en?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          country?: string | null
          created_at?: string | null
          credit_limit?: number | null
          currency?: string | null
          custom_fields?: Json | null
          gl_account_id?: string | null
          id?: string
          is_active?: boolean | null
          notes?: string | null
          payment_method?: string | null
          payment_terms?: string | null
          postal_code?: string | null
          rating?: number | null
          state?: string | null
          tags?: string[] | null
          tax_id?: string | null
          tax_withholding_rate?: number | null
          tenant_id?: string | null
          updated_at?: string | null
          vendor_code: string
          vendor_type?: string | null
          website?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          bank_account?: string | null
          bank_iban?: string | null
          bank_name?: string | null
          bank_routing?: string | null
          bank_swift?: string | null
          category?: string | null
          city?: string | null
          company_name?: string
          company_name_en?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          country?: string | null
          created_at?: string | null
          credit_limit?: number | null
          currency?: string | null
          custom_fields?: Json | null
          gl_account_id?: string | null
          id?: string
          is_active?: boolean | null
          notes?: string | null
          payment_method?: string | null
          payment_terms?: string | null
          postal_code?: string | null
          rating?: number | null
          state?: string | null
          tags?: string[] | null
          tax_id?: string | null
          tax_withholding_rate?: number | null
          tenant_id?: string | null
          updated_at?: string | null
          vendor_code?: string
          vendor_type?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ap_vendors_gl_account_id_fkey"
            columns: ["gl_account_id"]
            isOneToOne: false
            referencedRelation: "gl_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ap_vendors_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      api_keys: {
        Row: {
          created_at: string | null
          expires_at: string | null
          id: string
          key_hash: string | null
          key_prefix: string | null
          last_used_at: string | null
          name: string | null
          rate_limit: number | null
          requests_today: number | null
          requests_total: number | null
          scopes: Json | null
          status: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          expires_at?: string | null
          id: string
          key_hash?: string | null
          key_prefix?: string | null
          last_used_at?: string | null
          name?: string | null
          rate_limit?: number | null
          requests_today?: number | null
          requests_total?: number | null
          scopes?: Json | null
          status?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          key_hash?: string | null
          key_prefix?: string | null
          last_used_at?: string | null
          name?: string | null
          rate_limit?: number | null
          requests_today?: number | null
          requests_total?: number | null
          scopes?: Json | null
          status?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      app_generators: {
        Row: {
          category: string | null
          complexity: string | null
          created_at: string | null
          description: string | null
          estimated_time_min: number | null
          features: Json | null
          files_generated: number | null
          icon: string | null
          id: string
          includes_ai: boolean | null
          includes_auth: boolean | null
          includes_db: boolean | null
          includes_payments: boolean | null
          lines_of_code: number | null
          name: string | null
          popularity: number | null
          preview_url: string | null
          slug: string | null
          tech_stack: Json | null
        }
        Insert: {
          category?: string | null
          complexity?: string | null
          created_at?: string | null
          description?: string | null
          estimated_time_min?: number | null
          features?: Json | null
          files_generated?: number | null
          icon?: string | null
          id: string
          includes_ai?: boolean | null
          includes_auth?: boolean | null
          includes_db?: boolean | null
          includes_payments?: boolean | null
          lines_of_code?: number | null
          name?: string | null
          popularity?: number | null
          preview_url?: string | null
          slug?: string | null
          tech_stack?: Json | null
        }
        Update: {
          category?: string | null
          complexity?: string | null
          created_at?: string | null
          description?: string | null
          estimated_time_min?: number | null
          features?: Json | null
          files_generated?: number | null
          icon?: string | null
          id?: string
          includes_ai?: boolean | null
          includes_auth?: boolean | null
          includes_db?: boolean | null
          includes_payments?: boolean | null
          lines_of_code?: number | null
          name?: string | null
          popularity?: number | null
          preview_url?: string | null
          slug?: string | null
          tech_stack?: Json | null
        }
        Relationships: []
      }
      app_menu: {
        Row: {
          created_at: string | null
          icon: string | null
          id: number
          is_active: boolean
          is_visible: boolean | null
          label: string
          label_he: string | null
          order_index: number | null
          parent_id: number | null
          required_permission: string | null
          route: string | null
        }
        Insert: {
          created_at?: string | null
          icon?: string | null
          id?: number
          is_active?: boolean
          is_visible?: boolean | null
          label: string
          label_he?: string | null
          order_index?: number | null
          parent_id?: number | null
          required_permission?: string | null
          route?: string | null
        }
        Update: {
          created_at?: string | null
          icon?: string | null
          id?: number
          is_active?: boolean
          is_visible?: boolean | null
          label?: string
          label_he?: string | null
          order_index?: number | null
          parent_id?: number | null
          required_permission?: string | null
          route?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "app_menu_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "app_menu"
            referencedColumns: ["id"]
          },
        ]
      }
      ar_credit_notes: {
        Row: {
          amount: number
          applied_to_invoice_id: string | null
          created_at: string | null
          created_by: string | null
          credit_date: string
          credit_note_number: string
          customer_id: string
          id: string
          original_invoice_id: string | null
          reason: string
          status: string | null
          tenant_id: string | null
        }
        Insert: {
          amount: number
          applied_to_invoice_id?: string | null
          created_at?: string | null
          created_by?: string | null
          credit_date: string
          credit_note_number: string
          customer_id: string
          id?: string
          original_invoice_id?: string | null
          reason: string
          status?: string | null
          tenant_id?: string | null
        }
        Update: {
          amount?: number
          applied_to_invoice_id?: string | null
          created_at?: string | null
          created_by?: string | null
          credit_date?: string
          credit_note_number?: string
          customer_id?: string
          id?: string
          original_invoice_id?: string | null
          reason?: string
          status?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ar_credit_notes_applied_to_invoice_id_fkey"
            columns: ["applied_to_invoice_id"]
            isOneToOne: false
            referencedRelation: "ar_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ar_credit_notes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "ar_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ar_credit_notes_original_invoice_id_fkey"
            columns: ["original_invoice_id"]
            isOneToOne: false
            referencedRelation: "ar_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ar_credit_notes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ar_customers: {
        Row: {
          billing_address: string | null
          billing_city: string | null
          billing_country: string | null
          billing_postal: string | null
          billing_state: string | null
          company_name: string
          company_name_en: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string | null
          credit_limit: number | null
          currency: string | null
          current_balance: number | null
          custom_fields: Json | null
          customer_code: string
          customer_type: string | null
          gl_account_id: string | null
          id: string
          industry: string | null
          is_active: boolean | null
          notes: string | null
          payment_terms: string | null
          risk_level: string | null
          sales_rep: string | null
          segment: string | null
          shipping_address: string | null
          shipping_city: string | null
          shipping_country: string | null
          shipping_postal: string | null
          shipping_state: string | null
          tags: string[] | null
          tax_id: string | null
          tenant_id: string | null
          territory: string | null
          updated_at: string | null
        }
        Insert: {
          billing_address?: string | null
          billing_city?: string | null
          billing_country?: string | null
          billing_postal?: string | null
          billing_state?: string | null
          company_name: string
          company_name_en?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string | null
          credit_limit?: number | null
          currency?: string | null
          current_balance?: number | null
          custom_fields?: Json | null
          customer_code: string
          customer_type?: string | null
          gl_account_id?: string | null
          id?: string
          industry?: string | null
          is_active?: boolean | null
          notes?: string | null
          payment_terms?: string | null
          risk_level?: string | null
          sales_rep?: string | null
          segment?: string | null
          shipping_address?: string | null
          shipping_city?: string | null
          shipping_country?: string | null
          shipping_postal?: string | null
          shipping_state?: string | null
          tags?: string[] | null
          tax_id?: string | null
          tenant_id?: string | null
          territory?: string | null
          updated_at?: string | null
        }
        Update: {
          billing_address?: string | null
          billing_city?: string | null
          billing_country?: string | null
          billing_postal?: string | null
          billing_state?: string | null
          company_name?: string
          company_name_en?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string | null
          credit_limit?: number | null
          currency?: string | null
          current_balance?: number | null
          custom_fields?: Json | null
          customer_code?: string
          customer_type?: string | null
          gl_account_id?: string | null
          id?: string
          industry?: string | null
          is_active?: boolean | null
          notes?: string | null
          payment_terms?: string | null
          risk_level?: string | null
          sales_rep?: string | null
          segment?: string | null
          shipping_address?: string | null
          shipping_city?: string | null
          shipping_country?: string | null
          shipping_postal?: string | null
          shipping_state?: string | null
          tags?: string[] | null
          tax_id?: string | null
          tenant_id?: string | null
          territory?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ar_customers_gl_account_id_fkey"
            columns: ["gl_account_id"]
            isOneToOne: false
            referencedRelation: "gl_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ar_customers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ar_dunning_rules: {
        Row: {
          action: string
          created_at: string | null
          days_overdue: number
          fee_amount: number | null
          id: string
          interest_rate: number | null
          is_active: boolean | null
          level: number
          template_body: string | null
          template_subject: string | null
          tenant_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          days_overdue: number
          fee_amount?: number | null
          id?: string
          interest_rate?: number | null
          is_active?: boolean | null
          level: number
          template_body?: string | null
          template_subject?: string | null
          tenant_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          days_overdue?: number
          fee_amount?: number | null
          id?: string
          interest_rate?: number | null
          is_active?: boolean | null
          level?: number
          template_body?: string | null
          template_subject?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ar_dunning_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ar_invoice_lines: {
        Row: {
          amount: number
          created_at: string | null
          description: string
          discount_percent: number | null
          gl_account_id: string | null
          id: string
          invoice_id: string
          line_number: number
          product_code: string | null
          quantity: number | null
          tax_amount: number | null
          tax_rate: number | null
          total_amount: number
          unit_of_measure: string | null
          unit_price: number
        }
        Insert: {
          amount: number
          created_at?: string | null
          description: string
          discount_percent?: number | null
          gl_account_id?: string | null
          id?: string
          invoice_id: string
          line_number: number
          product_code?: string | null
          quantity?: number | null
          tax_amount?: number | null
          tax_rate?: number | null
          total_amount: number
          unit_of_measure?: string | null
          unit_price: number
        }
        Update: {
          amount?: number
          created_at?: string | null
          description?: string
          discount_percent?: number | null
          gl_account_id?: string | null
          id?: string
          invoice_id?: string
          line_number?: number
          product_code?: string | null
          quantity?: number | null
          tax_amount?: number | null
          tax_rate?: number | null
          total_amount?: number
          unit_of_measure?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "ar_invoice_lines_gl_account_id_fkey"
            columns: ["gl_account_id"]
            isOneToOne: false
            referencedRelation: "gl_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ar_invoice_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "ar_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      ar_invoices: {
        Row: {
          amount_received: number | null
          balance_due: number | null
          cost_center: string | null
          created_at: string | null
          created_by: string | null
          currency: string | null
          customer_id: string
          department: string | null
          description: string | null
          discount_amount: number | null
          due_date: string
          dunning_level: number | null
          exchange_rate: number | null
          gl_account_id: string | null
          id: string
          invoice_date: string
          invoice_number: string
          last_dunning_date: string | null
          notes: string | null
          paid_at: string | null
          project: string | null
          sales_order_id: string | null
          sent_at: string | null
          status: string | null
          subtotal: number | null
          tax_amount: number | null
          tenant_id: string | null
          terms_text: string | null
          total_amount: number
          updated_at: string | null
          viewed_at: string | null
        }
        Insert: {
          amount_received?: number | null
          balance_due?: number | null
          cost_center?: string | null
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          customer_id: string
          department?: string | null
          description?: string | null
          discount_amount?: number | null
          due_date: string
          dunning_level?: number | null
          exchange_rate?: number | null
          gl_account_id?: string | null
          id?: string
          invoice_date: string
          invoice_number: string
          last_dunning_date?: string | null
          notes?: string | null
          paid_at?: string | null
          project?: string | null
          sales_order_id?: string | null
          sent_at?: string | null
          status?: string | null
          subtotal?: number | null
          tax_amount?: number | null
          tenant_id?: string | null
          terms_text?: string | null
          total_amount?: number
          updated_at?: string | null
          viewed_at?: string | null
        }
        Update: {
          amount_received?: number | null
          balance_due?: number | null
          cost_center?: string | null
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          customer_id?: string
          department?: string | null
          description?: string | null
          discount_amount?: number | null
          due_date?: string
          dunning_level?: number | null
          exchange_rate?: number | null
          gl_account_id?: string | null
          id?: string
          invoice_date?: string
          invoice_number?: string
          last_dunning_date?: string | null
          notes?: string | null
          paid_at?: string | null
          project?: string | null
          sales_order_id?: string | null
          sent_at?: string | null
          status?: string | null
          subtotal?: number | null
          tax_amount?: number | null
          tenant_id?: string | null
          terms_text?: string | null
          total_amount?: number
          updated_at?: string | null
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ar_invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "ar_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ar_invoices_gl_account_id_fkey"
            columns: ["gl_account_id"]
            isOneToOne: false
            referencedRelation: "gl_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ar_invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ar_receipt_allocations: {
        Row: {
          amount: number
          created_at: string | null
          discount: number | null
          id: string
          invoice_id: string
          receipt_id: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          discount?: number | null
          id?: string
          invoice_id: string
          receipt_id: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          discount?: number | null
          id?: string
          invoice_id?: string
          receipt_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ar_receipt_allocations_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "ar_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ar_receipt_allocations_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "ar_receipts"
            referencedColumns: ["id"]
          },
        ]
      }
      ar_receipts: {
        Row: {
          amount: number
          bank_account: string | null
          check_number: string | null
          created_at: string | null
          created_by: string | null
          currency: string | null
          customer_id: string
          id: string
          memo: string | null
          payment_method: string
          receipt_date: string
          receipt_number: string
          reference: string | null
          status: string | null
          tenant_id: string | null
        }
        Insert: {
          amount: number
          bank_account?: string | null
          check_number?: string | null
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          customer_id: string
          id?: string
          memo?: string | null
          payment_method: string
          receipt_date: string
          receipt_number: string
          reference?: string | null
          status?: string | null
          tenant_id?: string | null
        }
        Update: {
          amount?: number
          bank_account?: string | null
          check_number?: string | null
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          customer_id?: string
          id?: string
          memo?: string | null
          payment_method?: string
          receipt_date?: string
          receipt_number?: string
          reference?: string | null
          status?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ar_receipts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "ar_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ar_receipts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      auto_service_items: {
        Row: {
          description: string
          id: string
          quantity: number | null
          service_order_id: string
          service_type: string | null
          status: string | null
          technician: string | null
          total: number | null
          unit_price: number | null
        }
        Insert: {
          description: string
          id?: string
          quantity?: number | null
          service_order_id: string
          service_type?: string | null
          status?: string | null
          technician?: string | null
          total?: number | null
          unit_price?: number | null
        }
        Update: {
          description?: string
          id?: string
          quantity?: number | null
          service_order_id?: string
          service_type?: string | null
          status?: string | null
          technician?: string | null
          total?: number | null
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "auto_service_items_service_order_id_fkey"
            columns: ["service_order_id"]
            isOneToOne: false
            referencedRelation: "auto_service_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      auto_service_orders: {
        Row: {
          actual_cost: number | null
          bay: string | null
          complaint: string | null
          completed_date: string | null
          created_at: string | null
          customer_email: string | null
          customer_name: string | null
          customer_phone: string | null
          diagnosis: string | null
          estimated_cost: number | null
          id: string
          mileage_in: number | null
          order_number: string
          promised_date: string | null
          status: string | null
          technician: string | null
          tenant_id: string | null
          vehicle_id: string | null
          vehicle_info: string | null
        }
        Insert: {
          actual_cost?: number | null
          bay?: string | null
          complaint?: string | null
          completed_date?: string | null
          created_at?: string | null
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          diagnosis?: string | null
          estimated_cost?: number | null
          id?: string
          mileage_in?: number | null
          order_number: string
          promised_date?: string | null
          status?: string | null
          technician?: string | null
          tenant_id?: string | null
          vehicle_id?: string | null
          vehicle_info?: string | null
        }
        Update: {
          actual_cost?: number | null
          bay?: string | null
          complaint?: string | null
          completed_date?: string | null
          created_at?: string | null
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          diagnosis?: string | null
          estimated_cost?: number | null
          id?: string
          mileage_in?: number | null
          order_number?: string
          promised_date?: string | null
          status?: string | null
          technician?: string | null
          tenant_id?: string | null
          vehicle_id?: string | null
          vehicle_info?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "auto_service_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auto_service_orders_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "auto_vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      auto_vehicles: {
        Row: {
          body_type: string | null
          color: string | null
          condition: string | null
          created_at: string | null
          drivetrain: string | null
          engine: string | null
          features: string[] | null
          fuel_type: string | null
          id: string
          interior_color: string | null
          license_plate: string | null
          location: string | null
          make: string
          mileage: number | null
          model: string
          notes: string | null
          owner_id: string | null
          photos: string[] | null
          purchase_price: number | null
          selling_price: number | null
          status: string | null
          stock_number: string | null
          tenant_id: string | null
          transmission: string | null
          trim: string | null
          vin: string | null
          year: number | null
        }
        Insert: {
          body_type?: string | null
          color?: string | null
          condition?: string | null
          created_at?: string | null
          drivetrain?: string | null
          engine?: string | null
          features?: string[] | null
          fuel_type?: string | null
          id?: string
          interior_color?: string | null
          license_plate?: string | null
          location?: string | null
          make: string
          mileage?: number | null
          model: string
          notes?: string | null
          owner_id?: string | null
          photos?: string[] | null
          purchase_price?: number | null
          selling_price?: number | null
          status?: string | null
          stock_number?: string | null
          tenant_id?: string | null
          transmission?: string | null
          trim?: string | null
          vin?: string | null
          year?: number | null
        }
        Update: {
          body_type?: string | null
          color?: string | null
          condition?: string | null
          created_at?: string | null
          drivetrain?: string | null
          engine?: string | null
          features?: string[] | null
          fuel_type?: string | null
          id?: string
          interior_color?: string | null
          license_plate?: string | null
          location?: string | null
          make?: string
          mileage?: number | null
          model?: string
          notes?: string | null
          owner_id?: string | null
          photos?: string[] | null
          purchase_price?: number | null
          selling_price?: number | null
          status?: string | null
          stock_number?: string | null
          tenant_id?: string | null
          transmission?: string | null
          trim?: string | null
          vin?: string | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "auto_vehicles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      backups: {
        Row: {
          created_at: string | null
          download_url: string | null
          expires_at: string | null
          id: string
          includes: Json | null
          project_id: string | null
          size_mb: number | null
          status: string | null
          type: string | null
        }
        Insert: {
          created_at?: string | null
          download_url?: string | null
          expires_at?: string | null
          id: string
          includes?: Json | null
          project_id?: string | null
          size_mb?: number | null
          status?: string | null
          type?: string | null
        }
        Update: {
          created_at?: string | null
          download_url?: string | null
          expires_at?: string | null
          id?: string
          includes?: Json | null
          project_id?: string | null
          size_mb?: number | null
          status?: string | null
          type?: string | null
        }
        Relationships: []
      }
      bank_accounts_master: {
        Row: {
          account_name: string
          account_number: string
          account_type: string | null
          available_balance: number | null
          branch: string | null
          created_at: string | null
          credit_limit: number | null
          currency: string | null
          current_balance: number | null
          customer_id: string | null
          customer_name: string | null
          customer_type: string | null
          id: string
          interest_rate: number | null
          kyc_date: string | null
          kyc_status: string | null
          officer: string | null
          opening_date: string | null
          risk_rating: string | null
          status: string | null
          tenant_id: string | null
        }
        Insert: {
          account_name: string
          account_number: string
          account_type?: string | null
          available_balance?: number | null
          branch?: string | null
          created_at?: string | null
          credit_limit?: number | null
          currency?: string | null
          current_balance?: number | null
          customer_id?: string | null
          customer_name?: string | null
          customer_type?: string | null
          id?: string
          interest_rate?: number | null
          kyc_date?: string | null
          kyc_status?: string | null
          officer?: string | null
          opening_date?: string | null
          risk_rating?: string | null
          status?: string | null
          tenant_id?: string | null
        }
        Update: {
          account_name?: string
          account_number?: string
          account_type?: string | null
          available_balance?: number | null
          branch?: string | null
          created_at?: string | null
          credit_limit?: number | null
          currency?: string | null
          current_balance?: number | null
          customer_id?: string | null
          customer_name?: string | null
          customer_type?: string | null
          id?: string
          interest_rate?: number | null
          kyc_date?: string | null
          kyc_status?: string | null
          officer?: string | null
          opening_date?: string | null
          risk_rating?: string | null
          status?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_accounts_master_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_cards: {
        Row: {
          account_id: string | null
          available_credit: number | null
          card_number_masked: string
          card_type: string | null
          cardholder_name: string
          contactless: boolean | null
          created_at: string | null
          credit_limit: number | null
          current_balance: number | null
          expiry_date: string | null
          id: string
          pin_set: boolean | null
          status: string | null
          tenant_id: string | null
        }
        Insert: {
          account_id?: string | null
          available_credit?: number | null
          card_number_masked: string
          card_type?: string | null
          cardholder_name: string
          contactless?: boolean | null
          created_at?: string | null
          credit_limit?: number | null
          current_balance?: number | null
          expiry_date?: string | null
          id?: string
          pin_set?: boolean | null
          status?: string | null
          tenant_id?: string | null
        }
        Update: {
          account_id?: string | null
          available_credit?: number | null
          card_number_masked?: string
          card_type?: string | null
          cardholder_name?: string
          contactless?: boolean | null
          created_at?: string | null
          credit_limit?: number | null
          current_balance?: number | null
          expiry_date?: string | null
          id?: string
          pin_set?: boolean | null
          status?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_cards_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts_master"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_cards_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_loans: {
        Row: {
          borrower_id: string | null
          borrower_name: string
          collateral: string | null
          collateral_value: number | null
          created_at: string | null
          id: string
          interest_rate: number | null
          loan_number: string
          loan_type: string | null
          maturity_date: string | null
          monthly_payment: number | null
          next_payment_date: string | null
          outstanding_balance: number | null
          payments_made: number | null
          principal: number
          start_date: string | null
          status: string | null
          tenant_id: string | null
          term_months: number | null
        }
        Insert: {
          borrower_id?: string | null
          borrower_name: string
          collateral?: string | null
          collateral_value?: number | null
          created_at?: string | null
          id?: string
          interest_rate?: number | null
          loan_number: string
          loan_type?: string | null
          maturity_date?: string | null
          monthly_payment?: number | null
          next_payment_date?: string | null
          outstanding_balance?: number | null
          payments_made?: number | null
          principal: number
          start_date?: string | null
          status?: string | null
          tenant_id?: string | null
          term_months?: number | null
        }
        Update: {
          borrower_id?: string | null
          borrower_name?: string
          collateral?: string | null
          collateral_value?: number | null
          created_at?: string | null
          id?: string
          interest_rate?: number | null
          loan_number?: string
          loan_type?: string | null
          maturity_date?: string | null
          monthly_payment?: number | null
          next_payment_date?: string | null
          outstanding_balance?: number | null
          payments_made?: number | null
          principal?: number
          start_date?: string | null
          status?: string | null
          tenant_id?: string | null
          term_months?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_loans_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_transactions: {
        Row: {
          account_id: string
          balance_after: number | null
          channel: string | null
          counterparty: string | null
          counterparty_account: string | null
          created_at: string | null
          credit: number | null
          currency: string | null
          debit: number | null
          description: string | null
          id: string
          reference: string | null
          status: string | null
          tenant_id: string | null
          transaction_date: string
          transaction_number: string
          transaction_type: string | null
          value_date: string | null
        }
        Insert: {
          account_id: string
          balance_after?: number | null
          channel?: string | null
          counterparty?: string | null
          counterparty_account?: string | null
          created_at?: string | null
          credit?: number | null
          currency?: string | null
          debit?: number | null
          description?: string | null
          id?: string
          reference?: string | null
          status?: string | null
          tenant_id?: string | null
          transaction_date?: string
          transaction_number: string
          transaction_type?: string | null
          value_date?: string | null
        }
        Update: {
          account_id?: string
          balance_after?: number | null
          channel?: string | null
          counterparty?: string | null
          counterparty_account?: string | null
          created_at?: string | null
          credit?: number | null
          currency?: string | null
          debit?: number | null
          description?: string | null
          id?: string
          reference?: string | null
          status?: string | null
          tenant_id?: string | null
          transaction_date?: string
          transaction_number?: string
          transaction_type?: string | null
          value_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts_master"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      changelog: {
        Row: {
          changes: Json | null
          description: string | null
          id: string
          published: boolean | null
          published_at: string | null
          title: string | null
          type: string | null
          version: string | null
        }
        Insert: {
          changes?: Json | null
          description?: string | null
          id: string
          published?: boolean | null
          published_at?: string | null
          title?: string | null
          type?: string | null
          version?: string | null
        }
        Update: {
          changes?: Json | null
          description?: string | null
          id?: string
          published?: boolean | null
          published_at?: string | null
          title?: string | null
          type?: string | null
          version?: string | null
        }
        Relationships: []
      }
      code_comments: {
        Row: {
          content: string | null
          created_at: string | null
          file_path: string | null
          id: string
          line_number: number | null
          project_id: string | null
          resolved: boolean | null
          thread_id: string | null
          user_id: string | null
        }
        Insert: {
          content?: string | null
          created_at?: string | null
          file_path?: string | null
          id: string
          line_number?: number | null
          project_id?: string | null
          resolved?: boolean | null
          thread_id?: string | null
          user_id?: string | null
        }
        Update: {
          content?: string | null
          created_at?: string | null
          file_path?: string | null
          id?: string
          line_number?: number | null
          project_id?: string | null
          resolved?: boolean | null
          thread_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      code_snippets: {
        Row: {
          code: string | null
          created_at: string | null
          description: string | null
          id: string
          is_public: boolean | null
          language: string | null
          tags: Json | null
          title: string | null
          usage_count: number | null
          user_id: string | null
        }
        Insert: {
          code?: string | null
          created_at?: string | null
          description?: string | null
          id: string
          is_public?: boolean | null
          language?: string | null
          tags?: Json | null
          title?: string | null
          usage_count?: number | null
          user_id?: string | null
        }
        Update: {
          code?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_public?: boolean | null
          language?: string | null
          tags?: Json | null
          title?: string | null
          usage_count?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      collab_sessions: {
        Row: {
          active: boolean | null
          changes_count: number | null
          cursor_positions: Json | null
          file_path: string | null
          id: string
          last_activity: string | null
          participants: Json | null
          project_id: string | null
          started_at: string | null
        }
        Insert: {
          active?: boolean | null
          changes_count?: number | null
          cursor_positions?: Json | null
          file_path?: string | null
          id: string
          last_activity?: string | null
          participants?: Json | null
          project_id?: string | null
          started_at?: string | null
        }
        Update: {
          active?: boolean | null
          changes_count?: number | null
          cursor_positions?: Json | null
          file_path?: string | null
          id?: string
          last_activity?: string | null
          participants?: Json | null
          project_id?: string | null
          started_at?: string | null
        }
        Relationships: []
      }
      compliance_certs: {
        Row: {
          cert_type: string | null
          created_at: string | null
          findings: Json | null
          id: string
          last_audit_at: string | null
          next_audit_at: string | null
          project_id: string | null
          remediation_plan: Json | null
          score: number | null
          status: string | null
        }
        Insert: {
          cert_type?: string | null
          created_at?: string | null
          findings?: Json | null
          id: string
          last_audit_at?: string | null
          next_audit_at?: string | null
          project_id?: string | null
          remediation_plan?: Json | null
          score?: number | null
          status?: string | null
        }
        Update: {
          cert_type?: string | null
          created_at?: string | null
          findings?: Json | null
          id?: string
          last_audit_at?: string | null
          next_audit_at?: string | null
          project_id?: string | null
          remediation_plan?: Json | null
          score?: number | null
          status?: string | null
        }
        Relationships: []
      }
      conversion_funnels: {
        Row: {
          conversion_rate: number | null
          created_at: string | null
          id: string
          name: string | null
          period: string | null
          steps: Json | null
          total_converted: number | null
          total_entered: number | null
        }
        Insert: {
          conversion_rate?: number | null
          created_at?: string | null
          id: string
          name?: string | null
          period?: string | null
          steps?: Json | null
          total_converted?: number | null
          total_entered?: number | null
        }
        Update: {
          conversion_rate?: number | null
          created_at?: string | null
          id?: string
          name?: string | null
          period?: string | null
          steps?: Json | null
          total_converted?: number | null
          total_entered?: number | null
        }
        Relationships: []
      }
      crm_activities: {
        Row: {
          activity_type: string
          company_id: string | null
          completed_at: string | null
          contact_id: string | null
          created_at: string | null
          deal_id: string | null
          description: string | null
          due_date: string | null
          duration_minutes: number | null
          id: string
          outcome: string | null
          owner_id: string | null
          status: string | null
          subject: string
          tenant_id: string | null
        }
        Insert: {
          activity_type: string
          company_id?: string | null
          completed_at?: string | null
          contact_id?: string | null
          created_at?: string | null
          deal_id?: string | null
          description?: string | null
          due_date?: string | null
          duration_minutes?: number | null
          id?: string
          outcome?: string | null
          owner_id?: string | null
          status?: string | null
          subject: string
          tenant_id?: string | null
        }
        Update: {
          activity_type?: string
          company_id?: string | null
          completed_at?: string | null
          contact_id?: string | null
          created_at?: string | null
          deal_id?: string | null
          description?: string | null
          due_date?: string | null
          duration_minutes?: number | null
          id?: string
          outcome?: string | null
          owner_id?: string | null
          status?: string | null
          subject?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_activities_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "crm_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_activities_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_activities_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "crm_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_activities_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_companies: {
        Row: {
          address: string | null
          annual_revenue: number | null
          city: string | null
          company_name: string
          country: string | null
          created_at: string | null
          custom_fields: Json | null
          domain: string | null
          employee_count: number | null
          id: string
          industry: string | null
          owner_id: string | null
          phone: string | null
          size: string | null
          tags: string[] | null
          tenant_id: string | null
          website: string | null
        }
        Insert: {
          address?: string | null
          annual_revenue?: number | null
          city?: string | null
          company_name: string
          country?: string | null
          created_at?: string | null
          custom_fields?: Json | null
          domain?: string | null
          employee_count?: number | null
          id?: string
          industry?: string | null
          owner_id?: string | null
          phone?: string | null
          size?: string | null
          tags?: string[] | null
          tenant_id?: string | null
          website?: string | null
        }
        Update: {
          address?: string | null
          annual_revenue?: number | null
          city?: string | null
          company_name?: string
          country?: string | null
          created_at?: string | null
          custom_fields?: Json | null
          domain?: string | null
          employee_count?: number | null
          id?: string
          industry?: string | null
          owner_id?: string | null
          phone?: string | null
          size?: string | null
          tags?: string[] | null
          tenant_id?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_companies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_contacts: {
        Row: {
          address: string | null
          city: string | null
          company: string | null
          country: string | null
          created_at: string | null
          custom_fields: Json | null
          email: string | null
          first_name: string
          id: string
          industry: string | null
          job_title: string | null
          last_activity_at: string | null
          last_name: string
          lifecycle_stage: string | null
          mobile: string | null
          owner_id: string | null
          phone: string | null
          score: number | null
          source: string | null
          state: string | null
          tags: string[] | null
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          company?: string | null
          country?: string | null
          created_at?: string | null
          custom_fields?: Json | null
          email?: string | null
          first_name: string
          id?: string
          industry?: string | null
          job_title?: string | null
          last_activity_at?: string | null
          last_name: string
          lifecycle_stage?: string | null
          mobile?: string | null
          owner_id?: string | null
          phone?: string | null
          score?: number | null
          source?: string | null
          state?: string | null
          tags?: string[] | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          company?: string | null
          country?: string | null
          created_at?: string | null
          custom_fields?: Json | null
          email?: string | null
          first_name?: string
          id?: string
          industry?: string | null
          job_title?: string | null
          last_activity_at?: string | null
          last_name?: string
          lifecycle_stage?: string | null
          mobile?: string | null
          owner_id?: string | null
          phone?: string | null
          score?: number | null
          source?: string | null
          state?: string | null
          tags?: string[] | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_contacts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_deals: {
        Row: {
          actual_close: string | null
          amount: number | null
          company_id: string | null
          contact_id: string | null
          created_at: string | null
          currency: string | null
          custom_fields: Json | null
          deal_name: string
          expected_close: string | null
          id: string
          lost_reason: string | null
          notes: string | null
          owner_id: string | null
          pipeline: string | null
          probability: number | null
          source: string | null
          stage: string | null
          tags: string[] | null
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          actual_close?: string | null
          amount?: number | null
          company_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          currency?: string | null
          custom_fields?: Json | null
          deal_name: string
          expected_close?: string | null
          id?: string
          lost_reason?: string | null
          notes?: string | null
          owner_id?: string | null
          pipeline?: string | null
          probability?: number | null
          source?: string | null
          stage?: string | null
          tags?: string[] | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          actual_close?: string | null
          amount?: number | null
          company_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          currency?: string | null
          custom_fields?: Json | null
          deal_name?: string
          expected_close?: string | null
          id?: string
          lost_reason?: string | null
          notes?: string | null
          owner_id?: string | null
          pipeline?: string | null
          probability?: number | null
          source?: string | null
          stage?: string | null
          tags?: string[] | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_deals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "crm_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_deals_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_deals_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_pipelines: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          is_default: boolean | null
          pipeline_name: string
          stages: Json
          tenant_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          pipeline_name: string
          stages: Json
          tenant_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          pipeline_name?: string
          stages?: Json
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_pipelines_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_domains: {
        Row: {
          cdn_enabled: boolean | null
          created_at: string | null
          dns_verified: boolean | null
          domain: string | null
          id: string
          project_id: string | null
          region: string | null
          ssl_status: string | null
        }
        Insert: {
          cdn_enabled?: boolean | null
          created_at?: string | null
          dns_verified?: boolean | null
          domain?: string | null
          id: string
          project_id?: string | null
          region?: string | null
          ssl_status?: string | null
        }
        Update: {
          cdn_enabled?: boolean | null
          created_at?: string | null
          dns_verified?: boolean | null
          domain?: string | null
          id?: string
          project_id?: string | null
          region?: string | null
          ssl_status?: string | null
        }
        Relationships: []
      }
      customers: {
        Row: {
          address: string | null
          city: string | null
          created_at: string | null
          created_by: string | null
          email: string | null
          id: number
          id_number: string | null
          name: string
          notes: string | null
          phone: string | null
          tags: string[] | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          id?: number
          id_number?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          tags?: string[] | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          id?: number
          id_number?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          tags?: string[] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_usage: {
        Row: {
          active_sessions: number | null
          ai_tokens_used: number | null
          api_calls: number | null
          bandwidth_mb: number | null
          builds: number | null
          created_at: string | null
          date: string | null
          deploys: number | null
          id: string
          storage_mb: number | null
          user_id: string | null
        }
        Insert: {
          active_sessions?: number | null
          ai_tokens_used?: number | null
          api_calls?: number | null
          bandwidth_mb?: number | null
          builds?: number | null
          created_at?: string | null
          date?: string | null
          deploys?: number | null
          id: string
          storage_mb?: number | null
          user_id?: string | null
        }
        Update: {
          active_sessions?: number | null
          ai_tokens_used?: number | null
          api_calls?: number | null
          bandwidth_mb?: number | null
          builds?: number | null
          created_at?: string | null
          date?: string | null
          deploys?: number | null
          id?: string
          storage_mb?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      dashboard_layouts: {
        Row: {
          created_at: string | null
          id: string
          is_default: boolean | null
          name: string | null
          user_id: string | null
          widgets: Json | null
        }
        Insert: {
          created_at?: string | null
          id: string
          is_default?: boolean | null
          name?: string | null
          user_id?: string | null
          widgets?: Json | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          name?: string | null
          user_id?: string | null
          widgets?: Json | null
        }
        Relationships: []
      }
      deploy_environments: {
        Row: {
          auto_deploy: boolean | null
          branch: string | null
          created_at: string | null
          env_vars_count: number | null
          id: string
          last_deploy_at: string | null
          name: string | null
          project_id: string | null
          status: string | null
          url: string | null
        }
        Insert: {
          auto_deploy?: boolean | null
          branch?: string | null
          created_at?: string | null
          env_vars_count?: number | null
          id: string
          last_deploy_at?: string | null
          name?: string | null
          project_id?: string | null
          status?: string | null
          url?: string | null
        }
        Update: {
          auto_deploy?: boolean | null
          branch?: string | null
          created_at?: string | null
          env_vars_count?: number | null
          id?: string
          last_deploy_at?: string | null
          name?: string | null
          project_id?: string | null
          status?: string | null
          url?: string | null
        }
        Relationships: []
      }
      deploy_pipelines: {
        Row: {
          completed_at: string | null
          created_at: string | null
          current_stage: number | null
          duration_sec: number | null
          environment: string | null
          id: string
          logs: Json | null
          name: string | null
          project_id: string | null
          region_code: string | null
          stages: Json | null
          started_at: string | null
          status: string | null
          trigger_type: string | null
          triggered_by: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          current_stage?: number | null
          duration_sec?: number | null
          environment?: string | null
          id: string
          logs?: Json | null
          name?: string | null
          project_id?: string | null
          region_code?: string | null
          stages?: Json | null
          started_at?: string | null
          status?: string | null
          trigger_type?: string | null
          triggered_by?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          current_stage?: number | null
          duration_sec?: number | null
          environment?: string | null
          id?: string
          logs?: Json | null
          name?: string | null
          project_id?: string | null
          region_code?: string | null
          stages?: Json | null
          started_at?: string | null
          status?: string | null
          trigger_type?: string | null
          triggered_by?: string | null
        }
        Relationships: []
      }
      ecom_carts: {
        Row: {
          abandoned_email_sent: boolean | null
          created_at: string | null
          currency: string | null
          customer_email: string | null
          id: string
          items: Json
          session_id: string | null
          subtotal: number | null
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          abandoned_email_sent?: boolean | null
          created_at?: string | null
          currency?: string | null
          customer_email?: string | null
          id?: string
          items?: Json
          session_id?: string | null
          subtotal?: number | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          abandoned_email_sent?: boolean | null
          created_at?: string | null
          currency?: string | null
          customer_email?: string | null
          id?: string
          items?: Json
          session_id?: string | null
          subtotal?: number | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ecom_carts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ecom_coupons: {
        Row: {
          code: string
          discount_type: string | null
          discount_value: number | null
          end_date: string | null
          id: string
          is_active: boolean | null
          max_uses: number | null
          min_order: number | null
          name: string | null
          start_date: string | null
          tenant_id: string | null
          times_used: number | null
        }
        Insert: {
          code: string
          discount_type?: string | null
          discount_value?: number | null
          end_date?: string | null
          id?: string
          is_active?: boolean | null
          max_uses?: number | null
          min_order?: number | null
          name?: string | null
          start_date?: string | null
          tenant_id?: string | null
          times_used?: number | null
        }
        Update: {
          code?: string
          discount_type?: string | null
          discount_value?: number | null
          end_date?: string | null
          id?: string
          is_active?: boolean | null
          max_uses?: number | null
          min_order?: number | null
          name?: string | null
          start_date?: string | null
          tenant_id?: string | null
          times_used?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ecom_coupons_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ecom_order_items: {
        Row: {
          discount: number | null
          fulfillment_status: string | null
          id: string
          order_id: string
          product_id: string | null
          product_name: string
          quantity: number
          sku: string | null
          total: number
          unit_price: number
          variant: string | null
        }
        Insert: {
          discount?: number | null
          fulfillment_status?: string | null
          id?: string
          order_id: string
          product_id?: string | null
          product_name: string
          quantity: number
          sku?: string | null
          total: number
          unit_price: number
          variant?: string | null
        }
        Update: {
          discount?: number | null
          fulfillment_status?: string | null
          id?: string
          order_id?: string
          product_id?: string | null
          product_name?: string
          quantity?: number
          sku?: string | null
          total?: number
          unit_price?: number
          variant?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ecom_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "ecom_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ecom_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "ecom_products"
            referencedColumns: ["id"]
          },
        ]
      }
      ecom_orders: {
        Row: {
          billing_address: Json | null
          created_at: string | null
          currency: string | null
          customer_email: string | null
          customer_name: string | null
          discount: number | null
          fulfillment_status: string | null
          id: string
          notes: string | null
          order_number: string
          payment_method: string | null
          payment_reference: string | null
          payment_status: string | null
          shipping_address: Json | null
          shipping_cost: number | null
          shipping_method: string | null
          source: string | null
          status: string | null
          subtotal: number | null
          tags: string[] | null
          tax: number | null
          tenant_id: string | null
          total: number
          tracking_number: string | null
          tracking_url: string | null
        }
        Insert: {
          billing_address?: Json | null
          created_at?: string | null
          currency?: string | null
          customer_email?: string | null
          customer_name?: string | null
          discount?: number | null
          fulfillment_status?: string | null
          id?: string
          notes?: string | null
          order_number: string
          payment_method?: string | null
          payment_reference?: string | null
          payment_status?: string | null
          shipping_address?: Json | null
          shipping_cost?: number | null
          shipping_method?: string | null
          source?: string | null
          status?: string | null
          subtotal?: number | null
          tags?: string[] | null
          tax?: number | null
          tenant_id?: string | null
          total: number
          tracking_number?: string | null
          tracking_url?: string | null
        }
        Update: {
          billing_address?: Json | null
          created_at?: string | null
          currency?: string | null
          customer_email?: string | null
          customer_name?: string | null
          discount?: number | null
          fulfillment_status?: string | null
          id?: string
          notes?: string | null
          order_number?: string
          payment_method?: string | null
          payment_reference?: string | null
          payment_status?: string | null
          shipping_address?: Json | null
          shipping_cost?: number | null
          shipping_method?: string | null
          source?: string | null
          status?: string | null
          subtotal?: number | null
          tags?: string[] | null
          tax?: number | null
          tenant_id?: string | null
          total?: number
          tracking_number?: string | null
          tracking_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ecom_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ecom_products: {
        Row: {
          allow_backorder: boolean | null
          attributes: Json | null
          brand: string | null
          category: string | null
          compare_at_price: number | null
          cost: number | null
          created_at: string | null
          description: string | null
          dimensions: string | null
          download_url: string | null
          id: string
          images: string[] | null
          is_digital: boolean | null
          margin_percent: number | null
          price: number
          product_name: string
          seo_description: string | null
          seo_title: string | null
          short_description: string | null
          sku: string
          slug: string | null
          status: string | null
          stock_quantity: number | null
          subcategory: string | null
          tags: string[] | null
          tenant_id: string | null
          track_inventory: boolean | null
          variants: Json | null
          weight: number | null
        }
        Insert: {
          allow_backorder?: boolean | null
          attributes?: Json | null
          brand?: string | null
          category?: string | null
          compare_at_price?: number | null
          cost?: number | null
          created_at?: string | null
          description?: string | null
          dimensions?: string | null
          download_url?: string | null
          id?: string
          images?: string[] | null
          is_digital?: boolean | null
          margin_percent?: number | null
          price: number
          product_name: string
          seo_description?: string | null
          seo_title?: string | null
          short_description?: string | null
          sku: string
          slug?: string | null
          status?: string | null
          stock_quantity?: number | null
          subcategory?: string | null
          tags?: string[] | null
          tenant_id?: string | null
          track_inventory?: boolean | null
          variants?: Json | null
          weight?: number | null
        }
        Update: {
          allow_backorder?: boolean | null
          attributes?: Json | null
          brand?: string | null
          category?: string | null
          compare_at_price?: number | null
          cost?: number | null
          created_at?: string | null
          description?: string | null
          dimensions?: string | null
          download_url?: string | null
          id?: string
          images?: string[] | null
          is_digital?: boolean | null
          margin_percent?: number | null
          price?: number
          product_name?: string
          seo_description?: string | null
          seo_title?: string | null
          short_description?: string | null
          sku?: string
          slug?: string | null
          status?: string | null
          stock_quantity?: number | null
          subcategory?: string | null
          tags?: string[] | null
          tenant_id?: string | null
          track_inventory?: boolean | null
          variants?: Json | null
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ecom_products_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ecom_reviews: {
        Row: {
          created_at: string | null
          customer_email: string | null
          customer_name: string | null
          helpful_count: number | null
          id: string
          is_approved: boolean | null
          is_verified: boolean | null
          photos: string[] | null
          product_id: string
          rating: number | null
          review_text: string | null
          title: string | null
        }
        Insert: {
          created_at?: string | null
          customer_email?: string | null
          customer_name?: string | null
          helpful_count?: number | null
          id?: string
          is_approved?: boolean | null
          is_verified?: boolean | null
          photos?: string[] | null
          product_id: string
          rating?: number | null
          review_text?: string | null
          title?: string | null
        }
        Update: {
          created_at?: string | null
          customer_email?: string | null
          customer_name?: string | null
          helpful_count?: number | null
          id?: string
          is_approved?: boolean | null
          is_verified?: boolean | null
          photos?: string[] | null
          product_id?: string
          rating?: number | null
          review_text?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ecom_reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "ecom_products"
            referencedColumns: ["id"]
          },
        ]
      }
      ecom_stores: {
        Row: {
          created_at: string | null
          currency: string | null
          id: string
          language: string | null
          logo_url: string | null
          settings: Json | null
          status: string | null
          store_name: string
          store_url: string | null
          tenant_id: string | null
          theme: Json | null
          timezone: string | null
        }
        Insert: {
          created_at?: string | null
          currency?: string | null
          id?: string
          language?: string | null
          logo_url?: string | null
          settings?: Json | null
          status?: string | null
          store_name: string
          store_url?: string | null
          tenant_id?: string | null
          theme?: Json | null
          timezone?: string | null
        }
        Update: {
          created_at?: string | null
          currency?: string | null
          id?: string
          language?: string | null
          logo_url?: string | null
          settings?: Json | null
          status?: string | null
          store_name?: string
          store_url?: string | null
          tenant_id?: string | null
          theme?: Json | null
          timezone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ecom_stores_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      edu_assignments: {
        Row: {
          assignment_type: string | null
          course_id: string
          created_at: string | null
          description: string | null
          due_date: string | null
          id: string
          is_published: boolean | null
          max_score: number | null
          title: string
          weight: number | null
        }
        Insert: {
          assignment_type?: string | null
          course_id: string
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          is_published?: boolean | null
          max_score?: number | null
          title: string
          weight?: number | null
        }
        Update: {
          assignment_type?: string | null
          course_id?: string
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          is_published?: boolean | null
          max_score?: number | null
          title?: string
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "edu_assignments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "edu_courses"
            referencedColumns: ["id"]
          },
        ]
      }
      edu_courses: {
        Row: {
          course_code: string
          course_name: string
          created_at: string | null
          credits: number | null
          department: string | null
          description: string | null
          end_date: string | null
          id: string
          instructor_id: string | null
          is_active: boolean | null
          max_students: number | null
          room: string | null
          schedule: Json | null
          start_date: string | null
          tenant_id: string | null
        }
        Insert: {
          course_code: string
          course_name: string
          created_at?: string | null
          credits?: number | null
          department?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          instructor_id?: string | null
          is_active?: boolean | null
          max_students?: number | null
          room?: string | null
          schedule?: Json | null
          start_date?: string | null
          tenant_id?: string | null
        }
        Update: {
          course_code?: string
          course_name?: string
          created_at?: string | null
          credits?: number | null
          department?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          instructor_id?: string | null
          is_active?: boolean | null
          max_students?: number | null
          room?: string | null
          schedule?: Json | null
          start_date?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "edu_courses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      edu_enrollments: {
        Row: {
          attendance_percent: number | null
          course_id: string
          enrollment_date: string | null
          final_grade: string | null
          grade_points: number | null
          id: string
          status: string | null
          student_id: string
        }
        Insert: {
          attendance_percent?: number | null
          course_id: string
          enrollment_date?: string | null
          final_grade?: string | null
          grade_points?: number | null
          id?: string
          status?: string | null
          student_id: string
        }
        Update: {
          attendance_percent?: number | null
          course_id?: string
          enrollment_date?: string | null
          final_grade?: string | null
          grade_points?: number | null
          id?: string
          status?: string | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "edu_enrollments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "edu_courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "edu_enrollments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "edu_students"
            referencedColumns: ["id"]
          },
        ]
      }
      edu_institutions: {
        Row: {
          accreditation: string | null
          address: string | null
          city: string | null
          country: string | null
          created_at: string | null
          email: string | null
          id: string
          institution_name: string
          institution_type: string | null
          phone: string | null
          principal: string | null
          tenant_id: string | null
          website: string | null
        }
        Insert: {
          accreditation?: string | null
          address?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          institution_name: string
          institution_type?: string | null
          phone?: string | null
          principal?: string | null
          tenant_id?: string | null
          website?: string | null
        }
        Update: {
          accreditation?: string | null
          address?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          institution_name?: string
          institution_type?: string | null
          phone?: string | null
          principal?: string | null
          tenant_id?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "edu_institutions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      edu_students: {
        Row: {
          address: string | null
          allergies: string[] | null
          city: string | null
          class_name: string | null
          country: string | null
          created_at: string | null
          date_of_birth: string | null
          email: string | null
          enrollment_date: string | null
          first_name: string
          gender: string | null
          grade_level: string | null
          id: string
          last_name: string
          medical_notes: string | null
          parent_email: string | null
          parent_name: string | null
          parent_phone: string | null
          phone: string | null
          photo_url: string | null
          status: string | null
          student_number: string
          tenant_id: string | null
        }
        Insert: {
          address?: string | null
          allergies?: string[] | null
          city?: string | null
          class_name?: string | null
          country?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          email?: string | null
          enrollment_date?: string | null
          first_name: string
          gender?: string | null
          grade_level?: string | null
          id?: string
          last_name: string
          medical_notes?: string | null
          parent_email?: string | null
          parent_name?: string | null
          parent_phone?: string | null
          phone?: string | null
          photo_url?: string | null
          status?: string | null
          student_number: string
          tenant_id?: string | null
        }
        Update: {
          address?: string | null
          allergies?: string[] | null
          city?: string | null
          class_name?: string | null
          country?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          email?: string | null
          enrollment_date?: string | null
          first_name?: string
          gender?: string | null
          grade_level?: string | null
          id?: string
          last_name?: string
          medical_notes?: string | null
          parent_email?: string | null
          parent_name?: string | null
          parent_phone?: string | null
          phone?: string | null
          photo_url?: string | null
          status?: string | null
          student_number?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "edu_students_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      edu_submissions: {
        Row: {
          assignment_id: string
          feedback: string | null
          file_url: string | null
          id: string
          score: number | null
          status: string | null
          student_id: string
          submitted_at: string | null
        }
        Insert: {
          assignment_id: string
          feedback?: string | null
          file_url?: string | null
          id?: string
          score?: number | null
          status?: string | null
          student_id: string
          submitted_at?: string | null
        }
        Update: {
          assignment_id?: string
          feedback?: string | null
          file_url?: string | null
          id?: string
          score?: number | null
          status?: string | null
          student_id?: string
          submitted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "edu_submissions_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "edu_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "edu_submissions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "edu_students"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          active: boolean | null
          body_html: string | null
          created_at: string | null
          id: string
          name: string | null
          sent_count: number | null
          subject: string | null
          trigger_event: string | null
          variables: Json | null
        }
        Insert: {
          active?: boolean | null
          body_html?: string | null
          created_at?: string | null
          id: string
          name?: string | null
          sent_count?: number | null
          subject?: string | null
          trigger_event?: string | null
          variables?: Json | null
        }
        Update: {
          active?: boolean | null
          body_html?: string | null
          created_at?: string | null
          id?: string
          name?: string | null
          sent_count?: number | null
          subject?: string | null
          trigger_event?: string | null
          variables?: Json | null
        }
        Relationships: []
      }
      employees: {
        Row: {
          created_at: string | null
          full_name: string
          hire_date: string | null
          hourly_rate: number | null
          id: number
          id_number: string | null
          is_active: boolean | null
          notes: string | null
          phone: string | null
          role: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          full_name: string
          hire_date?: string | null
          hourly_rate?: number | null
          id?: number
          id_number?: string | null
          is_active?: boolean | null
          notes?: string | null
          phone?: string | null
          role?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          full_name?: string
          hire_date?: string | null
          hourly_rate?: number | null
          id?: number
          id_number?: string | null
          is_active?: boolean | null
          notes?: string | null
          phone?: string | null
          role?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      end_users: {
        Row: {
          acquisition_campaign: string | null
          acquisition_source: string | null
          avatar_url: string | null
          city: string | null
          country: string | null
          created_at: string | null
          date_of_birth: string | null
          display_name: string | null
          email: string | null
          external_id: string | null
          first_name: string | null
          first_seen_at: string | null
          full_name: string | null
          id: string
          language: string | null
          last_login: string | null
          last_name: string | null
          last_seen_at: string | null
          lifetime_value: number | null
          loyalty_points: number | null
          loyalty_tier: string | null
          metadata: Json | null
          org_id: string | null
          phone: string | null
          segments: string[] | null
          settings: Json | null
          status: string | null
          tags: string[] | null
          total_orders: number | null
          total_spent: number | null
          updated_at: string | null
        }
        Insert: {
          acquisition_campaign?: string | null
          acquisition_source?: string | null
          avatar_url?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          display_name?: string | null
          email?: string | null
          external_id?: string | null
          first_name?: string | null
          first_seen_at?: string | null
          full_name?: string | null
          id?: string
          language?: string | null
          last_login?: string | null
          last_name?: string | null
          last_seen_at?: string | null
          lifetime_value?: number | null
          loyalty_points?: number | null
          loyalty_tier?: string | null
          metadata?: Json | null
          org_id?: string | null
          phone?: string | null
          segments?: string[] | null
          settings?: Json | null
          status?: string | null
          tags?: string[] | null
          total_orders?: number | null
          total_spent?: number | null
          updated_at?: string | null
        }
        Update: {
          acquisition_campaign?: string | null
          acquisition_source?: string | null
          avatar_url?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          display_name?: string | null
          email?: string | null
          external_id?: string | null
          first_name?: string | null
          first_seen_at?: string | null
          full_name?: string | null
          id?: string
          language?: string | null
          last_login?: string | null
          last_name?: string | null
          last_seen_at?: string | null
          lifetime_value?: number | null
          loyalty_points?: number | null
          loyalty_tier?: string | null
          metadata?: Json | null
          org_id?: string | null
          phone?: string | null
          segments?: string[] | null
          settings?: Json | null
          status?: string | null
          tags?: string[] | null
          total_orders?: number | null
          total_spent?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "end_users_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "platform_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      energy_bills: {
        Row: {
          bill_number: string
          billing_period_end: string | null
          billing_period_start: string | null
          consumption: number | null
          created_at: string | null
          demand_charge: number | null
          due_date: string | null
          energy_charge: number | null
          id: string
          meter_id: string | null
          paid_date: string | null
          rate: number | null
          status: string | null
          taxes: number | null
          tenant_id: string | null
          total_amount: number | null
        }
        Insert: {
          bill_number: string
          billing_period_end?: string | null
          billing_period_start?: string | null
          consumption?: number | null
          created_at?: string | null
          demand_charge?: number | null
          due_date?: string | null
          energy_charge?: number | null
          id?: string
          meter_id?: string | null
          paid_date?: string | null
          rate?: number | null
          status?: string | null
          taxes?: number | null
          tenant_id?: string | null
          total_amount?: number | null
        }
        Update: {
          bill_number?: string
          billing_period_end?: string | null
          billing_period_start?: string | null
          consumption?: number | null
          created_at?: string | null
          demand_charge?: number | null
          due_date?: string | null
          energy_charge?: number | null
          id?: string
          meter_id?: string | null
          paid_date?: string | null
          rate?: number | null
          status?: string | null
          taxes?: number | null
          tenant_id?: string | null
          total_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "energy_bills_meter_id_fkey"
            columns: ["meter_id"]
            isOneToOne: false
            referencedRelation: "energy_meters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "energy_bills_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      energy_meters: {
        Row: {
          address: string | null
          city: string | null
          country: string | null
          created_at: string | null
          customer_account: string | null
          customer_name: string | null
          id: string
          is_smart: boolean | null
          last_reading: number | null
          last_reading_date: string | null
          meter_number: string
          meter_type: string | null
          site_id: string | null
          status: string | null
          tariff_plan: string | null
          tenant_id: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          customer_account?: string | null
          customer_name?: string | null
          id?: string
          is_smart?: boolean | null
          last_reading?: number | null
          last_reading_date?: string | null
          meter_number: string
          meter_type?: string | null
          site_id?: string | null
          status?: string | null
          tariff_plan?: string | null
          tenant_id?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          customer_account?: string | null
          customer_name?: string | null
          id?: string
          is_smart?: boolean | null
          last_reading?: number | null
          last_reading_date?: string | null
          meter_number?: string
          meter_type?: string | null
          site_id?: string | null
          status?: string | null
          tariff_plan?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "energy_meters_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "energy_sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "energy_meters_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      energy_readings: {
        Row: {
          consumption: number | null
          id: string
          meter_id: string
          peak_demand: number | null
          reading_date: string
          reading_type: string | null
          reading_value: number | null
          unit: string | null
        }
        Insert: {
          consumption?: number | null
          id?: string
          meter_id: string
          peak_demand?: number | null
          reading_date: string
          reading_type?: string | null
          reading_value?: number | null
          unit?: string | null
        }
        Update: {
          consumption?: number | null
          id?: string
          meter_id?: string
          peak_demand?: number | null
          reading_date?: string
          reading_type?: string | null
          reading_value?: number | null
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "energy_readings_meter_id_fkey"
            columns: ["meter_id"]
            isOneToOne: false
            referencedRelation: "energy_meters"
            referencedColumns: ["id"]
          },
        ]
      }
      energy_sites: {
        Row: {
          address: string | null
          annual_output_kwh: number | null
          capacity_kw: number | null
          city: string | null
          commissioning_date: string | null
          country: string | null
          created_at: string | null
          id: string
          latitude: number | null
          longitude: number | null
          operator: string | null
          owner: string | null
          site_name: string
          site_type: string | null
          status: string | null
          tenant_id: string | null
        }
        Insert: {
          address?: string | null
          annual_output_kwh?: number | null
          capacity_kw?: number | null
          city?: string | null
          commissioning_date?: string | null
          country?: string | null
          created_at?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          operator?: string | null
          owner?: string | null
          site_name: string
          site_type?: string | null
          status?: string | null
          tenant_id?: string | null
        }
        Update: {
          address?: string | null
          annual_output_kwh?: number | null
          capacity_kw?: number | null
          city?: string | null
          commissioning_date?: string | null
          country?: string | null
          created_at?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          operator?: string | null
          owner?: string | null
          site_name?: string
          site_type?: string | null
          status?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "energy_sites_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      env_variables: {
        Row: {
          created_at: string | null
          environment: string | null
          id: string
          is_secret: boolean | null
          key: string | null
          project_id: string | null
          value_encrypted: string | null
        }
        Insert: {
          created_at?: string | null
          environment?: string | null
          id: string
          is_secret?: boolean | null
          key?: string | null
          project_id?: string | null
          value_encrypted?: string | null
        }
        Update: {
          created_at?: string | null
          environment?: string | null
          id?: string
          is_secret?: boolean | null
          key?: string | null
          project_id?: string | null
          value_encrypted?: string | null
        }
        Relationships: []
      }
      error_tracking: {
        Row: {
          affected_users: number | null
          ai_suggested_fix: string | null
          assigned_to: string | null
          error_type: string | null
          file_path: string | null
          first_seen_at: string | null
          id: string
          last_seen_at: string | null
          line_number: number | null
          message: string | null
          occurrences: number | null
          project_id: string | null
          resolved_at: string | null
          severity: string | null
          stack_trace: string | null
          status: string | null
        }
        Insert: {
          affected_users?: number | null
          ai_suggested_fix?: string | null
          assigned_to?: string | null
          error_type?: string | null
          file_path?: string | null
          first_seen_at?: string | null
          id: string
          last_seen_at?: string | null
          line_number?: number | null
          message?: string | null
          occurrences?: number | null
          project_id?: string | null
          resolved_at?: string | null
          severity?: string | null
          stack_trace?: string | null
          status?: string | null
        }
        Update: {
          affected_users?: number | null
          ai_suggested_fix?: string | null
          assigned_to?: string | null
          error_type?: string | null
          file_path?: string | null
          first_seen_at?: string | null
          id?: string
          last_seen_at?: string | null
          line_number?: number | null
          message?: string | null
          occurrences?: number | null
          project_id?: string | null
          resolved_at?: string | null
          severity?: string | null
          stack_trace?: string | null
          status?: string | null
        }
        Relationships: []
      }
      events_events: {
        Row: {
          address: string | null
          attended: number | null
          banner_url: string | null
          capacity: number | null
          city: string | null
          contact_email: string | null
          country: string | null
          created_at: string | null
          currency: string | null
          description: string | null
          end_date: string | null
          event_name: string
          event_type: string | null
          id: string
          is_virtual: boolean | null
          organizer: string | null
          registered: number | null
          start_date: string
          status: string | null
          tags: string[] | null
          tenant_id: string | null
          ticket_price: number | null
          venue: string | null
          virtual_url: string | null
        }
        Insert: {
          address?: string | null
          attended?: number | null
          banner_url?: string | null
          capacity?: number | null
          city?: string | null
          contact_email?: string | null
          country?: string | null
          created_at?: string | null
          currency?: string | null
          description?: string | null
          end_date?: string | null
          event_name: string
          event_type?: string | null
          id?: string
          is_virtual?: boolean | null
          organizer?: string | null
          registered?: number | null
          start_date: string
          status?: string | null
          tags?: string[] | null
          tenant_id?: string | null
          ticket_price?: number | null
          venue?: string | null
          virtual_url?: string | null
        }
        Update: {
          address?: string | null
          attended?: number | null
          banner_url?: string | null
          capacity?: number | null
          city?: string | null
          contact_email?: string | null
          country?: string | null
          created_at?: string | null
          currency?: string | null
          description?: string | null
          end_date?: string | null
          event_name?: string
          event_type?: string | null
          id?: string
          is_virtual?: boolean | null
          organizer?: string | null
          registered?: number | null
          start_date?: string
          status?: string | null
          tags?: string[] | null
          tenant_id?: string | null
          ticket_price?: number | null
          venue?: string | null
          virtual_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      events_registrations: {
        Row: {
          accessibility_needs: string | null
          amount_paid: number | null
          attendee_email: string | null
          attendee_name: string
          attendee_phone: string | null
          check_in_time: string | null
          company: string | null
          dietary_requirements: string | null
          event_id: string
          id: string
          job_title: string | null
          notes: string | null
          payment_status: string | null
          registration_date: string | null
          status: string | null
          ticket_id: string | null
        }
        Insert: {
          accessibility_needs?: string | null
          amount_paid?: number | null
          attendee_email?: string | null
          attendee_name: string
          attendee_phone?: string | null
          check_in_time?: string | null
          company?: string | null
          dietary_requirements?: string | null
          event_id: string
          id?: string
          job_title?: string | null
          notes?: string | null
          payment_status?: string | null
          registration_date?: string | null
          status?: string | null
          ticket_id?: string | null
        }
        Update: {
          accessibility_needs?: string | null
          amount_paid?: number | null
          attendee_email?: string | null
          attendee_name?: string
          attendee_phone?: string | null
          check_in_time?: string | null
          company?: string | null
          dietary_requirements?: string | null
          event_id?: string
          id?: string
          job_title?: string | null
          notes?: string | null
          payment_status?: string | null
          registration_date?: string | null
          status?: string | null
          ticket_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_registrations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_registrations_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "events_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      events_speakers: {
        Row: {
          bio: string | null
          company: string | null
          email: string | null
          event_id: string
          id: string
          photo_url: string | null
          session_duration: number | null
          session_room: string | null
          session_time: string | null
          session_title: string | null
          speaker_name: string
          title: string | null
        }
        Insert: {
          bio?: string | null
          company?: string | null
          email?: string | null
          event_id: string
          id?: string
          photo_url?: string | null
          session_duration?: number | null
          session_room?: string | null
          session_time?: string | null
          session_title?: string | null
          speaker_name: string
          title?: string | null
        }
        Update: {
          bio?: string | null
          company?: string | null
          email?: string | null
          event_id?: string
          id?: string
          photo_url?: string | null
          session_duration?: number | null
          session_room?: string | null
          session_time?: string | null
          session_title?: string | null
          speaker_name?: string
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_speakers_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_events"
            referencedColumns: ["id"]
          },
        ]
      }
      events_tickets: {
        Row: {
          early_bird_deadline: string | null
          early_bird_price: number | null
          event_id: string
          id: string
          is_active: boolean | null
          name: string
          price: number | null
          quantity_available: number | null
          quantity_sold: number | null
          sale_end: string | null
          sale_start: string | null
          ticket_type: string
        }
        Insert: {
          early_bird_deadline?: string | null
          early_bird_price?: number | null
          event_id: string
          id?: string
          is_active?: boolean | null
          name: string
          price?: number | null
          quantity_available?: number | null
          quantity_sold?: number | null
          sale_end?: string | null
          sale_start?: string | null
          ticket_type: string
        }
        Update: {
          early_bird_deadline?: string | null
          early_bird_price?: number | null
          event_id?: string
          id?: string
          is_active?: boolean | null
          name?: string
          price?: number | null
          quantity_available?: number | null
          quantity_sold?: number | null
          sale_end?: string | null
          sale_start?: string | null
          ticket_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_tickets_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events_events"
            referencedColumns: ["id"]
          },
        ]
      }
      extensions: {
        Row: {
          author: string | null
          category: string | null
          config_schema: Json | null
          created_at: string | null
          description: string | null
          display_name: string | null
          icon_url: string | null
          id: string
          install_count: number | null
          name: string | null
          rating: number | null
          status: string | null
          version: string | null
        }
        Insert: {
          author?: string | null
          category?: string | null
          config_schema?: Json | null
          created_at?: string | null
          description?: string | null
          display_name?: string | null
          icon_url?: string | null
          id: string
          install_count?: number | null
          name?: string | null
          rating?: number | null
          status?: string | null
          version?: string | null
        }
        Update: {
          author?: string | null
          category?: string | null
          config_schema?: Json | null
          created_at?: string | null
          description?: string | null
          display_name?: string | null
          icon_url?: string | null
          id?: string
          install_count?: number | null
          name?: string | null
          rating?: number | null
          status?: string | null
          version?: string | null
        }
        Relationships: []
      }
      feature_flags: {
        Row: {
          created_at: string | null
          description: string | null
          enabled: boolean | null
          id: string
          name: string | null
          rollout_pct: number | null
          target_plans: Json | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          enabled?: boolean | null
          id: string
          name?: string | null
          rollout_pct?: number | null
          target_plans?: Json | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          enabled?: boolean | null
          id?: string
          name?: string | null
          rollout_pct?: number | null
          target_plans?: Json | null
        }
        Relationships: []
      }
      file_versions: {
        Row: {
          author_id: string | null
          changes_summary: string | null
          content_hash: string | null
          created_at: string | null
          file_path: string | null
          id: string
          project_id: string | null
          size_bytes: number | null
          version: number | null
        }
        Insert: {
          author_id?: string | null
          changes_summary?: string | null
          content_hash?: string | null
          created_at?: string | null
          file_path?: string | null
          id: string
          project_id?: string | null
          size_bytes?: number | null
          version?: number | null
        }
        Update: {
          author_id?: string | null
          changes_summary?: string | null
          content_hash?: string | null
          created_at?: string | null
          file_path?: string | null
          id?: string
          project_id?: string | null
          size_bytes?: number | null
          version?: number | null
        }
        Relationships: []
      }
      food_menu_categories: {
        Row: {
          category_name: string
          display_order: number | null
          id: string
          is_active: boolean | null
          restaurant_id: string
        }
        Insert: {
          category_name: string
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          restaurant_id: string
        }
        Update: {
          category_name?: string
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "food_menu_categories_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "food_restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      food_menu_items: {
        Row: {
          allergens: string[] | null
          calories: number | null
          category_id: string | null
          cost: number | null
          description: string | null
          dietary_tags: string[] | null
          food_cost_percent: number | null
          id: string
          image_url: string | null
          is_active: boolean | null
          is_available: boolean | null
          item_name: string
          preparation_time: number | null
          price: number
          restaurant_id: string
        }
        Insert: {
          allergens?: string[] | null
          calories?: number | null
          category_id?: string | null
          cost?: number | null
          description?: string | null
          dietary_tags?: string[] | null
          food_cost_percent?: number | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          is_available?: boolean | null
          item_name: string
          preparation_time?: number | null
          price: number
          restaurant_id: string
        }
        Update: {
          allergens?: string[] | null
          calories?: number | null
          category_id?: string | null
          cost?: number | null
          description?: string | null
          dietary_tags?: string[] | null
          food_cost_percent?: number | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          is_available?: boolean | null
          item_name?: string
          preparation_time?: number | null
          price?: number
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "food_menu_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "food_menu_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "food_menu_items_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "food_restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      food_order_items: {
        Row: {
          id: string
          item_name: string
          menu_item_id: string | null
          modifiers: string[] | null
          order_id: string
          quantity: number
          special_instructions: string | null
          status: string | null
          unit_price: number | null
        }
        Insert: {
          id?: string
          item_name: string
          menu_item_id?: string | null
          modifiers?: string[] | null
          order_id: string
          quantity?: number
          special_instructions?: string | null
          status?: string | null
          unit_price?: number | null
        }
        Update: {
          id?: string
          item_name?: string
          menu_item_id?: string | null
          modifiers?: string[] | null
          order_id?: string
          quantity?: number
          special_instructions?: string | null
          status?: string | null
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "food_order_items_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "food_menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "food_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "food_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      food_orders: {
        Row: {
          created_at: string | null
          customer_name: string | null
          delivery_address: string | null
          delivery_driver: string | null
          discount: number | null
          id: string
          notes: string | null
          order_number: string
          order_time: string | null
          order_type: string | null
          payment_method: string | null
          payment_status: string | null
          restaurant_id: string | null
          server_name: string | null
          status: string | null
          subtotal: number | null
          table_number: string | null
          tax: number | null
          tenant_id: string | null
          tip: number | null
          total: number | null
        }
        Insert: {
          created_at?: string | null
          customer_name?: string | null
          delivery_address?: string | null
          delivery_driver?: string | null
          discount?: number | null
          id?: string
          notes?: string | null
          order_number: string
          order_time?: string | null
          order_type?: string | null
          payment_method?: string | null
          payment_status?: string | null
          restaurant_id?: string | null
          server_name?: string | null
          status?: string | null
          subtotal?: number | null
          table_number?: string | null
          tax?: number | null
          tenant_id?: string | null
          tip?: number | null
          total?: number | null
        }
        Update: {
          created_at?: string | null
          customer_name?: string | null
          delivery_address?: string | null
          delivery_driver?: string | null
          discount?: number | null
          id?: string
          notes?: string | null
          order_number?: string
          order_time?: string | null
          order_type?: string | null
          payment_method?: string | null
          payment_status?: string | null
          restaurant_id?: string | null
          server_name?: string | null
          status?: string | null
          subtotal?: number | null
          table_number?: string | null
          tax?: number | null
          tenant_id?: string | null
          tip?: number | null
          total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "food_orders_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "food_restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "food_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      food_reservations_table: {
        Row: {
          created_at: string | null
          guest_email: string | null
          guest_name: string
          guest_phone: string | null
          id: string
          party_size: number
          reservation_date: string
          reservation_time: string
          restaurant_id: string
          special_requests: string | null
          status: string | null
          table_id: string | null
        }
        Insert: {
          created_at?: string | null
          guest_email?: string | null
          guest_name: string
          guest_phone?: string | null
          id?: string
          party_size: number
          reservation_date: string
          reservation_time: string
          restaurant_id: string
          special_requests?: string | null
          status?: string | null
          table_id?: string | null
        }
        Update: {
          created_at?: string | null
          guest_email?: string | null
          guest_name?: string
          guest_phone?: string | null
          id?: string
          party_size?: number
          reservation_date?: string
          reservation_time?: string
          restaurant_id?: string
          special_requests?: string | null
          status?: string | null
          table_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "food_reservations_table_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "food_restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "food_reservations_table_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "food_tables"
            referencedColumns: ["id"]
          },
        ]
      }
      food_restaurants: {
        Row: {
          address: string | null
          city: string | null
          country: string | null
          created_at: string | null
          cuisine_type: string | null
          id: string
          is_active: boolean | null
          opening_hours: Json | null
          phone: string | null
          restaurant_name: string
          restaurant_type: string | null
          seating_capacity: number | null
          tables_count: number | null
          tenant_id: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          cuisine_type?: string | null
          id?: string
          is_active?: boolean | null
          opening_hours?: Json | null
          phone?: string | null
          restaurant_name: string
          restaurant_type?: string | null
          seating_capacity?: number | null
          tables_count?: number | null
          tenant_id?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          cuisine_type?: string | null
          id?: string
          is_active?: boolean | null
          opening_hours?: Json | null
          phone?: string | null
          restaurant_name?: string
          restaurant_type?: string | null
          seating_capacity?: number | null
          tables_count?: number | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "food_restaurants_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      food_tables: {
        Row: {
          capacity: number | null
          id: string
          restaurant_id: string
          section: string | null
          status: string | null
          table_number: string
        }
        Insert: {
          capacity?: number | null
          id?: string
          restaurant_id: string
          section?: string | null
          status?: string | null
          table_number: string
        }
        Update: {
          capacity?: number | null
          id?: string
          restaurant_id?: string
          section?: string | null
          status?: string | null
          table_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "food_tables_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "food_restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      gl_account_balances: {
        Row: {
          account_id: string
          closing_credit: number | null
          closing_debit: number | null
          currency: string | null
          id: string
          net_balance: number | null
          opening_credit: number | null
          opening_debit: number | null
          period_credit: number | null
          period_debit: number | null
          period_id: string
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          account_id: string
          closing_credit?: number | null
          closing_debit?: number | null
          currency?: string | null
          id?: string
          net_balance?: number | null
          opening_credit?: number | null
          opening_debit?: number | null
          period_credit?: number | null
          period_debit?: number | null
          period_id: string
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          account_id?: string
          closing_credit?: number | null
          closing_debit?: number | null
          currency?: string | null
          id?: string
          net_balance?: number | null
          opening_credit?: number | null
          opening_debit?: number | null
          period_credit?: number | null
          period_debit?: number | null
          period_id?: string
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gl_account_balances_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "gl_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gl_account_balances_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "gl_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gl_account_balances_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      gl_accounts: {
        Row: {
          account_code: string
          account_name: string
          account_name_en: string | null
          account_subtype: string | null
          account_type: string
          created_at: string | null
          currency: string | null
          description: string | null
          id: string
          is_active: boolean | null
          is_header: boolean | null
          level: number | null
          normal_balance: string | null
          parent_id: string | null
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          account_code: string
          account_name: string
          account_name_en?: string | null
          account_subtype?: string | null
          account_type: string
          created_at?: string | null
          currency?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_header?: boolean | null
          level?: number | null
          normal_balance?: string | null
          parent_id?: string | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          account_code?: string
          account_name?: string
          account_name_en?: string | null
          account_subtype?: string | null
          account_type?: string
          created_at?: string | null
          currency?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_header?: boolean | null
          level?: number | null
          normal_balance?: string | null
          parent_id?: string | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gl_accounts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "gl_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gl_accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      gl_audit_trail: {
        Row: {
          action: string
          changed_at: string | null
          changed_by: string | null
          id: string
          ip_address: string | null
          new_values: Json | null
          old_values: Json | null
          record_id: string
          table_name: string
          tenant_id: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          changed_at?: string | null
          changed_by?: string | null
          id?: string
          ip_address?: string | null
          new_values?: Json | null
          old_values?: Json | null
          record_id: string
          table_name: string
          tenant_id?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          changed_at?: string | null
          changed_by?: string | null
          id?: string
          ip_address?: string | null
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string
          table_name?: string
          tenant_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gl_audit_trail_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      gl_exchange_rates: {
        Row: {
          created_at: string | null
          from_currency: string
          id: string
          rate: number
          rate_date: string
          rate_type: string | null
          source: string | null
          tenant_id: string | null
          to_currency: string
        }
        Insert: {
          created_at?: string | null
          from_currency: string
          id?: string
          rate: number
          rate_date: string
          rate_type?: string | null
          source?: string | null
          tenant_id?: string | null
          to_currency: string
        }
        Update: {
          created_at?: string | null
          from_currency?: string
          id?: string
          rate?: number
          rate_date?: string
          rate_type?: string | null
          source?: string | null
          tenant_id?: string | null
          to_currency?: string
        }
        Relationships: [
          {
            foreignKeyName: "gl_exchange_rates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      gl_journal_entries: {
        Row: {
          approved_by: string | null
          created_at: string | null
          created_by: string | null
          currency: string | null
          description: string | null
          entry_date: string
          entry_number: string
          exchange_rate: number | null
          id: string
          notes: string | null
          period_id: string | null
          posted_at: string | null
          posted_by: string | null
          posting_date: string
          reference: string | null
          reversed_entry_id: string | null
          source: string
          source_document_id: string | null
          source_module: string | null
          status: string | null
          tags: string[] | null
          tenant_id: string | null
          total_credit: number | null
          total_debit: number | null
          updated_at: string | null
        }
        Insert: {
          approved_by?: string | null
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          description?: string | null
          entry_date: string
          entry_number: string
          exchange_rate?: number | null
          id?: string
          notes?: string | null
          period_id?: string | null
          posted_at?: string | null
          posted_by?: string | null
          posting_date: string
          reference?: string | null
          reversed_entry_id?: string | null
          source?: string
          source_document_id?: string | null
          source_module?: string | null
          status?: string | null
          tags?: string[] | null
          tenant_id?: string | null
          total_credit?: number | null
          total_debit?: number | null
          updated_at?: string | null
        }
        Update: {
          approved_by?: string | null
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          description?: string | null
          entry_date?: string
          entry_number?: string
          exchange_rate?: number | null
          id?: string
          notes?: string | null
          period_id?: string | null
          posted_at?: string | null
          posted_by?: string | null
          posting_date?: string
          reference?: string | null
          reversed_entry_id?: string | null
          source?: string
          source_document_id?: string | null
          source_module?: string | null
          status?: string | null
          tags?: string[] | null
          tenant_id?: string | null
          total_credit?: number | null
          total_debit?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gl_journal_entries_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "gl_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gl_journal_entries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      gl_journal_lines: {
        Row: {
          account_id: string
          base_credit: number | null
          base_debit: number | null
          cost_center: string | null
          created_at: string | null
          credit_amount: number | null
          currency: string | null
          debit_amount: number | null
          department: string | null
          description: string | null
          entry_id: string
          exchange_rate: number | null
          id: string
          intercompany_id: string | null
          line_number: number
          project: string | null
          segment: string | null
        }
        Insert: {
          account_id: string
          base_credit?: number | null
          base_debit?: number | null
          cost_center?: string | null
          created_at?: string | null
          credit_amount?: number | null
          currency?: string | null
          debit_amount?: number | null
          department?: string | null
          description?: string | null
          entry_id: string
          exchange_rate?: number | null
          id?: string
          intercompany_id?: string | null
          line_number: number
          project?: string | null
          segment?: string | null
        }
        Update: {
          account_id?: string
          base_credit?: number | null
          base_debit?: number | null
          cost_center?: string | null
          created_at?: string | null
          credit_amount?: number | null
          currency?: string | null
          debit_amount?: number | null
          department?: string | null
          description?: string | null
          entry_id?: string
          exchange_rate?: number | null
          id?: string
          intercompany_id?: string | null
          line_number?: number
          project?: string | null
          segment?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gl_journal_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "gl_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gl_journal_lines_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "gl_journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      gl_periods: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          created_at: string | null
          end_date: string
          fiscal_year: number
          id: string
          period_name: string
          period_number: number
          start_date: string
          status: string | null
          tenant_id: string | null
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string | null
          end_date: string
          fiscal_year: number
          id?: string
          period_name: string
          period_number: number
          start_date: string
          status?: string | null
          tenant_id?: string | null
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string | null
          end_date?: string
          fiscal_year?: number
          id?: string
          period_name?: string
          period_number?: number
          start_date?: string
          status?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gl_periods_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      gl_recurring_entries: {
        Row: {
          auto_post: boolean | null
          created_at: string | null
          created_by: string | null
          end_date: string | null
          frequency: string
          id: string
          is_active: boolean | null
          last_run_date: string | null
          name: string
          next_run_date: string | null
          template_entry: Json
          tenant_id: string | null
        }
        Insert: {
          auto_post?: boolean | null
          created_at?: string | null
          created_by?: string | null
          end_date?: string | null
          frequency: string
          id?: string
          is_active?: boolean | null
          last_run_date?: string | null
          name: string
          next_run_date?: string | null
          template_entry: Json
          tenant_id?: string | null
        }
        Update: {
          auto_post?: boolean | null
          created_at?: string | null
          created_by?: string | null
          end_date?: string | null
          frequency?: string
          id?: string
          is_active?: boolean | null
          last_run_date?: string | null
          name?: string
          next_run_date?: string | null
          template_entry?: Json
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gl_recurring_entries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      global_settings: {
        Row: {
          description: string | null
          id: string
          key: string | null
          updated_at: string | null
          value: string | null
        }
        Insert: {
          description?: string | null
          id: string
          key?: string | null
          updated_at?: string | null
          value?: string | null
        }
        Update: {
          description?: string | null
          id?: string
          key?: string | null
          updated_at?: string | null
          value?: string | null
        }
        Relationships: []
      }
      hamelech_modules: {
        Row: {
          category_id: string | null
          config_schema: Json | null
          created_at: string | null
          dependencies: Json | null
          description: string | null
          description_he: string | null
          downloads_count: number | null
          erp_source_key: string | null
          erp_tables: Json | null
          features: Json | null
          icon: string | null
          id: string
          is_active: boolean | null
          long_description: string | null
          name: string | null
          name_he: string | null
          preview_images: Json | null
          price_monthly: number | null
          price_yearly: number | null
          pricing_type: string | null
          rating: number | null
          reviews_count: number | null
          slug: string | null
          supported_languages: Json | null
          table_prefix: string | null
          tags: Json | null
          tech_stack: Json | null
          updated_at: string | null
          version: string | null
        }
        Insert: {
          category_id?: string | null
          config_schema?: Json | null
          created_at?: string | null
          dependencies?: Json | null
          description?: string | null
          description_he?: string | null
          downloads_count?: number | null
          erp_source_key?: string | null
          erp_tables?: Json | null
          features?: Json | null
          icon?: string | null
          id: string
          is_active?: boolean | null
          long_description?: string | null
          name?: string | null
          name_he?: string | null
          preview_images?: Json | null
          price_monthly?: number | null
          price_yearly?: number | null
          pricing_type?: string | null
          rating?: number | null
          reviews_count?: number | null
          slug?: string | null
          supported_languages?: Json | null
          table_prefix?: string | null
          tags?: Json | null
          tech_stack?: Json | null
          updated_at?: string | null
          version?: string | null
        }
        Update: {
          category_id?: string | null
          config_schema?: Json | null
          created_at?: string | null
          dependencies?: Json | null
          description?: string | null
          description_he?: string | null
          downloads_count?: number | null
          erp_source_key?: string | null
          erp_tables?: Json | null
          features?: Json | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          long_description?: string | null
          name?: string | null
          name_he?: string | null
          preview_images?: Json | null
          price_monthly?: number | null
          price_yearly?: number | null
          pricing_type?: string | null
          rating?: number | null
          reviews_count?: number | null
          slug?: string | null
          supported_languages?: Json | null
          table_prefix?: string | null
          tags?: Json | null
          tech_stack?: Json | null
          updated_at?: string | null
          version?: string | null
        }
        Relationships: []
      }
      health_appointments: {
        Row: {
          appointment_date: string
          appointment_type: string | null
          created_at: string | null
          end_time: string | null
          id: string
          is_telehealth: boolean | null
          notes: string | null
          patient_id: string
          provider_id: string | null
          provider_name: string | null
          reason: string | null
          room: string | null
          start_time: string | null
          status: string | null
          telehealth_url: string | null
          tenant_id: string | null
        }
        Insert: {
          appointment_date: string
          appointment_type?: string | null
          created_at?: string | null
          end_time?: string | null
          id?: string
          is_telehealth?: boolean | null
          notes?: string | null
          patient_id: string
          provider_id?: string | null
          provider_name?: string | null
          reason?: string | null
          room?: string | null
          start_time?: string | null
          status?: string | null
          telehealth_url?: string | null
          tenant_id?: string | null
        }
        Update: {
          appointment_date?: string
          appointment_type?: string | null
          created_at?: string | null
          end_time?: string | null
          id?: string
          is_telehealth?: boolean | null
          notes?: string | null
          patient_id?: string
          provider_id?: string | null
          provider_name?: string | null
          reason?: string | null
          room?: string | null
          start_time?: string | null
          status?: string | null
          telehealth_url?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "health_appointments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "health_patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "health_appointments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      health_billing: {
        Row: {
          amount_paid: number | null
          balance: number | null
          claim_status: string | null
          copay: number | null
          created_at: string | null
          diagnosis_codes: string[] | null
          id: string
          insurance_claim_id: string | null
          insurance_covered: number | null
          invoice_date: string
          invoice_number: string
          patient_id: string
          patient_responsibility: number | null
          procedure_codes: string[] | null
          status: string | null
          tenant_id: string | null
          total_charge: number | null
        }
        Insert: {
          amount_paid?: number | null
          balance?: number | null
          claim_status?: string | null
          copay?: number | null
          created_at?: string | null
          diagnosis_codes?: string[] | null
          id?: string
          insurance_claim_id?: string | null
          insurance_covered?: number | null
          invoice_date: string
          invoice_number: string
          patient_id: string
          patient_responsibility?: number | null
          procedure_codes?: string[] | null
          status?: string | null
          tenant_id?: string | null
          total_charge?: number | null
        }
        Update: {
          amount_paid?: number | null
          balance?: number | null
          claim_status?: string | null
          copay?: number | null
          created_at?: string | null
          diagnosis_codes?: string[] | null
          id?: string
          insurance_claim_id?: string | null
          insurance_covered?: number | null
          invoice_date?: string
          invoice_number?: string
          patient_id?: string
          patient_responsibility?: number | null
          procedure_codes?: string[] | null
          status?: string | null
          tenant_id?: string | null
          total_charge?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "health_billing_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "health_patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "health_billing_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      health_medical_records: {
        Row: {
          assessment: string | null
          chief_complaint: string | null
          created_at: string | null
          diagnosis_codes: string[] | null
          diagnosis_descriptions: string[] | null
          examination: string | null
          follow_up_date: string | null
          follow_up_notes: string | null
          id: string
          imaging_orders: Json | null
          lab_orders: Json | null
          notes: string | null
          patient_id: string
          plan: string | null
          prescriptions: Json | null
          procedures_performed: string[] | null
          provider_id: string | null
          provider_name: string | null
          record_date: string
          record_type: string
          vitals: Json | null
        }
        Insert: {
          assessment?: string | null
          chief_complaint?: string | null
          created_at?: string | null
          diagnosis_codes?: string[] | null
          diagnosis_descriptions?: string[] | null
          examination?: string | null
          follow_up_date?: string | null
          follow_up_notes?: string | null
          id?: string
          imaging_orders?: Json | null
          lab_orders?: Json | null
          notes?: string | null
          patient_id: string
          plan?: string | null
          prescriptions?: Json | null
          procedures_performed?: string[] | null
          provider_id?: string | null
          provider_name?: string | null
          record_date: string
          record_type: string
          vitals?: Json | null
        }
        Update: {
          assessment?: string | null
          chief_complaint?: string | null
          created_at?: string | null
          diagnosis_codes?: string[] | null
          diagnosis_descriptions?: string[] | null
          examination?: string | null
          follow_up_date?: string | null
          follow_up_notes?: string | null
          id?: string
          imaging_orders?: Json | null
          lab_orders?: Json | null
          notes?: string | null
          patient_id?: string
          plan?: string | null
          prescriptions?: Json | null
          procedures_performed?: string[] | null
          provider_id?: string | null
          provider_name?: string | null
          record_date?: string
          record_type?: string
          vitals?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "health_medical_records_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "health_patients"
            referencedColumns: ["id"]
          },
        ]
      }
      health_patients: {
        Row: {
          address: string | null
          allergies: string[] | null
          blood_type: string | null
          chronic_conditions: string[] | null
          city: string | null
          country: string | null
          created_at: string | null
          date_of_birth: string | null
          email: string | null
          emergency_contact: string | null
          emergency_phone: string | null
          emergency_relation: string | null
          first_name: string
          gender: string | null
          id: string
          insurance_id: string | null
          insurance_provider: string | null
          last_name: string
          medications: string[] | null
          mobile: string | null
          national_id: string | null
          notes: string | null
          patient_number: string
          phone: string | null
          primary_physician: string | null
          state: string | null
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          allergies?: string[] | null
          blood_type?: string | null
          chronic_conditions?: string[] | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          email?: string | null
          emergency_contact?: string | null
          emergency_phone?: string | null
          emergency_relation?: string | null
          first_name: string
          gender?: string | null
          id?: string
          insurance_id?: string | null
          insurance_provider?: string | null
          last_name: string
          medications?: string[] | null
          mobile?: string | null
          national_id?: string | null
          notes?: string | null
          patient_number: string
          phone?: string | null
          primary_physician?: string | null
          state?: string | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          allergies?: string[] | null
          blood_type?: string | null
          chronic_conditions?: string[] | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          email?: string | null
          emergency_contact?: string | null
          emergency_phone?: string | null
          emergency_relation?: string | null
          first_name?: string
          gender?: string | null
          id?: string
          insurance_id?: string | null
          insurance_provider?: string | null
          last_name?: string
          medications?: string[] | null
          mobile?: string | null
          national_id?: string | null
          notes?: string | null
          patient_number?: string
          phone?: string | null
          primary_physician?: string | null
          state?: string | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "health_patients_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      health_prescriptions: {
        Row: {
          created_at: string | null
          dosage: string | null
          end_date: string | null
          frequency: string | null
          id: string
          instructions: string | null
          medication_name: string
          patient_id: string
          pharmacy: string | null
          provider_id: string | null
          quantity: number | null
          record_id: string | null
          refills: number | null
          route: string | null
          start_date: string | null
          status: string | null
        }
        Insert: {
          created_at?: string | null
          dosage?: string | null
          end_date?: string | null
          frequency?: string | null
          id?: string
          instructions?: string | null
          medication_name: string
          patient_id: string
          pharmacy?: string | null
          provider_id?: string | null
          quantity?: number | null
          record_id?: string | null
          refills?: number | null
          route?: string | null
          start_date?: string | null
          status?: string | null
        }
        Update: {
          created_at?: string | null
          dosage?: string | null
          end_date?: string | null
          frequency?: string | null
          id?: string
          instructions?: string | null
          medication_name?: string
          patient_id?: string
          pharmacy?: string | null
          provider_id?: string | null
          quantity?: number | null
          record_id?: string | null
          refills?: number | null
          route?: string | null
          start_date?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "health_prescriptions_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "health_patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "health_prescriptions_record_id_fkey"
            columns: ["record_id"]
            isOneToOne: false
            referencedRelation: "health_medical_records"
            referencedColumns: ["id"]
          },
        ]
      }
      hotel_housekeeping: {
        Row: {
          assigned_to: string | null
          completed_at: string | null
          id: string
          notes: string | null
          property_id: string
          room_id: string
          status: string | null
          task_date: string
          task_type: string | null
        }
        Insert: {
          assigned_to?: string | null
          completed_at?: string | null
          id?: string
          notes?: string | null
          property_id: string
          room_id: string
          status?: string | null
          task_date: string
          task_type?: string | null
        }
        Update: {
          assigned_to?: string | null
          completed_at?: string | null
          id?: string
          notes?: string | null
          property_id?: string
          room_id?: string
          status?: string | null
          task_date?: string
          task_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hotel_housekeeping_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "hotel_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hotel_housekeeping_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "hotel_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      hotel_properties: {
        Row: {
          address: string | null
          amenities: string[] | null
          check_in_time: string | null
          check_out_time: string | null
          city: string | null
          country: string | null
          created_at: string | null
          email: string | null
          id: string
          phone: string | null
          policies: string | null
          property_name: string
          property_type: string | null
          star_rating: number | null
          tenant_id: string | null
          total_rooms: number | null
          website: string | null
        }
        Insert: {
          address?: string | null
          amenities?: string[] | null
          check_in_time?: string | null
          check_out_time?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          phone?: string | null
          policies?: string | null
          property_name: string
          property_type?: string | null
          star_rating?: number | null
          tenant_id?: string | null
          total_rooms?: number | null
          website?: string | null
        }
        Update: {
          address?: string | null
          amenities?: string[] | null
          check_in_time?: string | null
          check_out_time?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          phone?: string | null
          policies?: string | null
          property_name?: string
          property_type?: string | null
          star_rating?: number | null
          tenant_id?: string | null
          total_rooms?: number | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hotel_properties_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      hotel_reservations: {
        Row: {
          adults: number | null
          channel: string | null
          check_in: string
          check_out: string
          children: number | null
          confirmation_number: string
          created_at: string | null
          guest_email: string | null
          guest_name: string
          guest_phone: string | null
          id: string
          nights: number | null
          payment_status: string | null
          property_id: string | null
          rate_per_night: number | null
          room_id: string | null
          room_type_id: string | null
          special_requests: string | null
          status: string | null
          tenant_id: string | null
          total_amount: number | null
        }
        Insert: {
          adults?: number | null
          channel?: string | null
          check_in: string
          check_out: string
          children?: number | null
          confirmation_number: string
          created_at?: string | null
          guest_email?: string | null
          guest_name: string
          guest_phone?: string | null
          id?: string
          nights?: number | null
          payment_status?: string | null
          property_id?: string | null
          rate_per_night?: number | null
          room_id?: string | null
          room_type_id?: string | null
          special_requests?: string | null
          status?: string | null
          tenant_id?: string | null
          total_amount?: number | null
        }
        Update: {
          adults?: number | null
          channel?: string | null
          check_in?: string
          check_out?: string
          children?: number | null
          confirmation_number?: string
          created_at?: string | null
          guest_email?: string | null
          guest_name?: string
          guest_phone?: string | null
          id?: string
          nights?: number | null
          payment_status?: string | null
          property_id?: string | null
          rate_per_night?: number | null
          room_id?: string | null
          room_type_id?: string | null
          special_requests?: string | null
          status?: string | null
          tenant_id?: string | null
          total_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "hotel_reservations_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "hotel_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hotel_reservations_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "hotel_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hotel_reservations_room_type_id_fkey"
            columns: ["room_type_id"]
            isOneToOne: false
            referencedRelation: "hotel_room_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hotel_reservations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      hotel_room_types: {
        Row: {
          amenities: string[] | null
          area_sqm: number | null
          base_rate: number | null
          bed_type: string | null
          description: string | null
          id: string
          images: string[] | null
          is_active: boolean | null
          max_occupancy: number | null
          property_id: string
          type_code: string
          type_name: string
        }
        Insert: {
          amenities?: string[] | null
          area_sqm?: number | null
          base_rate?: number | null
          bed_type?: string | null
          description?: string | null
          id?: string
          images?: string[] | null
          is_active?: boolean | null
          max_occupancy?: number | null
          property_id: string
          type_code: string
          type_name: string
        }
        Update: {
          amenities?: string[] | null
          area_sqm?: number | null
          base_rate?: number | null
          bed_type?: string | null
          description?: string | null
          id?: string
          images?: string[] | null
          is_active?: boolean | null
          max_occupancy?: number | null
          property_id?: string
          type_code?: string
          type_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "hotel_room_types_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "hotel_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      hotel_rooms: {
        Row: {
          floor: number | null
          id: string
          is_active: boolean | null
          property_id: string
          room_number: string
          room_type_id: string | null
          status: string | null
        }
        Insert: {
          floor?: number | null
          id?: string
          is_active?: boolean | null
          property_id: string
          room_number: string
          room_type_id?: string | null
          status?: string | null
        }
        Update: {
          floor?: number | null
          id?: string
          is_active?: boolean | null
          property_id?: string
          room_number?: string
          room_type_id?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hotel_rooms_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "hotel_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hotel_rooms_room_type_id_fkey"
            columns: ["room_type_id"]
            isOneToOne: false
            referencedRelation: "hotel_room_types"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_attendance: {
        Row: {
          attendance_date: string
          clock_in: string | null
          clock_out: string | null
          employee_id: string
          hours_worked: number | null
          id: string
          notes: string | null
          overtime_hours: number | null
          status: string | null
          tenant_id: string | null
        }
        Insert: {
          attendance_date: string
          clock_in?: string | null
          clock_out?: string | null
          employee_id: string
          hours_worked?: number | null
          id?: string
          notes?: string | null
          overtime_hours?: number | null
          status?: string | null
          tenant_id?: string | null
        }
        Update: {
          attendance_date?: string
          clock_in?: string | null
          clock_out?: string | null
          employee_id?: string
          hours_worked?: number | null
          id?: string
          notes?: string | null
          overtime_hours?: number | null
          status?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_attendance_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_attendance_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_departments: {
        Row: {
          cost_center: string | null
          created_at: string | null
          dept_code: string
          dept_name: string
          id: string
          is_active: boolean | null
          manager_id: string | null
          parent_id: string | null
          tenant_id: string | null
        }
        Insert: {
          cost_center?: string | null
          created_at?: string | null
          dept_code: string
          dept_name: string
          id?: string
          is_active?: boolean | null
          manager_id?: string | null
          parent_id?: string | null
          tenant_id?: string | null
        }
        Update: {
          cost_center?: string | null
          created_at?: string | null
          dept_code?: string
          dept_name?: string
          id?: string
          is_active?: boolean | null
          manager_id?: string | null
          parent_id?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_departments_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_departments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "hr_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_departments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_employees: {
        Row: {
          address: string | null
          bank_account: string | null
          bank_name: string | null
          bank_routing: string | null
          base_salary: number | null
          certifications: string[] | null
          city: string | null
          country: string | null
          created_at: string | null
          custom_fields: Json | null
          date_of_birth: string | null
          department: string | null
          email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          emergency_relation: string | null
          employee_number: string
          employment_status: string | null
          employment_type: string | null
          first_name: string
          gender: string | null
          hire_date: string
          id: string
          job_title: string | null
          languages: string[] | null
          last_name: string
          manager_id: string | null
          mobile: string | null
          national_id: string | null
          notes: string | null
          passport_number: string | null
          pay_frequency: string | null
          phone: string | null
          photo_url: string | null
          position: string | null
          postal_code: string | null
          salary_currency: string | null
          skills: string[] | null
          state: string | null
          tenant_id: string | null
          termination_date: string | null
          updated_at: string | null
          work_location: string | null
          work_schedule: string | null
        }
        Insert: {
          address?: string | null
          bank_account?: string | null
          bank_name?: string | null
          bank_routing?: string | null
          base_salary?: number | null
          certifications?: string[] | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          custom_fields?: Json | null
          date_of_birth?: string | null
          department?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_relation?: string | null
          employee_number: string
          employment_status?: string | null
          employment_type?: string | null
          first_name: string
          gender?: string | null
          hire_date: string
          id?: string
          job_title?: string | null
          languages?: string[] | null
          last_name: string
          manager_id?: string | null
          mobile?: string | null
          national_id?: string | null
          notes?: string | null
          passport_number?: string | null
          pay_frequency?: string | null
          phone?: string | null
          photo_url?: string | null
          position?: string | null
          postal_code?: string | null
          salary_currency?: string | null
          skills?: string[] | null
          state?: string | null
          tenant_id?: string | null
          termination_date?: string | null
          updated_at?: string | null
          work_location?: string | null
          work_schedule?: string | null
        }
        Update: {
          address?: string | null
          bank_account?: string | null
          bank_name?: string | null
          bank_routing?: string | null
          base_salary?: number | null
          certifications?: string[] | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          custom_fields?: Json | null
          date_of_birth?: string | null
          department?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_relation?: string | null
          employee_number?: string
          employment_status?: string | null
          employment_type?: string | null
          first_name?: string
          gender?: string | null
          hire_date?: string
          id?: string
          job_title?: string | null
          languages?: string[] | null
          last_name?: string
          manager_id?: string | null
          mobile?: string | null
          national_id?: string | null
          notes?: string | null
          passport_number?: string | null
          pay_frequency?: string | null
          phone?: string | null
          photo_url?: string | null
          position?: string | null
          postal_code?: string | null
          salary_currency?: string | null
          skills?: string[] | null
          state?: string | null
          tenant_id?: string | null
          termination_date?: string | null
          updated_at?: string | null
          work_location?: string | null
          work_schedule?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_employees_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_employees_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_leave_requests: {
        Row: {
          approved_by: string | null
          created_at: string | null
          days_count: number
          employee_id: string
          end_date: string
          id: string
          leave_type: string
          reason: string | null
          start_date: string
          status: string | null
          tenant_id: string | null
        }
        Insert: {
          approved_by?: string | null
          created_at?: string | null
          days_count: number
          employee_id: string
          end_date: string
          id?: string
          leave_type: string
          reason?: string | null
          start_date: string
          status?: string | null
          tenant_id?: string | null
        }
        Update: {
          approved_by?: string | null
          created_at?: string | null
          days_count?: number
          employee_id?: string
          end_date?: string
          id?: string
          leave_type?: string
          reason?: string | null
          start_date?: string
          status?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_leave_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_leave_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_payroll_runs: {
        Row: {
          approved_by: string | null
          created_at: string | null
          employee_count: number | null
          id: string
          paid_at: string | null
          pay_date: string
          period_end: string
          period_start: string
          run_number: string
          status: string | null
          tenant_id: string | null
          total_deductions: number | null
          total_gross: number | null
          total_net: number | null
        }
        Insert: {
          approved_by?: string | null
          created_at?: string | null
          employee_count?: number | null
          id?: string
          paid_at?: string | null
          pay_date: string
          period_end: string
          period_start: string
          run_number: string
          status?: string | null
          tenant_id?: string | null
          total_deductions?: number | null
          total_gross?: number | null
          total_net?: number | null
        }
        Update: {
          approved_by?: string | null
          created_at?: string | null
          employee_count?: number | null
          id?: string
          paid_at?: string | null
          pay_date?: string
          period_end?: string
          period_start?: string
          run_number?: string
          status?: string | null
          tenant_id?: string | null
          total_deductions?: number | null
          total_gross?: number | null
          total_net?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_payroll_runs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_payslips: {
        Row: {
          allowances: number | null
          basic_salary: number | null
          bonuses: number | null
          currency: string | null
          employee_id: string
          gross_pay: number | null
          health_insurance: number | null
          id: string
          income_tax: number | null
          net_pay: number | null
          other_deductions: number | null
          overtime_pay: number | null
          payroll_run_id: string
          pension: number | null
          social_security: number | null
          total_deductions: number | null
        }
        Insert: {
          allowances?: number | null
          basic_salary?: number | null
          bonuses?: number | null
          currency?: string | null
          employee_id: string
          gross_pay?: number | null
          health_insurance?: number | null
          id?: string
          income_tax?: number | null
          net_pay?: number | null
          other_deductions?: number | null
          overtime_pay?: number | null
          payroll_run_id: string
          pension?: number | null
          social_security?: number | null
          total_deductions?: number | null
        }
        Update: {
          allowances?: number | null
          basic_salary?: number | null
          bonuses?: number | null
          currency?: string | null
          employee_id?: string
          gross_pay?: number | null
          health_insurance?: number | null
          id?: string
          income_tax?: number | null
          net_pay?: number | null
          other_deductions?: number | null
          overtime_pay?: number | null
          payroll_run_id?: string
          pension?: number | null
          social_security?: number | null
          total_deductions?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_payslips_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_payslips_payroll_run_id_fkey"
            columns: ["payroll_run_id"]
            isOneToOne: false
            referencedRelation: "hr_payroll_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_performance_reviews: {
        Row: {
          comments: string | null
          created_at: string | null
          employee_id: string
          goals_achieved: string | null
          id: string
          improvements: string | null
          overall_rating: number | null
          review_date: string | null
          review_period: string | null
          reviewer_id: string | null
          status: string | null
          strengths: string | null
          tenant_id: string | null
        }
        Insert: {
          comments?: string | null
          created_at?: string | null
          employee_id: string
          goals_achieved?: string | null
          id?: string
          improvements?: string | null
          overall_rating?: number | null
          review_date?: string | null
          review_period?: string | null
          reviewer_id?: string | null
          status?: string | null
          strengths?: string | null
          tenant_id?: string | null
        }
        Update: {
          comments?: string | null
          created_at?: string | null
          employee_id?: string
          goals_achieved?: string | null
          id?: string
          improvements?: string | null
          overall_rating?: number | null
          review_date?: string | null
          review_period?: string | null
          reviewer_id?: string | null
          status?: string | null
          strengths?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_performance_reviews_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_performance_reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_performance_reviews_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_positions: {
        Row: {
          created_at: string | null
          department_id: string | null
          grade: string | null
          id: string
          is_active: boolean | null
          max_salary: number | null
          min_salary: number | null
          position_code: string
          position_title: string
          requirements: string | null
          responsibilities: string | null
          tenant_id: string | null
        }
        Insert: {
          created_at?: string | null
          department_id?: string | null
          grade?: string | null
          id?: string
          is_active?: boolean | null
          max_salary?: number | null
          min_salary?: number | null
          position_code: string
          position_title: string
          requirements?: string | null
          responsibilities?: string | null
          tenant_id?: string | null
        }
        Update: {
          created_at?: string | null
          department_id?: string | null
          grade?: string | null
          id?: string
          is_active?: boolean | null
          max_salary?: number | null
          min_salary?: number | null
          position_code?: string
          position_title?: string
          requirements?: string | null
          responsibilities?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_positions_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "hr_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_positions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      infra_regions: {
        Row: {
          active_deployments: number | null
          avg_latency_ms: number | null
          capacity_pct: number | null
          code: string | null
          created_at: string | null
          features: Json | null
          id: string
          lat: number | null
          lng: number | null
          location: string | null
          name: string | null
          provider: string | null
          status: string | null
          uptime_pct: number | null
        }
        Insert: {
          active_deployments?: number | null
          avg_latency_ms?: number | null
          capacity_pct?: number | null
          code?: string | null
          created_at?: string | null
          features?: Json | null
          id: string
          lat?: number | null
          lng?: number | null
          location?: string | null
          name?: string | null
          provider?: string | null
          status?: string | null
          uptime_pct?: number | null
        }
        Update: {
          active_deployments?: number | null
          avg_latency_ms?: number | null
          capacity_pct?: number | null
          code?: string | null
          created_at?: string | null
          features?: Json | null
          id?: string
          lat?: number | null
          lng?: number | null
          location?: string | null
          name?: string | null
          provider?: string | null
          status?: string | null
          uptime_pct?: number | null
        }
        Relationships: []
      }
      ins_claims: {
        Row: {
          adjuster: string | null
          approved_amount: number | null
          claim_number: string
          claim_type: string | null
          claimant_contact: string | null
          claimant_name: string
          created_at: string | null
          documents: string[] | null
          estimated_amount: number | null
          fraud_flags: string[] | null
          fraud_score: number | null
          id: string
          incident_date: string
          incident_description: string | null
          incident_location: string | null
          notes: string | null
          paid_amount: number | null
          photos: string[] | null
          policy_id: string
          reported_date: string
          status: string | null
          tenant_id: string | null
        }
        Insert: {
          adjuster?: string | null
          approved_amount?: number | null
          claim_number: string
          claim_type?: string | null
          claimant_contact?: string | null
          claimant_name: string
          created_at?: string | null
          documents?: string[] | null
          estimated_amount?: number | null
          fraud_flags?: string[] | null
          fraud_score?: number | null
          id?: string
          incident_date: string
          incident_description?: string | null
          incident_location?: string | null
          notes?: string | null
          paid_amount?: number | null
          photos?: string[] | null
          policy_id: string
          reported_date: string
          status?: string | null
          tenant_id?: string | null
        }
        Update: {
          adjuster?: string | null
          approved_amount?: number | null
          claim_number?: string
          claim_type?: string | null
          claimant_contact?: string | null
          claimant_name?: string
          created_at?: string | null
          documents?: string[] | null
          estimated_amount?: number | null
          fraud_flags?: string[] | null
          fraud_score?: number | null
          id?: string
          incident_date?: string
          incident_description?: string | null
          incident_location?: string | null
          notes?: string | null
          paid_amount?: number | null
          photos?: string[] | null
          policy_id?: string
          reported_date?: string
          status?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ins_claims_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "ins_policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ins_claims_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ins_policies: {
        Row: {
          agent: string | null
          auto_renew: boolean | null
          broker: string | null
          coverage_details: Json | null
          created_at: string | null
          deductible: number | null
          effective_date: string
          endorsements: Json | null
          expiry_date: string
          id: string
          line_of_business: string | null
          payment_frequency: string | null
          policy_number: string
          policy_type: string
          policyholder_email: string | null
          policyholder_id: string | null
          policyholder_name: string
          policyholder_phone: string | null
          premium: number
          renewal_date: string | null
          status: string | null
          sum_insured: number | null
          tenant_id: string | null
          underwriter: string | null
        }
        Insert: {
          agent?: string | null
          auto_renew?: boolean | null
          broker?: string | null
          coverage_details?: Json | null
          created_at?: string | null
          deductible?: number | null
          effective_date: string
          endorsements?: Json | null
          expiry_date: string
          id?: string
          line_of_business?: string | null
          payment_frequency?: string | null
          policy_number: string
          policy_type: string
          policyholder_email?: string | null
          policyholder_id?: string | null
          policyholder_name: string
          policyholder_phone?: string | null
          premium: number
          renewal_date?: string | null
          status?: string | null
          sum_insured?: number | null
          tenant_id?: string | null
          underwriter?: string | null
        }
        Update: {
          agent?: string | null
          auto_renew?: boolean | null
          broker?: string | null
          coverage_details?: Json | null
          created_at?: string | null
          deductible?: number | null
          effective_date?: string
          endorsements?: Json | null
          expiry_date?: string
          id?: string
          line_of_business?: string | null
          payment_frequency?: string | null
          policy_number?: string
          policy_type?: string
          policyholder_email?: string | null
          policyholder_id?: string | null
          policyholder_name?: string
          policyholder_phone?: string | null
          premium?: number
          renewal_date?: string | null
          status?: string | null
          sum_insured?: number | null
          tenant_id?: string | null
          underwriter?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ins_policies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ins_quotes: {
        Row: {
          applicant_email: string | null
          applicant_name: string
          coverage_options: Json | null
          created_at: string | null
          id: string
          line_of_business: string | null
          policy_type: string | null
          premium_calculated: number | null
          quote_number: string
          risk_details: Json | null
          status: string | null
          tenant_id: string | null
          underwriting_notes: string | null
          valid_until: string | null
        }
        Insert: {
          applicant_email?: string | null
          applicant_name: string
          coverage_options?: Json | null
          created_at?: string | null
          id?: string
          line_of_business?: string | null
          policy_type?: string | null
          premium_calculated?: number | null
          quote_number: string
          risk_details?: Json | null
          status?: string | null
          tenant_id?: string | null
          underwriting_notes?: string | null
          valid_until?: string | null
        }
        Update: {
          applicant_email?: string | null
          applicant_name?: string
          coverage_options?: Json | null
          created_at?: string | null
          id?: string
          line_of_business?: string | null
          policy_type?: string | null
          premium_calculated?: number | null
          quote_number?: string
          risk_details?: Json | null
          status?: string | null
          tenant_id?: string | null
          underwriting_notes?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ins_quotes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_catalog: {
        Row: {
          auth_type: string | null
          category: string
          config_schema: Json | null
          countries: string[] | null
          created_at: string | null
          description: string | null
          icon: string | null
          id: string
          key: string
          name: string
          popularity: number | null
          pricing_tier: string | null
          provider: string
          required_scopes: string[] | null
          status: string | null
        }
        Insert: {
          auth_type?: string | null
          category: string
          config_schema?: Json | null
          countries?: string[] | null
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          key: string
          name: string
          popularity?: number | null
          pricing_tier?: string | null
          provider: string
          required_scopes?: string[] | null
          status?: string | null
        }
        Update: {
          auth_type?: string | null
          category?: string
          config_schema?: Json | null
          countries?: string[] | null
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          key?: string
          name?: string
          popularity?: number | null
          pricing_tier?: string | null
          provider?: string
          required_scopes?: string[] | null
          status?: string | null
        }
        Relationships: []
      }
      inv_count_lines: {
        Row: {
          count_sheet_id: string
          counted_qty: number | null
          id: string
          item_id: string
          location_id: string | null
          lot_number: string | null
          notes: string | null
          system_qty: number | null
          unit_cost: number | null
        }
        Insert: {
          count_sheet_id: string
          counted_qty?: number | null
          id?: string
          item_id: string
          location_id?: string | null
          lot_number?: string | null
          notes?: string | null
          system_qty?: number | null
          unit_cost?: number | null
        }
        Update: {
          count_sheet_id?: string
          counted_qty?: number | null
          id?: string
          item_id?: string
          location_id?: string | null
          lot_number?: string | null
          notes?: string | null
          system_qty?: number | null
          unit_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inv_count_lines_count_sheet_id_fkey"
            columns: ["count_sheet_id"]
            isOneToOne: false
            referencedRelation: "inv_count_sheets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_count_lines_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inv_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_count_lines_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "inv_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      inv_count_sheets: {
        Row: {
          approved_by: string | null
          count_date: string
          count_number: string
          count_type: string | null
          counted_by: string | null
          created_at: string | null
          id: string
          notes: string | null
          status: string | null
          tenant_id: string | null
          warehouse_id: string
        }
        Insert: {
          approved_by?: string | null
          count_date: string
          count_number: string
          count_type?: string | null
          counted_by?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          status?: string | null
          tenant_id?: string | null
          warehouse_id: string
        }
        Update: {
          approved_by?: string | null
          count_date?: string
          count_number?: string
          count_type?: string | null
          counted_by?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          status?: string | null
          tenant_id?: string | null
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inv_count_sheets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_count_sheets_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "inv_warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      inv_items: {
        Row: {
          average_cost: number | null
          barcode: string | null
          category: string | null
          costing_method: string | null
          created_at: string | null
          custom_fields: Json | null
          dimension_uom: string | null
          gl_cogs_account: string | null
          gl_inventory_account: string | null
          gl_revenue_account: string | null
          has_expiry: boolean | null
          height: number | null
          id: string
          image_url: string | null
          is_active: boolean | null
          is_lot_tracked: boolean | null
          is_serial_tracked: boolean | null
          item_code: string
          item_name: string
          item_name_en: string | null
          item_type: string
          last_cost: number | null
          lead_time_days: number | null
          length: number | null
          max_stock: number | null
          min_stock: number | null
          notes: string | null
          preferred_vendor_id: string | null
          reorder_point: number | null
          reorder_qty: number | null
          safety_stock: number | null
          selling_price: number | null
          shelf_life_days: number | null
          sku: string | null
          standard_cost: number | null
          subcategory: string | null
          tags: string[] | null
          tenant_id: string | null
          uom: string
          uom_conversion: number | null
          uom_purchase: string | null
          updated_at: string | null
          weight: number | null
          weight_uom: string | null
          width: number | null
        }
        Insert: {
          average_cost?: number | null
          barcode?: string | null
          category?: string | null
          costing_method?: string | null
          created_at?: string | null
          custom_fields?: Json | null
          dimension_uom?: string | null
          gl_cogs_account?: string | null
          gl_inventory_account?: string | null
          gl_revenue_account?: string | null
          has_expiry?: boolean | null
          height?: number | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          is_lot_tracked?: boolean | null
          is_serial_tracked?: boolean | null
          item_code: string
          item_name: string
          item_name_en?: string | null
          item_type: string
          last_cost?: number | null
          lead_time_days?: number | null
          length?: number | null
          max_stock?: number | null
          min_stock?: number | null
          notes?: string | null
          preferred_vendor_id?: string | null
          reorder_point?: number | null
          reorder_qty?: number | null
          safety_stock?: number | null
          selling_price?: number | null
          shelf_life_days?: number | null
          sku?: string | null
          standard_cost?: number | null
          subcategory?: string | null
          tags?: string[] | null
          tenant_id?: string | null
          uom?: string
          uom_conversion?: number | null
          uom_purchase?: string | null
          updated_at?: string | null
          weight?: number | null
          weight_uom?: string | null
          width?: number | null
        }
        Update: {
          average_cost?: number | null
          barcode?: string | null
          category?: string | null
          costing_method?: string | null
          created_at?: string | null
          custom_fields?: Json | null
          dimension_uom?: string | null
          gl_cogs_account?: string | null
          gl_inventory_account?: string | null
          gl_revenue_account?: string | null
          has_expiry?: boolean | null
          height?: number | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          is_lot_tracked?: boolean | null
          is_serial_tracked?: boolean | null
          item_code?: string
          item_name?: string
          item_name_en?: string | null
          item_type?: string
          last_cost?: number | null
          lead_time_days?: number | null
          length?: number | null
          max_stock?: number | null
          min_stock?: number | null
          notes?: string | null
          preferred_vendor_id?: string | null
          reorder_point?: number | null
          reorder_qty?: number | null
          safety_stock?: number | null
          selling_price?: number | null
          shelf_life_days?: number | null
          sku?: string | null
          standard_cost?: number | null
          subcategory?: string | null
          tags?: string[] | null
          tenant_id?: string | null
          uom?: string
          uom_conversion?: number | null
          uom_purchase?: string | null
          updated_at?: string | null
          weight?: number | null
          weight_uom?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inv_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      inv_locations: {
        Row: {
          aisle: string | null
          bin: string | null
          id: string
          is_active: boolean | null
          location_code: string
          location_type: string | null
          max_volume: number | null
          max_weight: number | null
          rack: string | null
          shelf: string | null
          warehouse_id: string
          zone: string | null
        }
        Insert: {
          aisle?: string | null
          bin?: string | null
          id?: string
          is_active?: boolean | null
          location_code: string
          location_type?: string | null
          max_volume?: number | null
          max_weight?: number | null
          rack?: string | null
          shelf?: string | null
          warehouse_id: string
          zone?: string | null
        }
        Update: {
          aisle?: string | null
          bin?: string | null
          id?: string
          is_active?: boolean | null
          location_code?: string
          location_type?: string | null
          max_volume?: number | null
          max_weight?: number | null
          rack?: string | null
          shelf?: string | null
          warehouse_id?: string
          zone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inv_locations_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "inv_warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      inv_stock: {
        Row: {
          expiry_date: string | null
          id: string
          item_id: string
          last_count_date: string | null
          location_id: string | null
          lot_number: string | null
          quantity_on_hand: number | null
          quantity_reserved: number | null
          serial_number: string | null
          tenant_id: string | null
          unit_cost: number | null
          updated_at: string | null
          warehouse_id: string
        }
        Insert: {
          expiry_date?: string | null
          id?: string
          item_id: string
          last_count_date?: string | null
          location_id?: string | null
          lot_number?: string | null
          quantity_on_hand?: number | null
          quantity_reserved?: number | null
          serial_number?: string | null
          tenant_id?: string | null
          unit_cost?: number | null
          updated_at?: string | null
          warehouse_id: string
        }
        Update: {
          expiry_date?: string | null
          id?: string
          item_id?: string
          last_count_date?: string | null
          location_id?: string | null
          lot_number?: string | null
          quantity_on_hand?: number | null
          quantity_reserved?: number | null
          serial_number?: string | null
          tenant_id?: string | null
          unit_cost?: number | null
          updated_at?: string | null
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inv_stock_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inv_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_stock_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "inv_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_stock_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_stock_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "inv_warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      inv_transactions: {
        Row: {
          created_at: string | null
          created_by: string | null
          from_location_id: string | null
          from_warehouse_id: string | null
          id: string
          item_id: string
          lot_number: string | null
          notes: string | null
          quantity: number
          reason: string | null
          reference_id: string | null
          reference_type: string | null
          serial_number: string | null
          tenant_id: string | null
          to_location_id: string | null
          to_warehouse_id: string | null
          total_cost: number | null
          transaction_date: string
          transaction_number: string
          transaction_type: string
          unit_cost: number | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          from_location_id?: string | null
          from_warehouse_id?: string | null
          id?: string
          item_id: string
          lot_number?: string | null
          notes?: string | null
          quantity: number
          reason?: string | null
          reference_id?: string | null
          reference_type?: string | null
          serial_number?: string | null
          tenant_id?: string | null
          to_location_id?: string | null
          to_warehouse_id?: string | null
          total_cost?: number | null
          transaction_date?: string
          transaction_number: string
          transaction_type: string
          unit_cost?: number | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          from_location_id?: string | null
          from_warehouse_id?: string | null
          id?: string
          item_id?: string
          lot_number?: string | null
          notes?: string | null
          quantity?: number
          reason?: string | null
          reference_id?: string | null
          reference_type?: string | null
          serial_number?: string | null
          tenant_id?: string | null
          to_location_id?: string | null
          to_warehouse_id?: string | null
          total_cost?: number | null
          transaction_date?: string
          transaction_number?: string
          transaction_type?: string
          unit_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inv_transactions_from_location_id_fkey"
            columns: ["from_location_id"]
            isOneToOne: false
            referencedRelation: "inv_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_transactions_from_warehouse_id_fkey"
            columns: ["from_warehouse_id"]
            isOneToOne: false
            referencedRelation: "inv_warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_transactions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inv_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_transactions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_transactions_to_location_id_fkey"
            columns: ["to_location_id"]
            isOneToOne: false
            referencedRelation: "inv_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_transactions_to_warehouse_id_fkey"
            columns: ["to_warehouse_id"]
            isOneToOne: false
            referencedRelation: "inv_warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      inv_warehouses: {
        Row: {
          address: string | null
          city: string | null
          country: string | null
          created_at: string | null
          email: string | null
          id: string
          is_active: boolean | null
          manager: string | null
          phone: string | null
          state: string | null
          tenant_id: string | null
          warehouse_code: string
          warehouse_name: string
          warehouse_type: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          manager?: string | null
          phone?: string | null
          state?: string | null
          tenant_id?: string | null
          warehouse_code: string
          warehouse_name: string
          warehouse_type?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          manager?: string | null
          phone?: string | null
          state?: string | null
          tenant_id?: string | null
          warehouse_code?: string
          warehouse_name?: string
          warehouse_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inv_warehouses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory: {
        Row: {
          category: string | null
          cost_per_unit: number | null
          id: number
          last_restock_date: string | null
          location: string | null
          min_quantity: number | null
          name: string
          quantity: number | null
          supplier_name: string | null
          unit: string | null
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          cost_per_unit?: number | null
          id?: number
          last_restock_date?: string | null
          location?: string | null
          min_quantity?: number | null
          name: string
          quantity?: number | null
          supplier_name?: string | null
          unit?: string | null
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          cost_per_unit?: number | null
          id?: number
          last_restock_date?: string | null
          location?: string | null
          min_quantity?: number | null
          name?: string
          quantity?: number | null
          supplier_name?: string | null
          unit?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      invoices: {
        Row: {
          amount: number | null
          created_at: string | null
          currency: string | null
          due_date: string | null
          id: string
          invoice_number: string | null
          items: Json | null
          paid_at: string | null
          status: string | null
          user_id: string | null
        }
        Insert: {
          amount?: number | null
          created_at?: string | null
          currency?: string | null
          due_date?: string | null
          id: string
          invoice_number?: string | null
          items?: Json | null
          paid_at?: string | null
          status?: string | null
          user_id?: string | null
        }
        Update: {
          amount?: number | null
          created_at?: string | null
          currency?: string | null
          due_date?: string | null
          id?: string
          invoice_number?: string | null
          items?: Json | null
          paid_at?: string | null
          status?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      knowledge_base: {
        Row: {
          author_id: string | null
          category: string | null
          content: string | null
          created_at: string | null
          helpful_votes: number | null
          id: string
          published: boolean | null
          tags: Json | null
          title: string | null
          updated_at: string | null
          views: number | null
        }
        Insert: {
          author_id?: string | null
          category?: string | null
          content?: string | null
          created_at?: string | null
          helpful_votes?: number | null
          id: string
          published?: boolean | null
          tags?: Json | null
          title?: string | null
          updated_at?: string | null
          views?: number | null
        }
        Update: {
          author_id?: string | null
          category?: string | null
          content?: string | null
          created_at?: string | null
          helpful_votes?: number | null
          id?: string
          published?: boolean | null
          tags?: Json | null
          title?: string | null
          updated_at?: string | null
          views?: number | null
        }
        Relationships: []
      }
      legal_cases: {
        Row: {
          assigned_attorney: string | null
          billing_type: string | null
          case_name: string
          case_number: string
          case_type: string | null
          client_email: string | null
          client_name: string | null
          client_phone: string | null
          court: string | null
          created_at: string | null
          estimated_value: number | null
          filing_date: string | null
          hearing_date: string | null
          id: string
          judge: string | null
          notes: string | null
          opposing_party: string | null
          practice_area: string | null
          retainer_amount: number | null
          status: string | null
          statute_of_limitations: string | null
          tags: string[] | null
          tenant_id: string | null
        }
        Insert: {
          assigned_attorney?: string | null
          billing_type?: string | null
          case_name: string
          case_number: string
          case_type?: string | null
          client_email?: string | null
          client_name?: string | null
          client_phone?: string | null
          court?: string | null
          created_at?: string | null
          estimated_value?: number | null
          filing_date?: string | null
          hearing_date?: string | null
          id?: string
          judge?: string | null
          notes?: string | null
          opposing_party?: string | null
          practice_area?: string | null
          retainer_amount?: number | null
          status?: string | null
          statute_of_limitations?: string | null
          tags?: string[] | null
          tenant_id?: string | null
        }
        Update: {
          assigned_attorney?: string | null
          billing_type?: string | null
          case_name?: string
          case_number?: string
          case_type?: string | null
          client_email?: string | null
          client_name?: string | null
          client_phone?: string | null
          court?: string | null
          created_at?: string | null
          estimated_value?: number | null
          filing_date?: string | null
          hearing_date?: string | null
          id?: string
          judge?: string | null
          notes?: string | null
          opposing_party?: string | null
          practice_area?: string | null
          retainer_amount?: number | null
          status?: string | null
          statute_of_limitations?: string | null
          tags?: string[] | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "legal_cases_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_contracts: {
        Row: {
          auto_renew: boolean | null
          contract_number: string
          contract_type: string | null
          created_at: string | null
          currency: string | null
          effective_date: string | null
          expiry_date: string | null
          file_url: string | null
          id: string
          notes: string | null
          party_a: string
          party_b: string
          renewal_notice_days: number | null
          signed_by_a: string | null
          signed_by_b: string | null
          signed_date: string | null
          status: string | null
          tags: string[] | null
          tenant_id: string | null
          title: string
          value: number | null
        }
        Insert: {
          auto_renew?: boolean | null
          contract_number: string
          contract_type?: string | null
          created_at?: string | null
          currency?: string | null
          effective_date?: string | null
          expiry_date?: string | null
          file_url?: string | null
          id?: string
          notes?: string | null
          party_a: string
          party_b: string
          renewal_notice_days?: number | null
          signed_by_a?: string | null
          signed_by_b?: string | null
          signed_date?: string | null
          status?: string | null
          tags?: string[] | null
          tenant_id?: string | null
          title: string
          value?: number | null
        }
        Update: {
          auto_renew?: boolean | null
          contract_number?: string
          contract_type?: string | null
          created_at?: string | null
          currency?: string | null
          effective_date?: string | null
          expiry_date?: string | null
          file_url?: string | null
          id?: string
          notes?: string | null
          party_a?: string
          party_b?: string
          renewal_notice_days?: number | null
          signed_by_a?: string | null
          signed_by_b?: string | null
          signed_date?: string | null
          status?: string | null
          tags?: string[] | null
          tenant_id?: string | null
          title?: string
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "legal_contracts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_documents: {
        Row: {
          case_id: string | null
          category: string | null
          created_at: string | null
          doc_name: string
          doc_type: string | null
          file_size: number | null
          file_url: string | null
          id: string
          notes: string | null
          tags: string[] | null
          tenant_id: string | null
          uploaded_by: string | null
          version: number | null
        }
        Insert: {
          case_id?: string | null
          category?: string | null
          created_at?: string | null
          doc_name: string
          doc_type?: string | null
          file_size?: number | null
          file_url?: string | null
          id?: string
          notes?: string | null
          tags?: string[] | null
          tenant_id?: string | null
          uploaded_by?: string | null
          version?: number | null
        }
        Update: {
          case_id?: string | null
          category?: string | null
          created_at?: string | null
          doc_name?: string
          doc_type?: string | null
          file_size?: number | null
          file_url?: string | null
          id?: string
          notes?: string | null
          tags?: string[] | null
          tenant_id?: string | null
          uploaded_by?: string | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "legal_documents_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "legal_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legal_documents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_time_entries: {
        Row: {
          amount: number | null
          attorney_id: string | null
          case_id: string
          created_at: string | null
          description: string
          entry_date: string
          hours: number
          id: string
          is_billable: boolean | null
          rate: number | null
          status: string | null
        }
        Insert: {
          amount?: number | null
          attorney_id?: string | null
          case_id: string
          created_at?: string | null
          description: string
          entry_date: string
          hours: number
          id?: string
          is_billable?: boolean | null
          rate?: number | null
          status?: string | null
        }
        Update: {
          amount?: number | null
          attorney_id?: string | null
          case_id?: string
          created_at?: string | null
          description?: string
          entry_date?: string
          hours?: number
          id?: string
          is_billable?: boolean | null
          rate?: number | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "legal_time_entries_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "legal_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      log_carriers: {
        Row: {
          api_key: string | null
          carrier_code: string
          carrier_name: string
          carrier_type: string | null
          contact_name: string | null
          created_at: string | null
          email: string | null
          id: string
          is_active: boolean | null
          phone: string | null
          services: Json | null
          tenant_id: string | null
          tracking_url_template: string | null
          website: string | null
        }
        Insert: {
          api_key?: string | null
          carrier_code: string
          carrier_name: string
          carrier_type?: string | null
          contact_name?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          phone?: string | null
          services?: Json | null
          tenant_id?: string | null
          tracking_url_template?: string | null
          website?: string | null
        }
        Update: {
          api_key?: string | null
          carrier_code?: string
          carrier_name?: string
          carrier_type?: string | null
          contact_name?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          phone?: string | null
          services?: Json | null
          tenant_id?: string | null
          tracking_url_template?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "log_carriers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      log_routes: {
        Row: {
          created_at: string | null
          distance_km: number | null
          driver_name: string | null
          estimated_time_hours: number | null
          id: string
          is_active: boolean | null
          route_name: string
          schedule: string | null
          stops: Json | null
          tenant_id: string | null
          vehicle: string | null
        }
        Insert: {
          created_at?: string | null
          distance_km?: number | null
          driver_name?: string | null
          estimated_time_hours?: number | null
          id?: string
          is_active?: boolean | null
          route_name: string
          schedule?: string | null
          stops?: Json | null
          tenant_id?: string | null
          vehicle?: string | null
        }
        Update: {
          created_at?: string | null
          distance_km?: number | null
          driver_name?: string | null
          estimated_time_hours?: number | null
          id?: string
          is_active?: boolean | null
          route_name?: string
          schedule?: string | null
          stops?: Json | null
          tenant_id?: string | null
          vehicle?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "log_routes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      log_shipments: {
        Row: {
          actual_delivery: string | null
          carrier_name: string | null
          carrier_service: string | null
          created_at: string | null
          currency: string | null
          customer_id: string | null
          dest_address: string | null
          dest_city: string | null
          dest_country: string | null
          dimensions: string | null
          expected_delivery: string | null
          freight_cost: number | null
          id: string
          incoterm: string | null
          insurance_cost: number | null
          notes: string | null
          order_id: string | null
          origin_address: string | null
          origin_city: string | null
          origin_country: string | null
          package_count: number | null
          po_id: string | null
          ship_date: string | null
          shipment_number: string
          shipment_type: string | null
          status: string | null
          tenant_id: string | null
          tracking_number: string | null
          weight: number | null
          weight_uom: string | null
        }
        Insert: {
          actual_delivery?: string | null
          carrier_name?: string | null
          carrier_service?: string | null
          created_at?: string | null
          currency?: string | null
          customer_id?: string | null
          dest_address?: string | null
          dest_city?: string | null
          dest_country?: string | null
          dimensions?: string | null
          expected_delivery?: string | null
          freight_cost?: number | null
          id?: string
          incoterm?: string | null
          insurance_cost?: number | null
          notes?: string | null
          order_id?: string | null
          origin_address?: string | null
          origin_city?: string | null
          origin_country?: string | null
          package_count?: number | null
          po_id?: string | null
          ship_date?: string | null
          shipment_number: string
          shipment_type?: string | null
          status?: string | null
          tenant_id?: string | null
          tracking_number?: string | null
          weight?: number | null
          weight_uom?: string | null
        }
        Update: {
          actual_delivery?: string | null
          carrier_name?: string | null
          carrier_service?: string | null
          created_at?: string | null
          currency?: string | null
          customer_id?: string | null
          dest_address?: string | null
          dest_city?: string | null
          dest_country?: string | null
          dimensions?: string | null
          expected_delivery?: string | null
          freight_cost?: number | null
          id?: string
          incoterm?: string | null
          insurance_cost?: number | null
          notes?: string | null
          order_id?: string | null
          origin_address?: string | null
          origin_city?: string | null
          origin_country?: string | null
          package_count?: number | null
          po_id?: string | null
          ship_date?: string | null
          shipment_number?: string
          shipment_type?: string | null
          status?: string | null
          tenant_id?: string | null
          tracking_number?: string | null
          weight?: number | null
          weight_uom?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "log_shipments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      log_tracking_events: {
        Row: {
          city: string | null
          country: string | null
          description: string | null
          event_time: string
          event_type: string
          id: string
          location: string | null
          shipment_id: string
          status: string | null
        }
        Insert: {
          city?: string | null
          country?: string | null
          description?: string | null
          event_time: string
          event_type: string
          id?: string
          location?: string | null
          shipment_id: string
          status?: string | null
        }
        Update: {
          city?: string | null
          country?: string | null
          description?: string | null
          event_time?: string
          event_type?: string
          id?: string
          location?: string | null
          shipment_id?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "log_tracking_events_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "log_shipments"
            referencedColumns: ["id"]
          },
        ]
      }
      log_vehicles: {
        Row: {
          capacity_cbm: number | null
          capacity_kg: number | null
          created_at: string | null
          current_mileage: number | null
          driver_id: string | null
          fuel_type: string | null
          gps_device_id: string | null
          id: string
          insurance_expiry: string | null
          license_plate: string | null
          make: string | null
          model: string | null
          registration_expiry: string | null
          status: string | null
          tenant_id: string | null
          vehicle_number: string
          vehicle_type: string | null
          year: number | null
        }
        Insert: {
          capacity_cbm?: number | null
          capacity_kg?: number | null
          created_at?: string | null
          current_mileage?: number | null
          driver_id?: string | null
          fuel_type?: string | null
          gps_device_id?: string | null
          id?: string
          insurance_expiry?: string | null
          license_plate?: string | null
          make?: string | null
          model?: string | null
          registration_expiry?: string | null
          status?: string | null
          tenant_id?: string | null
          vehicle_number: string
          vehicle_type?: string | null
          year?: number | null
        }
        Update: {
          capacity_cbm?: number | null
          capacity_kg?: number | null
          created_at?: string | null
          current_mileage?: number | null
          driver_id?: string | null
          fuel_type?: string | null
          gps_device_id?: string | null
          id?: string
          insurance_expiry?: string | null
          license_plate?: string | null
          make?: string | null
          model?: string | null
          registration_expiry?: string | null
          status?: string | null
          tenant_id?: string | null
          vehicle_number?: string
          vehicle_type?: string | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "log_vehicles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_revenue: {
        Row: {
          amount: number | null
          buyer_id: string | null
          commission_amount: number | null
          commission_pct: number | null
          created_at: string | null
          currency: string | null
          id: string
          module_id: string | null
          seller_id: string | null
          status: string | null
        }
        Insert: {
          amount?: number | null
          buyer_id?: string | null
          commission_amount?: number | null
          commission_pct?: number | null
          created_at?: string | null
          currency?: string | null
          id: string
          module_id?: string | null
          seller_id?: string | null
          status?: string | null
        }
        Update: {
          amount?: number | null
          buyer_id?: string | null
          commission_amount?: number | null
          commission_pct?: number | null
          created_at?: string | null
          currency?: string | null
          id?: string
          module_id?: string | null
          seller_id?: string | null
          status?: string | null
        }
        Relationships: []
      }
      mfg_bom: {
        Row: {
          batch_size: number | null
          bom_code: string
          bom_name: string
          created_at: string | null
          effective_date: string | null
          expiry_date: string | null
          id: string
          notes: string | null
          product_id: string
          status: string | null
          tenant_id: string | null
          version: number | null
        }
        Insert: {
          batch_size?: number | null
          bom_code: string
          bom_name: string
          created_at?: string | null
          effective_date?: string | null
          expiry_date?: string | null
          id?: string
          notes?: string | null
          product_id: string
          status?: string | null
          tenant_id?: string | null
          version?: number | null
        }
        Update: {
          batch_size?: number | null
          bom_code?: string
          bom_name?: string
          created_at?: string | null
          effective_date?: string | null
          expiry_date?: string | null
          id?: string
          notes?: string | null
          product_id?: string
          status?: string | null
          tenant_id?: string | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "mfg_bom_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "mfg_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mfg_bom_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mfg_bom_lines: {
        Row: {
          bom_id: string
          component_item_id: string
          id: string
          is_critical: boolean | null
          line_number: number
          notes: string | null
          operation_number: number | null
          quantity_per: number
          scrap_rate: number | null
          substitute_item_id: string | null
          uom: string | null
        }
        Insert: {
          bom_id: string
          component_item_id: string
          id?: string
          is_critical?: boolean | null
          line_number: number
          notes?: string | null
          operation_number?: number | null
          quantity_per: number
          scrap_rate?: number | null
          substitute_item_id?: string | null
          uom?: string | null
        }
        Update: {
          bom_id?: string
          component_item_id?: string
          id?: string
          is_critical?: boolean | null
          line_number?: number
          notes?: string | null
          operation_number?: number | null
          quantity_per?: number
          scrap_rate?: number | null
          substitute_item_id?: string | null
          uom?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mfg_bom_lines_bom_id_fkey"
            columns: ["bom_id"]
            isOneToOne: false
            referencedRelation: "mfg_bom"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mfg_bom_lines_component_item_id_fkey"
            columns: ["component_item_id"]
            isOneToOne: false
            referencedRelation: "inv_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mfg_bom_lines_substitute_item_id_fkey"
            columns: ["substitute_item_id"]
            isOneToOne: false
            referencedRelation: "inv_items"
            referencedColumns: ["id"]
          },
        ]
      }
      mfg_maintenance_requests: {
        Row: {
          assigned_to: string | null
          completed_date: string | null
          cost: number | null
          created_at: string | null
          description: string
          downtime_hours: number | null
          equipment_name: string
          id: string
          maintenance_type: string | null
          parts_used: string | null
          priority: string | null
          reported_by: string | null
          request_number: string
          scheduled_date: string | null
          status: string | null
          tenant_id: string | null
          work_center_id: string | null
        }
        Insert: {
          assigned_to?: string | null
          completed_date?: string | null
          cost?: number | null
          created_at?: string | null
          description: string
          downtime_hours?: number | null
          equipment_name: string
          id?: string
          maintenance_type?: string | null
          parts_used?: string | null
          priority?: string | null
          reported_by?: string | null
          request_number: string
          scheduled_date?: string | null
          status?: string | null
          tenant_id?: string | null
          work_center_id?: string | null
        }
        Update: {
          assigned_to?: string | null
          completed_date?: string | null
          cost?: number | null
          created_at?: string | null
          description?: string
          downtime_hours?: number | null
          equipment_name?: string
          id?: string
          maintenance_type?: string | null
          parts_used?: string | null
          priority?: string | null
          reported_by?: string | null
          request_number?: string
          scheduled_date?: string | null
          status?: string | null
          tenant_id?: string | null
          work_center_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mfg_maintenance_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mfg_maintenance_requests_work_center_id_fkey"
            columns: ["work_center_id"]
            isOneToOne: false
            referencedRelation: "mfg_work_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      mfg_products: {
        Row: {
          category: string | null
          created_at: string | null
          default_bom_id: string | null
          default_routing_id: string | null
          family: string | null
          id: string
          image_url: string | null
          is_active: boolean | null
          item_id: string | null
          product_code: string
          product_name: string
          product_name_en: string | null
          product_type: string | null
          scrap_rate: number | null
          standard_batch_size: number | null
          tenant_id: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          default_bom_id?: string | null
          default_routing_id?: string | null
          family?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          item_id?: string | null
          product_code: string
          product_name: string
          product_name_en?: string | null
          product_type?: string | null
          scrap_rate?: number | null
          standard_batch_size?: number | null
          tenant_id?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          default_bom_id?: string | null
          default_routing_id?: string | null
          family?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          item_id?: string | null
          product_code?: string
          product_name?: string
          product_name_en?: string | null
          product_type?: string | null
          scrap_rate?: number | null
          standard_batch_size?: number | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mfg_products_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inv_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mfg_products_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mfg_quality_inspections: {
        Row: {
          corrective_action: string | null
          created_at: string | null
          failed_qty: number | null
          findings: string | null
          id: string
          inspected_qty: number | null
          inspection_date: string
          inspection_number: string
          inspection_type: string | null
          inspector_id: string | null
          item_id: string | null
          notes: string | null
          passed_qty: number | null
          reference_id: string | null
          reference_type: string | null
          result: string | null
          sample_size: number | null
          tenant_id: string | null
          work_order_id: string | null
        }
        Insert: {
          corrective_action?: string | null
          created_at?: string | null
          failed_qty?: number | null
          findings?: string | null
          id?: string
          inspected_qty?: number | null
          inspection_date?: string
          inspection_number: string
          inspection_type?: string | null
          inspector_id?: string | null
          item_id?: string | null
          notes?: string | null
          passed_qty?: number | null
          reference_id?: string | null
          reference_type?: string | null
          result?: string | null
          sample_size?: number | null
          tenant_id?: string | null
          work_order_id?: string | null
        }
        Update: {
          corrective_action?: string | null
          created_at?: string | null
          failed_qty?: number | null
          findings?: string | null
          id?: string
          inspected_qty?: number | null
          inspection_date?: string
          inspection_number?: string
          inspection_type?: string | null
          inspector_id?: string | null
          item_id?: string | null
          notes?: string | null
          passed_qty?: number | null
          reference_id?: string | null
          reference_type?: string | null
          result?: string | null
          sample_size?: number | null
          tenant_id?: string | null
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mfg_quality_inspections_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inv_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mfg_quality_inspections_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mfg_quality_inspections_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "mfg_work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      mfg_routing_operations: {
        Row: {
          id: string
          instructions: string | null
          is_quality_check: boolean | null
          move_time: number | null
          operation_name: string
          operation_number: number
          overlap_percent: number | null
          routing_id: string
          run_time_per_unit: number | null
          setup_time: number | null
          tooling: string | null
          wait_time: number | null
          work_center_id: string
        }
        Insert: {
          id?: string
          instructions?: string | null
          is_quality_check?: boolean | null
          move_time?: number | null
          operation_name: string
          operation_number: number
          overlap_percent?: number | null
          routing_id: string
          run_time_per_unit?: number | null
          setup_time?: number | null
          tooling?: string | null
          wait_time?: number | null
          work_center_id: string
        }
        Update: {
          id?: string
          instructions?: string | null
          is_quality_check?: boolean | null
          move_time?: number | null
          operation_name?: string
          operation_number?: number
          overlap_percent?: number | null
          routing_id?: string
          run_time_per_unit?: number | null
          setup_time?: number | null
          tooling?: string | null
          wait_time?: number | null
          work_center_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mfg_routing_operations_routing_id_fkey"
            columns: ["routing_id"]
            isOneToOne: false
            referencedRelation: "mfg_routings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mfg_routing_operations_work_center_id_fkey"
            columns: ["work_center_id"]
            isOneToOne: false
            referencedRelation: "mfg_work_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      mfg_routings: {
        Row: {
          created_at: string | null
          id: string
          notes: string | null
          product_id: string
          routing_code: string
          routing_name: string
          status: string | null
          tenant_id: string | null
          version: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          notes?: string | null
          product_id: string
          routing_code: string
          routing_name: string
          status?: string | null
          tenant_id?: string | null
          version?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          notes?: string | null
          product_id?: string
          routing_code?: string
          routing_name?: string
          status?: string | null
          tenant_id?: string | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "mfg_routings_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "mfg_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mfg_routings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mfg_wo_materials: {
        Row: {
          id: string
          issued_qty: number | null
          item_id: string
          lot_number: string | null
          required_qty: number
          returned_qty: number | null
          scrapped_qty: number | null
          status: string | null
          unit_cost: number | null
          warehouse_id: string | null
          work_order_id: string
        }
        Insert: {
          id?: string
          issued_qty?: number | null
          item_id: string
          lot_number?: string | null
          required_qty: number
          returned_qty?: number | null
          scrapped_qty?: number | null
          status?: string | null
          unit_cost?: number | null
          warehouse_id?: string | null
          work_order_id: string
        }
        Update: {
          id?: string
          issued_qty?: number | null
          item_id?: string
          lot_number?: string | null
          required_qty?: number
          returned_qty?: number | null
          scrapped_qty?: number | null
          status?: string | null
          unit_cost?: number | null
          warehouse_id?: string | null
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mfg_wo_materials_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inv_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mfg_wo_materials_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "inv_warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mfg_wo_materials_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "mfg_work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      mfg_wo_operations: {
        Row: {
          actual_hours: number | null
          completed_at: string | null
          good_quantity: number | null
          id: string
          notes: string | null
          operation_name: string
          operation_number: number
          operator_id: string | null
          planned_hours: number | null
          reject_quantity: number | null
          setup_hours: number | null
          started_at: string | null
          status: string | null
          work_center_id: string | null
          work_order_id: string
        }
        Insert: {
          actual_hours?: number | null
          completed_at?: string | null
          good_quantity?: number | null
          id?: string
          notes?: string | null
          operation_name: string
          operation_number: number
          operator_id?: string | null
          planned_hours?: number | null
          reject_quantity?: number | null
          setup_hours?: number | null
          started_at?: string | null
          status?: string | null
          work_center_id?: string | null
          work_order_id: string
        }
        Update: {
          actual_hours?: number | null
          completed_at?: string | null
          good_quantity?: number | null
          id?: string
          notes?: string | null
          operation_name?: string
          operation_number?: number
          operator_id?: string | null
          planned_hours?: number | null
          reject_quantity?: number | null
          setup_hours?: number | null
          started_at?: string | null
          status?: string | null
          work_center_id?: string | null
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mfg_wo_operations_work_center_id_fkey"
            columns: ["work_center_id"]
            isOneToOne: false
            referencedRelation: "mfg_work_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mfg_wo_operations_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "mfg_work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      mfg_work_centers: {
        Row: {
          capacity_hours: number | null
          center_code: string
          center_name: string
          center_type: string | null
          cost_per_hour: number | null
          created_at: string | null
          department: string | null
          efficiency_rate: number | null
          id: string
          is_active: boolean | null
          overhead_rate: number | null
          setup_cost: number | null
          tenant_id: string | null
        }
        Insert: {
          capacity_hours?: number | null
          center_code: string
          center_name: string
          center_type?: string | null
          cost_per_hour?: number | null
          created_at?: string | null
          department?: string | null
          efficiency_rate?: number | null
          id?: string
          is_active?: boolean | null
          overhead_rate?: number | null
          setup_cost?: number | null
          tenant_id?: string | null
        }
        Update: {
          capacity_hours?: number | null
          center_code?: string
          center_name?: string
          center_type?: string | null
          cost_per_hour?: number | null
          created_at?: string | null
          department?: string | null
          efficiency_rate?: number | null
          id?: string
          is_active?: boolean | null
          overhead_rate?: number | null
          setup_cost?: number | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mfg_work_centers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mfg_work_orders: {
        Row: {
          actual_cost: number | null
          actual_end: string | null
          actual_start: string | null
          bom_id: string | null
          completed_quantity: number | null
          created_at: string | null
          created_by: string | null
          customer_id: string | null
          id: string
          labor_cost: number | null
          material_cost: number | null
          notes: string | null
          overhead_cost: number | null
          planned_cost: number | null
          planned_end: string
          planned_quantity: number
          planned_start: string
          priority: string | null
          product_id: string
          routing_id: string | null
          sales_order_id: string | null
          scrapped_quantity: number | null
          status: string | null
          tenant_id: string | null
          updated_at: string | null
          variance: number | null
          warehouse_id: string | null
          wo_number: string
        }
        Insert: {
          actual_cost?: number | null
          actual_end?: string | null
          actual_start?: string | null
          bom_id?: string | null
          completed_quantity?: number | null
          created_at?: string | null
          created_by?: string | null
          customer_id?: string | null
          id?: string
          labor_cost?: number | null
          material_cost?: number | null
          notes?: string | null
          overhead_cost?: number | null
          planned_cost?: number | null
          planned_end: string
          planned_quantity: number
          planned_start: string
          priority?: string | null
          product_id: string
          routing_id?: string | null
          sales_order_id?: string | null
          scrapped_quantity?: number | null
          status?: string | null
          tenant_id?: string | null
          updated_at?: string | null
          variance?: number | null
          warehouse_id?: string | null
          wo_number: string
        }
        Update: {
          actual_cost?: number | null
          actual_end?: string | null
          actual_start?: string | null
          bom_id?: string | null
          completed_quantity?: number | null
          created_at?: string | null
          created_by?: string | null
          customer_id?: string | null
          id?: string
          labor_cost?: number | null
          material_cost?: number | null
          notes?: string | null
          overhead_cost?: number | null
          planned_cost?: number | null
          planned_end?: string
          planned_quantity?: number
          planned_start?: string
          priority?: string | null
          product_id?: string
          routing_id?: string | null
          sales_order_id?: string | null
          scrapped_quantity?: number | null
          status?: string | null
          tenant_id?: string | null
          updated_at?: string | null
          variance?: number | null
          warehouse_id?: string | null
          wo_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "mfg_work_orders_bom_id_fkey"
            columns: ["bom_id"]
            isOneToOne: false
            referencedRelation: "mfg_bom"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mfg_work_orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "mfg_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mfg_work_orders_routing_id_fkey"
            columns: ["routing_id"]
            isOneToOne: false
            referencedRelation: "mfg_routings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mfg_work_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mfg_work_orders_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "inv_warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      module_categories: {
        Row: {
          created_at: string | null
          description: string | null
          icon: string | null
          id: string
          is_active: boolean | null
          name: string | null
          parent_id: string | null
          slug: string | null
          sort_order: number | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id: string
          is_active?: boolean | null
          name?: string | null
          parent_id?: string | null
          slug?: string | null
          sort_order?: number | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name?: string | null
          parent_id?: string | null
          slug?: string | null
          sort_order?: number | null
        }
        Relationships: []
      }
      module_combinations: {
        Row: {
          created_at: string | null
          description_he: string | null
          discount_percent: number | null
          id: string
          module_keys: string[]
          name_en: string
          name_he: string
          target_profession: string | null
        }
        Insert: {
          created_at?: string | null
          description_he?: string | null
          discount_percent?: number | null
          id?: string
          module_keys: string[]
          name_en: string
          name_he: string
          target_profession?: string | null
        }
        Update: {
          created_at?: string | null
          description_he?: string | null
          discount_percent?: number | null
          id?: string
          module_keys?: string[]
          name_en?: string
          name_he?: string
          target_profession?: string | null
        }
        Relationships: []
      }
      module_profession_map: {
        Row: {
          id: string
          is_essential: boolean | null
          module_key: string
          profession_key: string
          recommendation_note_en: string | null
          recommendation_note_he: string | null
          relevance_score: number | null
        }
        Insert: {
          id?: string
          is_essential?: boolean | null
          module_key: string
          profession_key: string
          recommendation_note_en?: string | null
          recommendation_note_he?: string | null
          relevance_score?: number | null
        }
        Update: {
          id?: string
          is_essential?: boolean | null
          module_key?: string
          profession_key?: string
          recommendation_note_en?: string | null
          recommendation_note_he?: string | null
          relevance_score?: number | null
        }
        Relationships: []
      }
      module_reviews: {
        Row: {
          comment: string | null
          created_at: string | null
          id: string
          module_id: string | null
          rating: number | null
          user_id: string | null
        }
        Insert: {
          comment?: string | null
          created_at?: string | null
          id: string
          module_id?: string | null
          rating?: number | null
          user_id?: string | null
        }
        Update: {
          comment?: string | null
          created_at?: string | null
          id?: string
          module_id?: string | null
          rating?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      module_templates: {
        Row: {
          code_template: Json | null
          config_schema: Json | null
          created_at: string | null
          description: string | null
          id: string
          module_id: string | null
          name: string | null
          preview_url: string | null
        }
        Insert: {
          code_template?: Json | null
          config_schema?: Json | null
          created_at?: string | null
          description?: string | null
          id: string
          module_id?: string | null
          name?: string | null
          preview_url?: string | null
        }
        Update: {
          code_template?: Json | null
          config_schema?: Json | null
          created_at?: string | null
          description?: string | null
          id?: string
          module_id?: string | null
          name?: string | null
          preview_url?: string | null
        }
        Relationships: []
      }
      modules: {
        Row: {
          category: string
          complexity: string | null
          created_at: string | null
          description_en: string | null
          description_he: string | null
          icon: string | null
          id: string
          is_free: boolean | null
          key: string
          name_en: string
          name_he: string
          price_monthly: number | null
          profession_tags: string[] | null
          recommended_with: string[] | null
          status: string | null
          tags: string[] | null
        }
        Insert: {
          category: string
          complexity?: string | null
          created_at?: string | null
          description_en?: string | null
          description_he?: string | null
          icon?: string | null
          id?: string
          is_free?: boolean | null
          key: string
          name_en: string
          name_he: string
          price_monthly?: number | null
          profession_tags?: string[] | null
          recommended_with?: string[] | null
          status?: string | null
          tags?: string[] | null
        }
        Update: {
          category?: string
          complexity?: string | null
          created_at?: string | null
          description_en?: string | null
          description_he?: string | null
          icon?: string | null
          id?: string
          is_free?: boolean | null
          key?: string
          name_en?: string
          name_he?: string
          price_monthly?: number | null
          profession_tags?: string[] | null
          recommended_with?: string[] | null
          status?: string | null
          tags?: string[] | null
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          channels: Json | null
          created_at: string | null
          digest_frequency: string | null
          events: Json | null
          id: string
          quiet_hours: Json | null
          user_id: string | null
        }
        Insert: {
          channels?: Json | null
          created_at?: string | null
          digest_frequency?: string | null
          events?: Json | null
          id: string
          quiet_hours?: Json | null
          user_id?: string | null
        }
        Update: {
          channels?: Json | null
          created_at?: string | null
          digest_frequency?: string | null
          events?: Json | null
          id?: string
          quiet_hours?: Json | null
          user_id?: string | null
        }
        Relationships: []
      }
      order_items: {
        Row: {
          created_at: string | null
          depth_cm: number | null
          description: string | null
          height_cm: number | null
          id: number
          name: string
          notes: string | null
          order_id: number
          photo_urls: string[] | null
          product_id: number | null
          quantity: number | null
          total_price: number | null
          unit: string | null
          unit_price: number | null
          width_cm: number | null
        }
        Insert: {
          created_at?: string | null
          depth_cm?: number | null
          description?: string | null
          height_cm?: number | null
          id?: number
          name: string
          notes?: string | null
          order_id: number
          photo_urls?: string[] | null
          product_id?: number | null
          quantity?: number | null
          total_price?: number | null
          unit?: string | null
          unit_price?: number | null
          width_cm?: number | null
        }
        Update: {
          created_at?: string | null
          depth_cm?: number | null
          description?: string | null
          height_cm?: number | null
          id?: number
          name?: string
          notes?: string | null
          order_id?: number
          photo_urls?: string[] | null
          product_id?: number | null
          quantity?: number | null
          total_price?: number | null
          unit?: string | null
          unit_price?: number | null
          width_cm?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v_active_pipeline"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      order_status_history: {
        Row: {
          changed_at: string | null
          changed_by: string | null
          from_status: Database["public"]["Enums"]["order_status"] | null
          id: number
          note: string | null
          order_id: number
          to_status: Database["public"]["Enums"]["order_status"]
        }
        Insert: {
          changed_at?: string | null
          changed_by?: string | null
          from_status?: Database["public"]["Enums"]["order_status"] | null
          id?: number
          note?: string | null
          order_id: number
          to_status: Database["public"]["Enums"]["order_status"]
        }
        Update: {
          changed_at?: string | null
          changed_by?: string | null
          from_status?: Database["public"]["Enums"]["order_status"] | null
          id?: number
          note?: string | null
          order_id?: number
          to_status?: Database["public"]["Enums"]["order_status"]
        }
        Relationships: [
          {
            foreignKeyName: "order_status_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "v_active_pipeline"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          assigned_field_user_id: string | null
          created_at: string | null
          created_by: string | null
          currency: string | null
          customer_id: number
          deposit_paid: number | null
          description: string | null
          id: number
          installation_address: string | null
          installation_date: string | null
          order_number: string | null
          priority: number | null
          status: Database["public"]["Enums"]["order_status"]
          title: string
          total_price: number | null
          updated_at: string | null
        }
        Insert: {
          assigned_field_user_id?: string | null
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          customer_id: number
          deposit_paid?: number | null
          description?: string | null
          id?: number
          installation_address?: string | null
          installation_date?: string | null
          order_number?: string | null
          priority?: number | null
          status?: Database["public"]["Enums"]["order_status"]
          title: string
          total_price?: number | null
          updated_at?: string | null
        }
        Update: {
          assigned_field_user_id?: string | null
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          customer_id?: number
          deposit_paid?: number | null
          description?: string | null
          id?: number
          installation_address?: string | null
          installation_date?: string | null
          order_number?: string | null
          priority?: number | null
          status?: Database["public"]["Enums"]["order_status"]
          title?: string
          total_price?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_assigned_field_user_id_fkey"
            columns: ["assigned_field_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_customer_value"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_metrics: {
        Row: {
          details: Json | null
          id: string
          measured_at: string | null
          metric_type: string | null
          project_id: string | null
          status: string | null
          threshold_critical: number | null
          threshold_warning: number | null
          unit: string | null
          value: number | null
        }
        Insert: {
          details?: Json | null
          id: string
          measured_at?: string | null
          metric_type?: string | null
          project_id?: string | null
          status?: string | null
          threshold_critical?: number | null
          threshold_warning?: number | null
          unit?: string | null
          value?: number | null
        }
        Update: {
          details?: Json | null
          id?: string
          measured_at?: string | null
          metric_type?: string | null
          project_id?: string | null
          status?: string | null
          threshold_critical?: number | null
          threshold_warning?: number | null
          unit?: string | null
          value?: number | null
        }
        Relationships: []
      }
      platform_api_keys: {
        Row: {
          created_at: string | null
          expires_at: string | null
          id: string
          is_active: boolean | null
          key_hash: string
          key_name: string
          key_prefix: string
          last_used_at: string | null
          org_id: string
          rate_limit_per_minute: number | null
          scopes: string[] | null
          usage_count: number | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          key_hash: string
          key_name: string
          key_prefix: string
          last_used_at?: string | null
          org_id: string
          rate_limit_per_minute?: number | null
          scopes?: string[] | null
          usage_count?: number | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          key_hash?: string
          key_name?: string
          key_prefix?: string
          last_used_at?: string | null
          org_id?: string
          rate_limit_per_minute?: number | null
          scopes?: string[] | null
          usage_count?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_api_keys_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "platform_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_api_keys_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "platform_users"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_invoices: {
        Row: {
          amount_due: number | null
          amount_paid: number | null
          created_at: string | null
          currency: string | null
          due_date: string | null
          id: string
          invoice_number: string
          line_items: Json | null
          org_id: string
          paid_at: string | null
          status: string | null
          subscription_id: string | null
        }
        Insert: {
          amount_due?: number | null
          amount_paid?: number | null
          created_at?: string | null
          currency?: string | null
          due_date?: string | null
          id?: string
          invoice_number: string
          line_items?: Json | null
          org_id: string
          paid_at?: string | null
          status?: string | null
          subscription_id?: string | null
        }
        Update: {
          amount_due?: number | null
          amount_paid?: number | null
          created_at?: string | null
          currency?: string | null
          due_date?: string | null
          id?: string
          invoice_number?: string
          line_items?: Json | null
          org_id?: string
          paid_at?: string | null
          status?: string | null
          subscription_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_invoices_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "platform_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_invoices_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "platform_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_metrics_daily: {
        Row: {
          active_end_users: number | null
          active_users: number | null
          api_calls: number | null
          created_at: string | null
          custom_metrics: Json | null
          id: string
          metric_date: string
          new_end_users: number | null
          new_users: number | null
          orders_count: number | null
          org_id: string
          revenue: number | null
          total_events: number | null
          total_sessions: number | null
        }
        Insert: {
          active_end_users?: number | null
          active_users?: number | null
          api_calls?: number | null
          created_at?: string | null
          custom_metrics?: Json | null
          id?: string
          metric_date: string
          new_end_users?: number | null
          new_users?: number | null
          orders_count?: number | null
          org_id: string
          revenue?: number | null
          total_events?: number | null
          total_sessions?: number | null
        }
        Update: {
          active_end_users?: number | null
          active_users?: number | null
          api_calls?: number | null
          created_at?: string | null
          custom_metrics?: Json | null
          id?: string
          metric_date?: string
          new_end_users?: number | null
          new_users?: number | null
          orders_count?: number | null
          org_id?: string
          revenue?: number | null
          total_events?: number | null
          total_sessions?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_metrics_daily_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "platform_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_metrics_global: {
        Row: {
          active_orgs: number | null
          created_at: string | null
          id: string
          metric_date: string
          total_api_calls: number | null
          total_end_users: number | null
          total_orgs: number | null
          total_revenue: number | null
        }
        Insert: {
          active_orgs?: number | null
          created_at?: string | null
          id?: string
          metric_date: string
          total_api_calls?: number | null
          total_end_users?: number | null
          total_orgs?: number | null
          total_revenue?: number | null
        }
        Update: {
          active_orgs?: number | null
          created_at?: string | null
          id?: string
          metric_date?: string
          total_api_calls?: number | null
          total_end_users?: number | null
          total_orgs?: number | null
          total_revenue?: number | null
        }
        Relationships: []
      }
      platform_modules: {
        Row: {
          category: string | null
          color: string | null
          created_at: string | null
          description: string | null
          icon: string | null
          id: string
          is_active: boolean | null
          is_beta: boolean | null
          module_code: string
          module_name: string
          module_name_en: string | null
          price_per_month: number | null
          sort_order: number | null
          version: string | null
        }
        Insert: {
          category?: string | null
          color?: string | null
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          is_beta?: boolean | null
          module_code: string
          module_name: string
          module_name_en?: string | null
          price_per_month?: number | null
          sort_order?: number | null
          version?: string | null
        }
        Update: {
          category?: string | null
          color?: string | null
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          is_beta?: boolean | null
          module_code?: string
          module_name?: string
          module_name_en?: string | null
          price_per_month?: number | null
          sort_order?: number | null
          version?: string | null
        }
        Relationships: []
      }
      platform_notifications: {
        Row: {
          action_url: string | null
          body: string | null
          created_at: string | null
          expires_at: string | null
          id: string
          is_read: boolean | null
          org_id: string | null
          read_at: string | null
          title: string
          type: string | null
          user_id: string | null
        }
        Insert: {
          action_url?: string | null
          body?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_read?: boolean | null
          org_id?: string | null
          read_at?: string | null
          title: string
          type?: string | null
          user_id?: string | null
        }
        Update: {
          action_url?: string | null
          body?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_read?: boolean | null
          org_id?: string | null
          read_at?: string | null
          title?: string
          type?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_notifications_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "platform_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "platform_users"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_org_modules: {
        Row: {
          activated_at: string | null
          expires_at: string | null
          id: string
          is_active: boolean | null
          module_id: string
          org_id: string
          settings: Json | null
        }
        Insert: {
          activated_at?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          module_id: string
          org_id: string
          settings?: Json | null
        }
        Update: {
          activated_at?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          module_id?: string
          org_id?: string
          settings?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_org_modules_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "platform_modules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_org_modules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "platform_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_organizations: {
        Row: {
          address: Json | null
          country: string | null
          created_at: string | null
          currency: string | null
          current_end_users: number | null
          current_users: number | null
          email: string | null
          id: string
          industry: string | null
          legal_name: string | null
          locale: string | null
          logo_url: string | null
          max_end_users: number | null
          max_users: number | null
          metadata: Json | null
          onboarding_completed: boolean | null
          onboarding_step: number | null
          org_code: string
          org_name: string
          org_name_en: string | null
          org_type: string | null
          phone: string | null
          plan_expires_at: string | null
          plan_id: string | null
          plan_started_at: string | null
          settings: Json | null
          status: string | null
          storage_used_gb: number | null
          timezone: string | null
          trial_ends_at: string | null
          updated_at: string | null
          website: string | null
        }
        Insert: {
          address?: Json | null
          country?: string | null
          created_at?: string | null
          currency?: string | null
          current_end_users?: number | null
          current_users?: number | null
          email?: string | null
          id?: string
          industry?: string | null
          legal_name?: string | null
          locale?: string | null
          logo_url?: string | null
          max_end_users?: number | null
          max_users?: number | null
          metadata?: Json | null
          onboarding_completed?: boolean | null
          onboarding_step?: number | null
          org_code: string
          org_name: string
          org_name_en?: string | null
          org_type?: string | null
          phone?: string | null
          plan_expires_at?: string | null
          plan_id?: string | null
          plan_started_at?: string | null
          settings?: Json | null
          status?: string | null
          storage_used_gb?: number | null
          timezone?: string | null
          trial_ends_at?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          address?: Json | null
          country?: string | null
          created_at?: string | null
          currency?: string | null
          current_end_users?: number | null
          current_users?: number | null
          email?: string | null
          id?: string
          industry?: string | null
          legal_name?: string | null
          locale?: string | null
          logo_url?: string | null
          max_end_users?: number | null
          max_users?: number | null
          metadata?: Json | null
          onboarding_completed?: boolean | null
          onboarding_step?: number | null
          org_code?: string
          org_name?: string
          org_name_en?: string | null
          org_type?: string | null
          phone?: string | null
          plan_expires_at?: string | null
          plan_id?: string | null
          plan_started_at?: string | null
          settings?: Json | null
          status?: string | null
          storage_used_gb?: number | null
          timezone?: string | null
          trial_ends_at?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_organizations_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "platform_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_plans: {
        Row: {
          created_at: string | null
          currency: string | null
          description: string | null
          features: Json | null
          id: string
          is_active: boolean | null
          is_custom: boolean | null
          max_api_calls_day: number | null
          max_end_users: number | null
          max_storage_gb: number | null
          max_users: number | null
          plan_code: string
          plan_name: string
          plan_name_en: string | null
          price_monthly: number | null
          price_yearly: number | null
        }
        Insert: {
          created_at?: string | null
          currency?: string | null
          description?: string | null
          features?: Json | null
          id?: string
          is_active?: boolean | null
          is_custom?: boolean | null
          max_api_calls_day?: number | null
          max_end_users?: number | null
          max_storage_gb?: number | null
          max_users?: number | null
          plan_code: string
          plan_name: string
          plan_name_en?: string | null
          price_monthly?: number | null
          price_yearly?: number | null
        }
        Update: {
          created_at?: string | null
          currency?: string | null
          description?: string | null
          features?: Json | null
          id?: string
          is_active?: boolean | null
          is_custom?: boolean | null
          max_api_calls_day?: number | null
          max_end_users?: number | null
          max_storage_gb?: number | null
          max_users?: number | null
          plan_code?: string
          plan_name?: string
          plan_name_en?: string | null
          price_monthly?: number | null
          price_yearly?: number | null
        }
        Relationships: []
      }
      platform_subscriptions: {
        Row: {
          amount: number | null
          billing_cycle: string | null
          cancelled_at: string | null
          created_at: string | null
          currency: string | null
          current_period_end: string | null
          current_period_start: string | null
          id: string
          metadata: Json | null
          org_id: string
          plan_id: string | null
          started_at: string | null
          status: string | null
          trial_end: string | null
          updated_at: string | null
        }
        Insert: {
          amount?: number | null
          billing_cycle?: string | null
          cancelled_at?: string | null
          created_at?: string | null
          currency?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          metadata?: Json | null
          org_id: string
          plan_id?: string | null
          started_at?: string | null
          status?: string | null
          trial_end?: string | null
          updated_at?: string | null
        }
        Update: {
          amount?: number | null
          billing_cycle?: string | null
          cancelled_at?: string | null
          created_at?: string | null
          currency?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          metadata?: Json | null
          org_id?: string
          plan_id?: string | null
          started_at?: string | null
          status?: string | null
          trial_end?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_subscriptions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "platform_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "platform_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_users: {
        Row: {
          auth_user_id: string | null
          avatar_url: string | null
          created_at: string | null
          department: string | null
          display_name: string | null
          email: string
          first_name: string | null
          id: string
          is_active: boolean | null
          is_verified: boolean | null
          language: string | null
          last_login_at: string | null
          last_name: string | null
          login_count: number | null
          mfa_enabled: boolean | null
          org_id: string
          permissions: Json | null
          phone: string | null
          preferences: Json | null
          role: string | null
          timezone: string | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          auth_user_id?: string | null
          avatar_url?: string | null
          created_at?: string | null
          department?: string | null
          display_name?: string | null
          email: string
          first_name?: string | null
          id?: string
          is_active?: boolean | null
          is_verified?: boolean | null
          language?: string | null
          last_login_at?: string | null
          last_name?: string | null
          login_count?: number | null
          mfa_enabled?: boolean | null
          org_id: string
          permissions?: Json | null
          phone?: string | null
          preferences?: Json | null
          role?: string | null
          timezone?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          auth_user_id?: string | null
          avatar_url?: string | null
          created_at?: string | null
          department?: string | null
          display_name?: string | null
          email?: string
          first_name?: string | null
          id?: string
          is_active?: boolean | null
          is_verified?: boolean | null
          language?: string | null
          last_login_at?: string | null
          last_name?: string | null
          login_count?: number | null
          mfa_enabled?: boolean | null
          org_id?: string
          permissions?: Json | null
          phone?: string | null
          preferences?: Json | null
          role?: string | null
          timezone?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_users_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "platform_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_webhooks: {
        Row: {
          created_at: string | null
          events: string[] | null
          failure_count: number | null
          id: string
          is_active: boolean | null
          name: string
          org_id: string
          retry_count: number | null
          success_count: number | null
          url: string
        }
        Insert: {
          created_at?: string | null
          events?: string[] | null
          failure_count?: number | null
          id?: string
          is_active?: boolean | null
          name: string
          org_id: string
          retry_count?: number | null
          success_count?: number | null
          url: string
        }
        Update: {
          created_at?: string | null
          events?: string[] | null
          failure_count?: number | null
          id?: string
          is_active?: boolean | null
          name?: string
          org_id?: string
          retry_count?: number | null
          success_count?: number | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_webhooks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "platform_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_milestones: {
        Row: {
          billing_amount: number | null
          completed_date: string | null
          deliverables: string | null
          due_date: string | null
          id: string
          milestone_name: string
          project_id: string
          status: string | null
        }
        Insert: {
          billing_amount?: number | null
          completed_date?: string | null
          deliverables?: string | null
          due_date?: string | null
          id?: string
          milestone_name: string
          project_id: string
          status?: string | null
        }
        Update: {
          billing_amount?: number | null
          completed_date?: string | null
          deliverables?: string | null
          due_date?: string | null
          id?: string
          milestone_name?: string
          project_id?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pm_milestones_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "pm_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_projects: {
        Row: {
          actual_cost: number | null
          actual_end: string | null
          budget: number | null
          client_id: string | null
          completion_percent: number | null
          created_at: string | null
          custom_fields: Json | null
          description: string | null
          end_date: string | null
          health: string | null
          id: string
          manager_id: string | null
          priority: string | null
          project_code: string
          project_name: string
          project_type: string | null
          start_date: string | null
          status: string | null
          tags: string[] | null
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          actual_cost?: number | null
          actual_end?: string | null
          budget?: number | null
          client_id?: string | null
          completion_percent?: number | null
          created_at?: string | null
          custom_fields?: Json | null
          description?: string | null
          end_date?: string | null
          health?: string | null
          id?: string
          manager_id?: string | null
          priority?: string | null
          project_code: string
          project_name: string
          project_type?: string | null
          start_date?: string | null
          status?: string | null
          tags?: string[] | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          actual_cost?: number | null
          actual_end?: string | null
          budget?: number | null
          client_id?: string | null
          completion_percent?: number | null
          created_at?: string | null
          custom_fields?: Json | null
          description?: string | null
          end_date?: string | null
          health?: string | null
          id?: string
          manager_id?: string | null
          priority?: string | null
          project_code?: string
          project_name?: string
          project_type?: string | null
          start_date?: string | null
          status?: string | null
          tags?: string[] | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pm_projects_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_tasks: {
        Row: {
          actual_hours: number | null
          assigned_to: string | null
          completed_date: string | null
          created_at: string | null
          description: string | null
          due_date: string | null
          estimated_hours: number | null
          id: string
          parent_task_id: string | null
          priority: string | null
          project_id: string
          start_date: string | null
          status: string | null
          tags: string[] | null
          task_name: string
          task_number: string | null
        }
        Insert: {
          actual_hours?: number | null
          assigned_to?: string | null
          completed_date?: string | null
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          estimated_hours?: number | null
          id?: string
          parent_task_id?: string | null
          priority?: string | null
          project_id: string
          start_date?: string | null
          status?: string | null
          tags?: string[] | null
          task_name: string
          task_number?: string | null
        }
        Update: {
          actual_hours?: number | null
          assigned_to?: string | null
          completed_date?: string | null
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          estimated_hours?: number | null
          id?: string
          parent_task_id?: string | null
          priority?: string | null
          project_id?: string
          start_date?: string | null
          status?: string | null
          tags?: string[] | null
          task_name?: string
          task_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pm_tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "pm_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "pm_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_time_entries: {
        Row: {
          billing_rate: number | null
          created_at: string | null
          description: string | null
          entry_date: string
          hours: number
          id: string
          is_billable: boolean | null
          project_id: string
          status: string | null
          task_id: string | null
          tenant_id: string | null
          user_id: string | null
        }
        Insert: {
          billing_rate?: number | null
          created_at?: string | null
          description?: string | null
          entry_date: string
          hours: number
          id?: string
          is_billable?: boolean | null
          project_id: string
          status?: string | null
          task_id?: string | null
          tenant_id?: string | null
          user_id?: string | null
        }
        Update: {
          billing_rate?: number | null
          created_at?: string | null
          description?: string | null
          entry_date?: string
          hours?: number
          id?: string
          is_billable?: boolean | null
          project_id?: string
          status?: string | null
          task_id?: string | null
          tenant_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pm_time_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "pm_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_time_entries_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "pm_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_time_entries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      proc_goods_receipts: {
        Row: {
          created_at: string | null
          grn_number: string
          id: string
          inspected_by: string | null
          notes: string | null
          po_id: string
          receipt_date: string
          received_by: string | null
          status: string | null
          tenant_id: string | null
          vendor_id: string
          warehouse_id: string
        }
        Insert: {
          created_at?: string | null
          grn_number: string
          id?: string
          inspected_by?: string | null
          notes?: string | null
          po_id: string
          receipt_date: string
          received_by?: string | null
          status?: string | null
          tenant_id?: string | null
          vendor_id: string
          warehouse_id: string
        }
        Update: {
          created_at?: string | null
          grn_number?: string
          id?: string
          inspected_by?: string | null
          notes?: string | null
          po_id?: string
          receipt_date?: string
          received_by?: string | null
          status?: string | null
          tenant_id?: string | null
          vendor_id?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "proc_goods_receipts_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "proc_purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proc_goods_receipts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proc_goods_receipts_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "ap_vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proc_goods_receipts_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "inv_warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      proc_grn_lines: {
        Row: {
          accepted_qty: number | null
          description: string | null
          expiry_date: string | null
          grn_id: string
          id: string
          item_id: string | null
          location_id: string | null
          lot_number: string | null
          ordered_qty: number | null
          po_line_id: string | null
          received_qty: number
          rejected_qty: number | null
          rejection_reason: string | null
          serial_number: string | null
          unit_cost: number | null
        }
        Insert: {
          accepted_qty?: number | null
          description?: string | null
          expiry_date?: string | null
          grn_id: string
          id?: string
          item_id?: string | null
          location_id?: string | null
          lot_number?: string | null
          ordered_qty?: number | null
          po_line_id?: string | null
          received_qty: number
          rejected_qty?: number | null
          rejection_reason?: string | null
          serial_number?: string | null
          unit_cost?: number | null
        }
        Update: {
          accepted_qty?: number | null
          description?: string | null
          expiry_date?: string | null
          grn_id?: string
          id?: string
          item_id?: string | null
          location_id?: string | null
          lot_number?: string | null
          ordered_qty?: number | null
          po_line_id?: string | null
          received_qty?: number
          rejected_qty?: number | null
          rejection_reason?: string | null
          serial_number?: string | null
          unit_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "proc_grn_lines_grn_id_fkey"
            columns: ["grn_id"]
            isOneToOne: false
            referencedRelation: "proc_goods_receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proc_grn_lines_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inv_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proc_grn_lines_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "inv_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proc_grn_lines_po_line_id_fkey"
            columns: ["po_line_id"]
            isOneToOne: false
            referencedRelation: "proc_po_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      proc_po_lines: {
        Row: {
          cost_center: string | null
          delivery_date: string | null
          description: string
          discount_percent: number | null
          gl_account_id: string | null
          id: string
          item_id: string | null
          line_number: number
          line_total: number
          po_id: string
          project: string | null
          quantity: number
          quantity_invoiced: number | null
          quantity_received: number | null
          tax_rate: number | null
          unit_price: number
          uom: string | null
        }
        Insert: {
          cost_center?: string | null
          delivery_date?: string | null
          description: string
          discount_percent?: number | null
          gl_account_id?: string | null
          id?: string
          item_id?: string | null
          line_number: number
          line_total: number
          po_id: string
          project?: string | null
          quantity: number
          quantity_invoiced?: number | null
          quantity_received?: number | null
          tax_rate?: number | null
          unit_price: number
          uom?: string | null
        }
        Update: {
          cost_center?: string | null
          delivery_date?: string | null
          description?: string
          discount_percent?: number | null
          gl_account_id?: string | null
          id?: string
          item_id?: string | null
          line_number?: number
          line_total?: number
          po_id?: string
          project?: string | null
          quantity?: number
          quantity_invoiced?: number | null
          quantity_received?: number | null
          tax_rate?: number | null
          unit_price?: number
          uom?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proc_po_lines_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inv_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proc_po_lines_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "proc_purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      proc_purchase_orders: {
        Row: {
          acknowledged_at: string | null
          approved_at: string | null
          approved_by: string | null
          attachment_url: string | null
          created_at: string | null
          created_by: string | null
          currency: string | null
          delivery_date: string | null
          exchange_rate: number | null
          id: string
          incoterms: string | null
          notes: string | null
          payment_terms: string | null
          po_date: string
          po_number: string
          requisition_id: string | null
          sent_at: string | null
          ship_to_warehouse_id: string | null
          shipping_amount: number | null
          status: string | null
          subtotal: number | null
          tax_amount: number | null
          tenant_id: string | null
          total_amount: number | null
          updated_at: string | null
          vendor_id: string
        }
        Insert: {
          acknowledged_at?: string | null
          approved_at?: string | null
          approved_by?: string | null
          attachment_url?: string | null
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          delivery_date?: string | null
          exchange_rate?: number | null
          id?: string
          incoterms?: string | null
          notes?: string | null
          payment_terms?: string | null
          po_date: string
          po_number: string
          requisition_id?: string | null
          sent_at?: string | null
          ship_to_warehouse_id?: string | null
          shipping_amount?: number | null
          status?: string | null
          subtotal?: number | null
          tax_amount?: number | null
          tenant_id?: string | null
          total_amount?: number | null
          updated_at?: string | null
          vendor_id: string
        }
        Update: {
          acknowledged_at?: string | null
          approved_at?: string | null
          approved_by?: string | null
          attachment_url?: string | null
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          delivery_date?: string | null
          exchange_rate?: number | null
          id?: string
          incoterms?: string | null
          notes?: string | null
          payment_terms?: string | null
          po_date?: string
          po_number?: string
          requisition_id?: string | null
          sent_at?: string | null
          ship_to_warehouse_id?: string | null
          shipping_amount?: number | null
          status?: string | null
          subtotal?: number | null
          tax_amount?: number | null
          tenant_id?: string | null
          total_amount?: number | null
          updated_at?: string | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "proc_purchase_orders_requisition_id_fkey"
            columns: ["requisition_id"]
            isOneToOne: false
            referencedRelation: "proc_requisitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proc_purchase_orders_ship_to_warehouse_id_fkey"
            columns: ["ship_to_warehouse_id"]
            isOneToOne: false
            referencedRelation: "inv_warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proc_purchase_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proc_purchase_orders_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "ap_vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      proc_requisition_lines: {
        Row: {
          budget_code: string | null
          cost_center: string | null
          description: string
          estimated_price: number | null
          gl_account_id: string | null
          id: string
          item_id: string | null
          line_number: number
          needed_by: string | null
          preferred_vendor_id: string | null
          quantity: number
          requisition_id: string
          uom: string | null
        }
        Insert: {
          budget_code?: string | null
          cost_center?: string | null
          description: string
          estimated_price?: number | null
          gl_account_id?: string | null
          id?: string
          item_id?: string | null
          line_number: number
          needed_by?: string | null
          preferred_vendor_id?: string | null
          quantity: number
          requisition_id: string
          uom?: string | null
        }
        Update: {
          budget_code?: string | null
          cost_center?: string | null
          description?: string
          estimated_price?: number | null
          gl_account_id?: string | null
          id?: string
          item_id?: string | null
          line_number?: number
          needed_by?: string | null
          preferred_vendor_id?: string | null
          quantity?: number
          requisition_id?: string
          uom?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proc_requisition_lines_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inv_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proc_requisition_lines_preferred_vendor_id_fkey"
            columns: ["preferred_vendor_id"]
            isOneToOne: false
            referencedRelation: "ap_vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proc_requisition_lines_requisition_id_fkey"
            columns: ["requisition_id"]
            isOneToOne: false
            referencedRelation: "proc_requisitions"
            referencedColumns: ["id"]
          },
        ]
      }
      proc_requisitions: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string | null
          department: string | null
          id: string
          notes: string | null
          priority: string | null
          project: string | null
          req_date: string
          req_number: string
          requested_by: string | null
          status: string | null
          tenant_id: string | null
          total_amount: number | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          department?: string | null
          id?: string
          notes?: string | null
          priority?: string | null
          project?: string | null
          req_date: string
          req_number: string
          requested_by?: string | null
          status?: string | null
          tenant_id?: string | null
          total_amount?: number | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          department?: string | null
          id?: string
          notes?: string | null
          priority?: string | null
          project?: string | null
          req_date?: string
          req_number?: string
          requested_by?: string | null
          status?: string | null
          tenant_id?: string | null
          total_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "proc_requisitions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      proc_rfq: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          response_deadline: string | null
          rfq_date: string
          rfq_number: string
          status: string | null
          tenant_id: string | null
          title: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          response_deadline?: string | null
          rfq_date: string
          rfq_number: string
          status?: string | null
          tenant_id?: string | null
          title: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          response_deadline?: string | null
          rfq_date?: string
          rfq_number?: string
          status?: string | null
          tenant_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "proc_rfq_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      proc_rfq_items: {
        Row: {
          description: string
          id: string
          item_id: string | null
          quantity: number
          rfq_id: string
          target_price: number | null
          uom: string | null
        }
        Insert: {
          description: string
          id?: string
          item_id?: string | null
          quantity: number
          rfq_id: string
          target_price?: number | null
          uom?: string | null
        }
        Update: {
          description?: string
          id?: string
          item_id?: string | null
          quantity?: number
          rfq_id?: string
          target_price?: number | null
          uom?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proc_rfq_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inv_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proc_rfq_items_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "proc_rfq"
            referencedColumns: ["id"]
          },
        ]
      }
      proc_rfq_vendors: {
        Row: {
          delivery_days: number | null
          id: string
          is_selected: boolean | null
          notes: string | null
          payment_terms: string | null
          responded_at: string | null
          rfq_id: string
          score: number | null
          sent_at: string | null
          total_quoted: number | null
          vendor_id: string
        }
        Insert: {
          delivery_days?: number | null
          id?: string
          is_selected?: boolean | null
          notes?: string | null
          payment_terms?: string | null
          responded_at?: string | null
          rfq_id: string
          score?: number | null
          sent_at?: string | null
          total_quoted?: number | null
          vendor_id: string
        }
        Update: {
          delivery_days?: number | null
          id?: string
          is_selected?: boolean | null
          notes?: string | null
          payment_terms?: string | null
          responded_at?: string | null
          rfq_id?: string
          score?: number | null
          sent_at?: string | null
          total_quoted?: number | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "proc_rfq_vendors_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "proc_rfq"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proc_rfq_vendors_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "ap_vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          base_price: number | null
          category: Database["public"]["Enums"]["product_category"] | null
          created_at: string | null
          description: string | null
          id: number
          is_active: boolean | null
          name: string
          unit: string | null
        }
        Insert: {
          base_price?: number | null
          category?: Database["public"]["Enums"]["product_category"] | null
          created_at?: string | null
          description?: string | null
          id?: number
          is_active?: boolean | null
          name: string
          unit?: string | null
        }
        Update: {
          base_price?: number | null
          category?: Database["public"]["Enums"]["product_category"] | null
          created_at?: string | null
          description?: string | null
          id?: number
          is_active?: boolean | null
          name?: string
          unit?: string | null
        }
        Relationships: []
      }
      professions: {
        Row: {
          created_at: string | null
          description_he: string | null
          icon: string | null
          id: string
          key: string
          name_en: string
          name_he: string
          parent_key: string | null
        }
        Insert: {
          created_at?: string | null
          description_he?: string | null
          icon?: string | null
          id?: string
          key: string
          name_en: string
          name_he: string
          parent_key?: string | null
        }
        Update: {
          created_at?: string | null
          description_he?: string | null
          icon?: string | null
          id?: string
          key?: string
          name_en?: string
          name_he?: string
          parent_key?: string | null
        }
        Relationships: []
      }
      project_templates: {
        Row: {
          author_id: string | null
          category: string | null
          created_at: string | null
          description: string | null
          features: Json | null
          fork_count: number | null
          id: string
          name: string | null
          preview_url: string | null
          stars: number | null
          starter_files: Json | null
          tech_stack: Json | null
        }
        Insert: {
          author_id?: string | null
          category?: string | null
          created_at?: string | null
          description?: string | null
          features?: Json | null
          fork_count?: number | null
          id: string
          name?: string | null
          preview_url?: string | null
          stars?: number | null
          starter_files?: Json | null
          tech_stack?: Json | null
        }
        Update: {
          author_id?: string | null
          category?: string | null
          created_at?: string | null
          description?: string | null
          features?: Json | null
          fork_count?: number | null
          id?: string
          name?: string | null
          preview_url?: string | null
          stars?: number | null
          starter_files?: Json | null
          tech_stack?: Json | null
        }
        Relationships: []
      }
      re_leases: {
        Row: {
          created_at: string | null
          currency: string | null
          deposit: number | null
          end_date: string
          escalation_rate: number | null
          id: string
          lease_number: string
          lessee_email: string | null
          lessee_id_number: string | null
          lessee_name: string
          lessee_phone: string | null
          monthly_rent: number
          notes: string | null
          payment_day: number | null
          property_id: string | null
          start_date: string
          status: string | null
          tenant_id: string | null
          terms: string | null
          unit_id: string | null
        }
        Insert: {
          created_at?: string | null
          currency?: string | null
          deposit?: number | null
          end_date: string
          escalation_rate?: number | null
          id?: string
          lease_number: string
          lessee_email?: string | null
          lessee_id_number?: string | null
          lessee_name: string
          lessee_phone?: string | null
          monthly_rent: number
          notes?: string | null
          payment_day?: number | null
          property_id?: string | null
          start_date: string
          status?: string | null
          tenant_id?: string | null
          terms?: string | null
          unit_id?: string | null
        }
        Update: {
          created_at?: string | null
          currency?: string | null
          deposit?: number | null
          end_date?: string
          escalation_rate?: number | null
          id?: string
          lease_number?: string
          lessee_email?: string | null
          lessee_id_number?: string | null
          lessee_name?: string
          lessee_phone?: string | null
          monthly_rent?: number
          notes?: string | null
          payment_day?: number | null
          property_id?: string | null
          start_date?: string
          status?: string | null
          tenant_id?: string | null
          terms?: string | null
          unit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "re_leases_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "re_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "re_leases_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "re_leases_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "re_units"
            referencedColumns: ["id"]
          },
        ]
      }
      re_maintenance_requests: {
        Row: {
          assigned_to: string | null
          category: string | null
          completed_date: string | null
          cost: number | null
          created_at: string | null
          description: string
          id: string
          notes: string | null
          photos: string[] | null
          priority: string | null
          property_id: string | null
          reported_by: string | null
          request_number: string
          scheduled_date: string | null
          status: string | null
          tenant_id: string | null
          unit_id: string | null
        }
        Insert: {
          assigned_to?: string | null
          category?: string | null
          completed_date?: string | null
          cost?: number | null
          created_at?: string | null
          description: string
          id?: string
          notes?: string | null
          photos?: string[] | null
          priority?: string | null
          property_id?: string | null
          reported_by?: string | null
          request_number: string
          scheduled_date?: string | null
          status?: string | null
          tenant_id?: string | null
          unit_id?: string | null
        }
        Update: {
          assigned_to?: string | null
          category?: string | null
          completed_date?: string | null
          cost?: number | null
          created_at?: string | null
          description?: string
          id?: string
          notes?: string | null
          photos?: string[] | null
          priority?: string | null
          property_id?: string | null
          reported_by?: string | null
          request_number?: string
          scheduled_date?: string | null
          status?: string | null
          tenant_id?: string | null
          unit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "re_maintenance_requests_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "re_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "re_maintenance_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "re_maintenance_requests_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "re_units"
            referencedColumns: ["id"]
          },
        ]
      }
      re_properties: {
        Row: {
          address: string | null
          amenities: string[] | null
          area_uom: string | null
          city: string | null
          country: string | null
          created_at: string | null
          current_value: number | null
          custom_fields: Json | null
          id: string
          images: string[] | null
          latitude: number | null
          longitude: number | null
          manager_id: string | null
          notes: string | null
          num_floors: number | null
          num_units: number | null
          owner_id: string | null
          postal_code: string | null
          property_code: string
          property_name: string
          property_type: string | null
          purchase_date: string | null
          purchase_price: number | null
          state: string | null
          status: string | null
          tenant_id: string | null
          total_area: number | null
          year_built: number | null
        }
        Insert: {
          address?: string | null
          amenities?: string[] | null
          area_uom?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          current_value?: number | null
          custom_fields?: Json | null
          id?: string
          images?: string[] | null
          latitude?: number | null
          longitude?: number | null
          manager_id?: string | null
          notes?: string | null
          num_floors?: number | null
          num_units?: number | null
          owner_id?: string | null
          postal_code?: string | null
          property_code: string
          property_name: string
          property_type?: string | null
          purchase_date?: string | null
          purchase_price?: number | null
          state?: string | null
          status?: string | null
          tenant_id?: string | null
          total_area?: number | null
          year_built?: number | null
        }
        Update: {
          address?: string | null
          amenities?: string[] | null
          area_uom?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          current_value?: number | null
          custom_fields?: Json | null
          id?: string
          images?: string[] | null
          latitude?: number | null
          longitude?: number | null
          manager_id?: string | null
          notes?: string | null
          num_floors?: number | null
          num_units?: number | null
          owner_id?: string | null
          postal_code?: string | null
          property_code?: string
          property_name?: string
          property_type?: string | null
          purchase_date?: string | null
          purchase_price?: number | null
          state?: string | null
          status?: string | null
          tenant_id?: string | null
          total_area?: number | null
          year_built?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "re_properties_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      re_rent_payments: {
        Row: {
          amount: number
          created_at: string | null
          id: string
          late_fee: number | null
          lease_id: string
          payment_date: string
          payment_method: string | null
          period_month: number | null
          period_year: number | null
          reference: string | null
          status: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          id?: string
          late_fee?: number | null
          lease_id: string
          payment_date: string
          payment_method?: string | null
          period_month?: number | null
          period_year?: number | null
          reference?: string | null
          status?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          id?: string
          late_fee?: number | null
          lease_id?: string
          payment_date?: string
          payment_method?: string | null
          period_month?: number | null
          period_year?: number | null
          reference?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "re_rent_payments_lease_id_fkey"
            columns: ["lease_id"]
            isOneToOne: false
            referencedRelation: "re_leases"
            referencedColumns: ["id"]
          },
        ]
      }
      re_units: {
        Row: {
          amenities: string[] | null
          area: number | null
          bathrooms: number | null
          bedrooms: number | null
          current_tenant_id: string | null
          deposit: number | null
          floor: number | null
          id: string
          images: string[] | null
          lease_end: string | null
          lease_start: string | null
          monthly_rent: number | null
          property_id: string
          status: string | null
          unit_number: string
          unit_type: string | null
        }
        Insert: {
          amenities?: string[] | null
          area?: number | null
          bathrooms?: number | null
          bedrooms?: number | null
          current_tenant_id?: string | null
          deposit?: number | null
          floor?: number | null
          id?: string
          images?: string[] | null
          lease_end?: string | null
          lease_start?: string | null
          monthly_rent?: number | null
          property_id: string
          status?: string | null
          unit_number: string
          unit_type?: string | null
        }
        Update: {
          amenities?: string[] | null
          area?: number | null
          bathrooms?: number | null
          bedrooms?: number | null
          current_tenant_id?: string | null
          deposit?: number | null
          floor?: number | null
          id?: string
          images?: string[] | null
          lease_end?: string | null
          lease_start?: string | null
          monthly_rent?: number | null
          property_id?: string
          status?: string | null
          unit_number?: string
          unit_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "re_units_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "re_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      runtime_containers: {
        Row: {
          base_image: string | null
          cpu_cores: number | null
          created_at: string | null
          env_vars: Json | null
          gpu_enabled: boolean | null
          id: string
          language: string | null
          memory_mb: number | null
          name: string | null
          packages: Json | null
          ports: Json | null
          pull_count: number | null
          size_mb: number | null
          status: string | null
          version: string | null
        }
        Insert: {
          base_image?: string | null
          cpu_cores?: number | null
          created_at?: string | null
          env_vars?: Json | null
          gpu_enabled?: boolean | null
          id: string
          language?: string | null
          memory_mb?: number | null
          name?: string | null
          packages?: Json | null
          ports?: Json | null
          pull_count?: number | null
          size_mb?: number | null
          status?: string | null
          version?: string | null
        }
        Update: {
          base_image?: string | null
          cpu_cores?: number | null
          created_at?: string | null
          env_vars?: Json | null
          gpu_enabled?: boolean | null
          id?: string
          language?: string | null
          memory_mb?: number | null
          name?: string | null
          packages?: Json | null
          ports?: Json | null
          pull_count?: number | null
          size_mb?: number | null
          status?: string | null
          version?: string | null
        }
        Relationships: []
      }
      scheduled_jobs: {
        Row: {
          created_at: string | null
          cron_expression: string | null
          error_count: number | null
          function_name: string | null
          id: string
          last_run_at: string | null
          name: string | null
          next_run_at: string | null
          payload: Json | null
          run_count: number | null
          status: string | null
        }
        Insert: {
          created_at?: string | null
          cron_expression?: string | null
          error_count?: number | null
          function_name?: string | null
          id: string
          last_run_at?: string | null
          name?: string | null
          next_run_at?: string | null
          payload?: Json | null
          run_count?: number | null
          status?: string | null
        }
        Update: {
          created_at?: string | null
          cron_expression?: string | null
          error_count?: number | null
          function_name?: string | null
          id?: string
          last_run_at?: string | null
          name?: string | null
          next_run_at?: string | null
          payload?: Json | null
          run_count?: number | null
          status?: string | null
        }
        Relationships: []
      }
      sec_access_logs: {
        Row: {
          action: string
          city: string | null
          country: string | null
          details: Json | null
          event_time: string
          id: string
          resource: string | null
          result: string | null
          risk_score: number | null
          source_ip: string | null
          tenant_id: string | null
          user_agent: string | null
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          city?: string | null
          country?: string | null
          details?: Json | null
          event_time?: string
          id?: string
          resource?: string | null
          result?: string | null
          risk_score?: number | null
          source_ip?: string | null
          tenant_id?: string | null
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          city?: string | null
          country?: string | null
          details?: Json | null
          event_time?: string
          id?: string
          resource?: string | null
          result?: string | null
          risk_score?: number | null
          source_ip?: string | null
          tenant_id?: string | null
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sec_access_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sec_assets: {
        Row: {
          asset_name: string
          asset_type: string | null
          compliance_status: string | null
          created_at: string | null
          criticality: string | null
          department: string | null
          hostname: string | null
          id: string
          ip_address: string | null
          last_scan: string | null
          location: string | null
          os: string | null
          owner: string | null
          status: string | null
          tags: string[] | null
          tenant_id: string | null
        }
        Insert: {
          asset_name: string
          asset_type?: string | null
          compliance_status?: string | null
          created_at?: string | null
          criticality?: string | null
          department?: string | null
          hostname?: string | null
          id?: string
          ip_address?: string | null
          last_scan?: string | null
          location?: string | null
          os?: string | null
          owner?: string | null
          status?: string | null
          tags?: string[] | null
          tenant_id?: string | null
        }
        Update: {
          asset_name?: string
          asset_type?: string | null
          compliance_status?: string | null
          created_at?: string | null
          criticality?: string | null
          department?: string | null
          hostname?: string | null
          id?: string
          ip_address?: string | null
          last_scan?: string | null
          location?: string | null
          os?: string | null
          owner?: string | null
          status?: string | null
          tags?: string[] | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sec_assets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sec_incidents: {
        Row: {
          affected_systems: string[] | null
          affected_users: number | null
          assigned_to: string | null
          attack_vector: string | null
          category: string | null
          containment_actions: string | null
          created_at: string | null
          description: string | null
          detected_at: string | null
          eradication_steps: string | null
          id: string
          impact: string | null
          incident_number: string
          ioc: string[] | null
          lessons_learned: string | null
          recovery_steps: string | null
          reported_by: string | null
          severity: string | null
          status: string | null
          tenant_id: string | null
          title: string
        }
        Insert: {
          affected_systems?: string[] | null
          affected_users?: number | null
          assigned_to?: string | null
          attack_vector?: string | null
          category?: string | null
          containment_actions?: string | null
          created_at?: string | null
          description?: string | null
          detected_at?: string | null
          eradication_steps?: string | null
          id?: string
          impact?: string | null
          incident_number: string
          ioc?: string[] | null
          lessons_learned?: string | null
          recovery_steps?: string | null
          reported_by?: string | null
          severity?: string | null
          status?: string | null
          tenant_id?: string | null
          title: string
        }
        Update: {
          affected_systems?: string[] | null
          affected_users?: number | null
          assigned_to?: string | null
          attack_vector?: string | null
          category?: string | null
          containment_actions?: string | null
          created_at?: string | null
          description?: string | null
          detected_at?: string | null
          eradication_steps?: string | null
          id?: string
          impact?: string | null
          incident_number?: string
          ioc?: string[] | null
          lessons_learned?: string | null
          recovery_steps?: string | null
          reported_by?: string | null
          severity?: string | null
          status?: string | null
          tenant_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "sec_incidents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sec_vulnerabilities: {
        Row: {
          affected_asset: string | null
          affected_component: string | null
          assigned_to: string | null
          cve_id: string | null
          cvss_score: number | null
          description: string | null
          discovered_at: string | null
          due_date: string | null
          fixed_at: string | null
          id: string
          remediation: string | null
          scanner: string | null
          severity: string | null
          status: string | null
          tenant_id: string | null
          title: string
          vuln_id: string
        }
        Insert: {
          affected_asset?: string | null
          affected_component?: string | null
          assigned_to?: string | null
          cve_id?: string | null
          cvss_score?: number | null
          description?: string | null
          discovered_at?: string | null
          due_date?: string | null
          fixed_at?: string | null
          id?: string
          remediation?: string | null
          scanner?: string | null
          severity?: string | null
          status?: string | null
          tenant_id?: string | null
          title: string
          vuln_id: string
        }
        Update: {
          affected_asset?: string | null
          affected_component?: string | null
          assigned_to?: string | null
          cve_id?: string | null
          cvss_score?: number | null
          description?: string | null
          discovered_at?: string | null
          due_date?: string | null
          fixed_at?: string | null
          id?: string
          remediation?: string | null
          scanner?: string | null
          severity?: string | null
          status?: string | null
          tenant_id?: string | null
          title?: string
          vuln_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sec_vulnerabilities_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      seller_profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string | null
          display_name: string | null
          id: string
          modules_count: number | null
          rating: number | null
          stripe_account_id: string | null
          total_revenue: number | null
          total_sales: number | null
          user_id: string | null
          verified: boolean | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          display_name?: string | null
          id: string
          modules_count?: number | null
          rating?: number | null
          stripe_account_id?: string | null
          total_revenue?: number | null
          total_sales?: number | null
          user_id?: string | null
          verified?: boolean | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          display_name?: string | null
          id?: string
          modules_count?: number | null
          rating?: number | null
          stripe_account_id?: string | null
          total_revenue?: number | null
          total_sales?: number | null
          user_id?: string | null
          verified?: boolean | null
        }
        Relationships: []
      }
      seo_config: {
        Row: {
          canonical_url: string | null
          created_at: string | null
          description: string | null
          id: string
          keywords: Json | null
          no_index: boolean | null
          og_image: string | null
          page_path: string | null
          project_id: string | null
          structured_data: Json | null
          title: string | null
        }
        Insert: {
          canonical_url?: string | null
          created_at?: string | null
          description?: string | null
          id: string
          keywords?: Json | null
          no_index?: boolean | null
          og_image?: string | null
          page_path?: string | null
          project_id?: string | null
          structured_data?: Json | null
          title?: string | null
        }
        Update: {
          canonical_url?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          keywords?: Json | null
          no_index?: boolean | null
          og_image?: string | null
          page_path?: string | null
          project_id?: string | null
          structured_data?: Json | null
          title?: string | null
        }
        Relationships: []
      }
      shared_links: {
        Row: {
          access_level: string | null
          active: boolean | null
          created_at: string | null
          created_by: string | null
          expires_at: string | null
          id: string
          project_id: string | null
          token: string | null
          view_count: number | null
        }
        Insert: {
          access_level?: string | null
          active?: boolean | null
          created_at?: string | null
          created_by?: string | null
          expires_at?: string | null
          id: string
          project_id?: string | null
          token?: string | null
          view_count?: number | null
        }
        Update: {
          access_level?: string | null
          active?: boolean | null
          created_at?: string | null
          created_by?: string | null
          expires_at?: string | null
          id?: string
          project_id?: string | null
          token?: string | null
          view_count?: number | null
        }
        Relationships: []
      }
      sports_athletes: {
        Row: {
          athlete_number: number | null
          club_id: string | null
          contract_end: string | null
          contract_start: string | null
          created_at: string | null
          date_of_birth: string | null
          first_name: string
          height_cm: number | null
          id: string
          injury_history: Json | null
          last_name: string
          nationality: string | null
          photo_url: string | null
          position: string | null
          salary: number | null
          stats: Json | null
          status: string | null
          tenant_id: string | null
          weight_kg: number | null
        }
        Insert: {
          athlete_number?: number | null
          club_id?: string | null
          contract_end?: string | null
          contract_start?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          first_name: string
          height_cm?: number | null
          id?: string
          injury_history?: Json | null
          last_name: string
          nationality?: string | null
          photo_url?: string | null
          position?: string | null
          salary?: number | null
          stats?: Json | null
          status?: string | null
          tenant_id?: string | null
          weight_kg?: number | null
        }
        Update: {
          athlete_number?: number | null
          club_id?: string | null
          contract_end?: string | null
          contract_start?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          first_name?: string
          height_cm?: number | null
          id?: string
          injury_history?: Json | null
          last_name?: string
          nationality?: string | null
          photo_url?: string | null
          position?: string | null
          salary?: number | null
          stats?: Json | null
          status?: string | null
          tenant_id?: string | null
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sports_athletes_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "sports_clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sports_athletes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sports_clubs: {
        Row: {
          address: string | null
          capacity: number | null
          city: string | null
          club_name: string
          colors: string[] | null
          country: string | null
          created_at: string | null
          founded_year: number | null
          id: string
          league: string | null
          logo_url: string | null
          sport: string | null
          tenant_id: string | null
          venue: string | null
          website: string | null
        }
        Insert: {
          address?: string | null
          capacity?: number | null
          city?: string | null
          club_name: string
          colors?: string[] | null
          country?: string | null
          created_at?: string | null
          founded_year?: number | null
          id?: string
          league?: string | null
          logo_url?: string | null
          sport?: string | null
          tenant_id?: string | null
          venue?: string | null
          website?: string | null
        }
        Update: {
          address?: string | null
          capacity?: number | null
          city?: string | null
          club_name?: string
          colors?: string[] | null
          country?: string | null
          created_at?: string | null
          founded_year?: number | null
          id?: string
          league?: string | null
          logo_url?: string | null
          sport?: string | null
          tenant_id?: string | null
          venue?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sports_clubs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sports_matches: {
        Row: {
          attendance: number | null
          away_score: number | null
          away_team: string | null
          competition: string | null
          created_at: string | null
          home_score: number | null
          home_team: string | null
          id: string
          lineup: Json | null
          match_date: string
          match_report: string | null
          referee: string | null
          stats: Json | null
          status: string | null
          tenant_id: string | null
          venue: string | null
        }
        Insert: {
          attendance?: number | null
          away_score?: number | null
          away_team?: string | null
          competition?: string | null
          created_at?: string | null
          home_score?: number | null
          home_team?: string | null
          id?: string
          lineup?: Json | null
          match_date: string
          match_report?: string | null
          referee?: string | null
          stats?: Json | null
          status?: string | null
          tenant_id?: string | null
          venue?: string | null
        }
        Update: {
          attendance?: number | null
          away_score?: number | null
          away_team?: string | null
          competition?: string | null
          created_at?: string | null
          home_score?: number | null
          home_team?: string | null
          id?: string
          lineup?: Json | null
          match_date?: string
          match_report?: string | null
          referee?: string | null
          stats?: Json | null
          status?: string | null
          tenant_id?: string | null
          venue?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sports_matches_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sports_training: {
        Row: {
          attendees: string[] | null
          club_id: string | null
          coach: string | null
          created_at: string | null
          duration_minutes: number | null
          id: string
          location: string | null
          notes: string | null
          plan: string | null
          session_date: string
          session_type: string | null
        }
        Insert: {
          attendees?: string[] | null
          club_id?: string | null
          coach?: string | null
          created_at?: string | null
          duration_minutes?: number | null
          id?: string
          location?: string | null
          notes?: string | null
          plan?: string | null
          session_date: string
          session_type?: string | null
        }
        Update: {
          attendees?: string[] | null
          club_id?: string | null
          coach?: string | null
          created_at?: string | null
          duration_minutes?: number | null
          id?: string
          location?: string | null
          notes?: string | null
          plan?: string | null
          session_date?: string
          session_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sports_training_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "sports_clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          assigned_to: string | null
          category: string | null
          created_at: string | null
          description: string | null
          id: string
          messages: Json | null
          priority: string | null
          status: string | null
          subject: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          assigned_to?: string | null
          category?: string | null
          created_at?: string | null
          description?: string | null
          id: string
          messages?: Json | null
          priority?: string | null
          status?: string | null
          subject?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          assigned_to?: string | null
          category?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          messages?: Json | null
          priority?: string | null
          status?: string | null
          subject?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      supported_languages: {
        Row: {
          code: string
          is_active: boolean | null
          name: string | null
          native_name: string | null
          rtl: boolean | null
        }
        Insert: {
          code: string
          is_active?: boolean | null
          name?: string | null
          native_name?: string | null
          rtl?: boolean | null
        }
        Update: {
          code?: string
          is_active?: boolean | null
          name?: string | null
          native_name?: string | null
          rtl?: boolean | null
        }
        Relationships: []
      }
      system_logs: {
        Row: {
          created_at: string | null
          id: string
          level: string | null
          message: string | null
          metadata: Json | null
          source: string | null
        }
        Insert: {
          created_at?: string | null
          id: string
          level?: string | null
          message?: string | null
          metadata?: Json | null
          source?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          level?: string | null
          message?: string | null
          metadata?: Json | null
          source?: string | null
        }
        Relationships: []
      }
      tax_rules: {
        Row: {
          country_code: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          rate: number | null
          region: string | null
          tax_name: string | null
          tax_type: string | null
        }
        Insert: {
          country_code?: string | null
          created_at?: string | null
          id: string
          is_active?: boolean | null
          rate?: number | null
          region?: string | null
          tax_name?: string | null
          tax_type?: string | null
        }
        Update: {
          country_code?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          rate?: number | null
          region?: string | null
          tax_name?: string | null
          tax_type?: string | null
        }
        Relationships: []
      }
      team_invites: {
        Row: {
          created_at: string | null
          email: string | null
          expires_at: string | null
          id: string
          inviter_id: string | null
          project_id: string | null
          role: string | null
          status: string | null
          token: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          expires_at?: string | null
          id: string
          inviter_id?: string | null
          project_id?: string | null
          role?: string | null
          status?: string | null
          token?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          expires_at?: string | null
          id?: string
          inviter_id?: string | null
          project_id?: string | null
          role?: string | null
          status?: string | null
          token?: string | null
        }
        Relationships: []
      }
      tenant_integrations: {
        Row: {
          config: Json | null
          created_at: string | null
          credentials_encrypted: string | null
          error_log: Json | null
          id: string
          integration_key: string
          is_active: boolean | null
          last_sync_at: string | null
          sync_status: string | null
          tenant_id: string
        }
        Insert: {
          config?: Json | null
          created_at?: string | null
          credentials_encrypted?: string | null
          error_log?: Json | null
          id?: string
          integration_key: string
          is_active?: boolean | null
          last_sync_at?: string | null
          sync_status?: string | null
          tenant_id: string
        }
        Update: {
          config?: Json | null
          created_at?: string | null
          credentials_encrypted?: string | null
          error_log?: Json | null
          id?: string
          integration_key?: string
          is_active?: boolean | null
          last_sync_at?: string | null
          sync_status?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_integrations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_modules: {
        Row: {
          config: Json | null
          id: string
          installed_at: string | null
          module_key: string | null
          status: string | null
          tenant_id: string | null
        }
        Insert: {
          config?: Json | null
          id?: string
          installed_at?: string | null
          module_key?: string | null
          status?: string | null
          tenant_id?: string | null
        }
        Update: {
          config?: Json | null
          id?: string
          installed_at?: string | null
          module_key?: string | null
          status?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_modules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_users: {
        Row: {
          created_at: string | null
          display_name: string | null
          email: string
          id: string
          role: string | null
          tenant_id: string | null
        }
        Insert: {
          created_at?: string | null
          display_name?: string | null
          email: string
          id?: string
          role?: string | null
          tenant_id?: string | null
        }
        Update: {
          created_at?: string | null
          display_name?: string | null
          email?: string
          id?: string
          role?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_users_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_workflows: {
        Row: {
          config: Json | null
          created_at: string | null
          custom_name: string | null
          id: string
          is_active: boolean | null
          last_run_at: string | null
          run_count: number | null
          tenant_id: string
          workflow_key: string
        }
        Insert: {
          config?: Json | null
          created_at?: string | null
          custom_name?: string | null
          id?: string
          is_active?: boolean | null
          last_run_at?: string | null
          run_count?: number | null
          tenant_id: string
          workflow_key: string
        }
        Update: {
          config?: Json | null
          created_at?: string | null
          custom_name?: string | null
          id?: string
          is_active?: boolean | null
          last_run_at?: string | null
          run_count?: number | null
          tenant_id?: string
          workflow_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_workflows_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          address: string | null
          country: string | null
          created_at: string | null
          email: string | null
          employee_count: number | null
          id: string
          industry: string | null
          language: string | null
          logo_url: string | null
          name: string
          owner_id: string | null
          phone: string | null
          plan: string | null
          settings: Json | null
          slug: string | null
          status: string | null
          updated_at: string | null
          website: string | null
        }
        Insert: {
          address?: string | null
          country?: string | null
          created_at?: string | null
          email?: string | null
          employee_count?: number | null
          id?: string
          industry?: string | null
          language?: string | null
          logo_url?: string | null
          name: string
          owner_id?: string | null
          phone?: string | null
          plan?: string | null
          settings?: Json | null
          slug?: string | null
          status?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          address?: string | null
          country?: string | null
          created_at?: string | null
          email?: string | null
          employee_count?: number | null
          id?: string
          industry?: string | null
          language?: string | null
          logo_url?: string | null
          name?: string
          owner_id?: string | null
          phone?: string | null
          plan?: string | null
          settings?: Json | null
          slug?: string | null
          status?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Relationships: []
      }
      user_integrations: {
        Row: {
          config: Json | null
          created_at: string | null
          id: string
          last_sync_at: string | null
          provider: string | null
          status: string | null
          user_id: string | null
        }
        Insert: {
          config?: Json | null
          created_at?: string | null
          id: string
          last_sync_at?: string | null
          provider?: string | null
          status?: string | null
          user_id?: string | null
        }
        Update: {
          config?: Json | null
          created_at?: string | null
          id?: string
          last_sync_at?: string | null
          provider?: string | null
          status?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      user_segments: {
        Row: {
          auto_update: boolean | null
          color: string | null
          created_at: string | null
          criteria: Json | null
          description: string | null
          id: string
          name: string | null
          user_count: number | null
        }
        Insert: {
          auto_update?: boolean | null
          color?: string | null
          created_at?: string | null
          criteria?: Json | null
          description?: string | null
          id: string
          name?: string | null
          user_count?: number | null
        }
        Update: {
          auto_update?: boolean | null
          color?: string | null
          created_at?: string | null
          criteria?: Json | null
          description?: string | null
          id?: string
          name?: string | null
          user_count?: number | null
        }
        Relationships: []
      }
      users: {
        Row: {
          created_at: string | null
          email: string
          full_name: string | null
          id: string
          is_active: boolean | null
          mfa_enabled: boolean | null
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          full_name?: string | null
          id: string
          is_active?: boolean | null
          mfa_enabled?: boolean | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          full_name?: string | null
          id?: string
          is_active?: boolean | null
          mfa_enabled?: boolean | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string | null
        }
        Relationships: []
      }
      voice_sessions: {
        Row: {
          accuracy_pct: number | null
          actions_executed: number | null
          commands: Json | null
          created_at: string | null
          duration_sec: number | null
          id: string
          language: string | null
          project_id: string | null
          status: string | null
          transcript: string | null
          user_id: string | null
        }
        Insert: {
          accuracy_pct?: number | null
          actions_executed?: number | null
          commands?: Json | null
          created_at?: string | null
          duration_sec?: number | null
          id: string
          language?: string | null
          project_id?: string | null
          status?: string | null
          transcript?: string | null
          user_id?: string | null
        }
        Update: {
          accuracy_pct?: number | null
          actions_executed?: number | null
          commands?: Json | null
          created_at?: string | null
          duration_sec?: number | null
          id?: string
          language?: string | null
          project_id?: string | null
          status?: string | null
          transcript?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      webhooks: {
        Row: {
          created_at: string | null
          events: Json | null
          failure_count: number | null
          id: string
          last_triggered_at: string | null
          project_id: string | null
          secret: string | null
          status: string | null
          success_count: number | null
          url: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          events?: Json | null
          failure_count?: number | null
          id: string
          last_triggered_at?: string | null
          project_id?: string | null
          secret?: string | null
          status?: string | null
          success_count?: number | null
          url?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          events?: Json | null
          failure_count?: number | null
          id?: string
          last_triggered_at?: string | null
          project_id?: string | null
          secret?: string | null
          status?: string | null
          success_count?: number | null
          url?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      workflow_executions: {
        Row: {
          completed_at: string | null
          duration_ms: number | null
          error_message: string | null
          id: string
          started_at: string | null
          status: string | null
          steps_completed: number | null
          tenant_id: string
          total_steps: number | null
          trigger_data: Json | null
          workflow_key: string
        }
        Insert: {
          completed_at?: string | null
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          started_at?: string | null
          status?: string | null
          steps_completed?: number | null
          tenant_id: string
          total_steps?: number | null
          trigger_data?: Json | null
          workflow_key: string
        }
        Update: {
          completed_at?: string | null
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          started_at?: string | null
          status?: string | null
          steps_completed?: number | null
          tenant_id?: string
          total_steps?: number | null
          trigger_data?: Json | null
          workflow_key?: string
        }
        Relationships: []
      }
      workflow_templates: {
        Row: {
          category: string
          complexity: string | null
          created_at: string | null
          description_en: string | null
          description_he: string | null
          estimated_time_saved: string | null
          id: string
          industry: string | null
          is_premium: boolean | null
          key: string
          name_en: string
          name_he: string | null
          popularity: number | null
          required_modules: string[] | null
          status: string | null
          steps: Json
          trigger_config: Json | null
          trigger_type: string
        }
        Insert: {
          category: string
          complexity?: string | null
          created_at?: string | null
          description_en?: string | null
          description_he?: string | null
          estimated_time_saved?: string | null
          id?: string
          industry?: string | null
          is_premium?: boolean | null
          key: string
          name_en: string
          name_he?: string | null
          popularity?: number | null
          required_modules?: string[] | null
          status?: string | null
          steps?: Json
          trigger_config?: Json | null
          trigger_type: string
        }
        Update: {
          category?: string
          complexity?: string | null
          created_at?: string | null
          description_en?: string | null
          description_he?: string | null
          estimated_time_saved?: string | null
          id?: string
          industry?: string | null
          is_premium?: boolean | null
          key?: string
          name_en?: string
          name_he?: string | null
          popularity?: number | null
          required_modules?: string[] | null
          status?: string | null
          steps?: Json
          trigger_config?: Json | null
          trigger_type?: string
        }
        Relationships: []
      }
    }
    Views: {
      v_active_pipeline: {
        Row: {
          customer_name: string | null
          customer_phone: string | null
          id: number | null
          installation_address: string | null
          installation_date: string | null
          order_number: string | null
          priority: number | null
          status: string | null
          status_he: string | null
          title: string | null
          total_price: number | null
          urgency: string | null
        }
        Relationships: []
      }
      v_all_customers: {
        Row: {
          city: string | null
          country: string | null
          created_at: string | null
          credit_limit: number | null
          customer_number: string | null
          customer_type: string | null
          display_name: string | null
          email: string | null
          id: number | null
          legal_name: string | null
          phone: string | null
          preferred_currency: string | null
          region: string | null
          risk_level: string | null
          status: string | null
          tax_id: string | null
          updated_at: string | null
        }
        Insert: {
          city?: string | null
          country?: string | null
          created_at?: string | null
          credit_limit?: number | null
          customer_number?: string | null
          customer_type?: string | null
          display_name?: string | null
          email?: string | null
          id?: number | null
          legal_name?: string | null
          phone?: string | null
          preferred_currency?: string | null
          region?: string | null
          risk_level?: string | null
          status?: string | null
          tax_id?: string | null
          updated_at?: string | null
        }
        Update: {
          city?: string | null
          country?: string | null
          created_at?: string | null
          credit_limit?: number | null
          customer_number?: string | null
          customer_type?: string | null
          display_name?: string | null
          email?: string | null
          id?: number | null
          legal_name?: string | null
          phone?: string | null
          preferred_currency?: string | null
          region?: string | null
          risk_level?: string | null
          status?: string | null
          tax_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      v_all_employees: {
        Row: {
          department: string | null
          email: string | null
          employee_number: string | null
          employment_type: string | null
          full_name: string | null
          hourly_rate: number | null
          id: number | null
          phone: string | null
          role_title: string | null
          salary_base: number | null
          start_date: string | null
          status: string | null
        }
        Insert: {
          department?: string | null
          email?: string | null
          employee_number?: string | null
          employment_type?: string | null
          full_name?: string | null
          hourly_rate?: number | null
          id?: number | null
          phone?: string | null
          role_title?: string | null
          salary_base?: number | null
          start_date?: string | null
          status?: string | null
        }
        Update: {
          department?: string | null
          email?: string | null
          employee_number?: string | null
          employment_type?: string | null
          full_name?: string | null
          hourly_rate?: number | null
          id?: number | null
          phone?: string | null
          role_title?: string | null
          salary_base?: number | null
          start_date?: string | null
          status?: string | null
        }
        Relationships: []
      }
      v_all_invoices: {
        Row: {
          balance_due: number | null
          customer_name: string | null
          due_date: string | null
          grand_total: number | null
          id: number | null
          invoice_number: string | null
          invoice_type: string | null
          issue_date: string | null
          paid_total: number | null
          state: string | null
          supplier_name: string | null
        }
        Relationships: []
      }
      v_all_materials: {
        Row: {
          active: boolean | null
          category_name: string | null
          description: string | null
          id: number | null
          material_code: string | null
          name: string | null
          reorder_point: number | null
          safety_stock: number | null
          standard_cost: number | null
          unit_of_measure: string | null
        }
        Relationships: []
      }
      v_all_projects: {
        Row: {
          actual_cost: number | null
          budget_amount: number | null
          city: string | null
          customer_name: string | null
          id: number | null
          planned_end_date: string | null
          planned_start_date: string | null
          priority: string | null
          progress_percent: number | null
          project_name: string | null
          project_number: string | null
          project_type: string | null
          state: string | null
        }
        Relationships: []
      }
      v_all_purchase_orders: {
        Row: {
          expected_delivery_date: string | null
          grand_total: number | null
          id: number | null
          order_date: string | null
          payment_status: string | null
          po_number: string | null
          project_name: string | null
          receiving_status: string | null
          state: string | null
          supplier_name: string | null
        }
        Relationships: []
      }
      v_all_quotes: {
        Row: {
          approval_status: string | null
          customer_name: string | null
          grand_total: number | null
          id: number | null
          quote_date: string | null
          quote_number: string | null
          state: string | null
          valid_until: string | null
        }
        Relationships: []
      }
      v_all_suppliers: {
        Row: {
          city: string | null
          country: string | null
          display_name: string | null
          email: string | null
          id: number | null
          legal_name: string | null
          performance_score: number | null
          phone: string | null
          preferred_supplier: boolean | null
          risk_level: string | null
          status: string | null
          supplier_category: string | null
          supplier_number: string | null
        }
        Insert: {
          city?: string | null
          country?: string | null
          display_name?: string | null
          email?: string | null
          id?: number | null
          legal_name?: string | null
          performance_score?: number | null
          phone?: string | null
          preferred_supplier?: boolean | null
          risk_level?: string | null
          status?: string | null
          supplier_category?: string | null
          supplier_number?: string | null
        }
        Update: {
          city?: string | null
          country?: string | null
          display_name?: string | null
          email?: string | null
          id?: number | null
          legal_name?: string | null
          performance_score?: number | null
          phone?: string | null
          preferred_supplier?: boolean | null
          risk_level?: string | null
          status?: string | null
          supplier_category?: string | null
          supplier_number?: string | null
        }
        Relationships: []
      }
      v_all_work_orders: {
        Row: {
          id: number | null
          progress_percent: number | null
          project_name: string | null
          project_number: string | null
          required_end_date: string | null
          required_start_date: string | null
          state: string | null
          title: string | null
          work_order_number: string | null
        }
        Relationships: []
      }
      v_customer_value: {
        Row: {
          active_orders: number | null
          city: string | null
          completed_orders: number | null
          id: number | null
          last_order_date: string | null
          lifetime_revenue: number | null
          name: string | null
          phone: string | null
          pipeline_value: number | null
          tags: string[] | null
          total_orders: number | null
        }
        Relationships: []
      }
      v_low_inventory: {
        Row: {
          category: string | null
          cost_per_unit: number | null
          id: number | null
          min_quantity: number | null
          name: string | null
          quantity: number | null
          shortage: number | null
          supplier_name: string | null
          unit: string | null
        }
        Insert: {
          category?: string | null
          cost_per_unit?: number | null
          id?: number | null
          min_quantity?: number | null
          name?: string | null
          quantity?: number | null
          shortage?: never
          supplier_name?: string | null
          unit?: string | null
        }
        Update: {
          category?: string | null
          cost_per_unit?: number | null
          id?: number | null
          min_quantity?: number | null
          name?: string | null
          quantity?: number | null
          shortage?: never
          supplier_name?: string | null
          unit?: string | null
        }
        Relationships: []
      }
      v_orders_by_status: {
        Row: {
          avg_value: number | null
          count: number | null
          status: string | null
          status_he: string | null
          total_value: number | null
        }
        Relationships: []
      }
      v_revenue_monthly: {
        Row: {
          month: string | null
          month_label: string | null
          orders_count: number | null
          paid_revenue: number | null
          pipeline_value: number | null
          total_pipeline: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      ai_auto_configure: {
        Args: {
          p_budget?: string
          p_business_description: string
          p_company_name?: string
          p_country?: string
          p_employee_count?: number
          p_language?: string
          p_user_email: string
        }
        Returns: Json
      }
      ai_build_custom_module: {
        Args: {
          p_ai_prompt: string
          p_customization: Json
          p_module_base_key: string
          p_tenant_id: string
        }
        Returns: Json
      }
      ai_business_advisor: {
        Args: { p_question: string; p_tenant_id: string }
        Returns: Json
      }
      ai_business_dna: {
        Args: {
          p_country?: string
          p_description: string
          p_employee_count?: number
          p_revenue_range?: string
        }
        Returns: Json
      }
      ai_chat_process: {
        Args: {
          p_conversation_id?: string
          p_message: string
          p_tenant_id: string
          p_user_email: string
        }
        Returns: Json
      }
      ai_get_context: {
        Args: { p_session_id?: string; p_tenant_id: string }
        Returns: Json
      }
      ai_recommend_modules: {
        Args: {
          p_budget_tier?: string
          p_business_type: string
          p_country?: string
          p_employee_count?: number
          p_industry?: string
        }
        Returns: Json
      }
      ai_suggest_workflows: {
        Args: { p_business_type: string; p_tenant_id: string }
        Returns: Json
      }
      ap_aging_report: {
        Args: { p_as_of?: string; p_tenant_id: string }
        Returns: {
          current_amount: number
          days_30: number
          days_60: number
          days_90: number
          over_90: number
          total: number
          vendor_code: string
          vendor_name: string
        }[]
      }
      ap_record_payment: { Args: { p_payment_id: string }; Returns: undefined }
      ar_aging_report: {
        Args: { p_as_of?: string; p_tenant_id: string }
        Returns: {
          current_amt: number
          customer_code: string
          customer_name: string
          d30: number
          d60: number
          d90: number
          over90: number
          total: number
        }[]
      }
      ar_apply_receipt: { Args: { p_receipt_id: string }; Returns: undefined }
      ar_customer_statement: {
        Args: { p_customer_id: string; p_from?: string; p_to?: string }
        Returns: {
          balance: number
          credit: number
          debit: number
          description: string
          doc_date: string
          doc_number: string
          doc_type: string
        }[]
      }
      auto_install_default_modules: {
        Args: { p_tenant_id: string }
        Returns: Json
      }
      build_system_instant: {
        Args: {
          p_business_type: string
          p_company_name: string
          p_country?: string
          p_employee_count?: number
          p_industry?: string
          p_language?: string
          p_module_keys?: string[]
          p_user_email: string
        }
        Returns: Json
      }
      calculate_pricing: {
        Args: {
          p_billing_period?: string
          p_employee_count?: number
          p_module_keys: string[]
        }
        Returns: Json
      }
      change_order_status: {
        Args: {
          new_status: Database["public"]["Enums"]["order_status"]
          note?: string
          order_id: number
        }
        Returns: {
          assigned_field_user_id: string | null
          created_at: string | null
          created_by: string | null
          currency: string | null
          customer_id: number
          deposit_paid: number | null
          description: string | null
          id: number
          installation_address: string | null
          installation_date: string | null
          order_number: string | null
          priority: number | null
          status: Database["public"]["Enums"]["order_status"]
          title: string
          total_price: number | null
          updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      check_email_exists: { Args: { p_email: string }; Returns: Json }
      check_slug_exists: { Args: { p_slug: string }; Returns: Json }
      clone_system: {
        Args: {
          p_new_company_name: string
          p_new_owner_email: string
          p_source_tenant_id: string
        }
        Returns: Json
      }
      create_ai_session: {
        Args: {
          p_language: string
          p_model: string
          p_tenant_id: string
          p_user_id: string
        }
        Returns: Json
      }
      create_tenant: {
        Args: { p_name: string; p_plan?: string; p_slug: string }
        Returns: Json
      }
      create_tenant_user: {
        Args: {
          p_email: string
          p_full_name: string
          p_password_hash: string
          p_role?: string
          p_tenant_id: string
        }
        Returns: Json
      }
      cross_tenant_benchmark: { Args: { p_tenant_id: string }; Returns: Json }
      current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      dashboard_stats: { Args: never; Returns: Json }
      dashboard_stats_v2: { Args: never; Returns: Json }
      get_ai_history: { Args: { p_session_id: string }; Returns: Json }
      get_ai_models: { Args: never; Returns: Json }
      get_ai_sessions: { Args: { p_user_id: string }; Returns: Json }
      get_available_workflows: { Args: { p_tenant_id: string }; Returns: Json }
      get_compliance_requirements: {
        Args: {
          p_country: string
          p_employee_count?: number
          p_industry: string
        }
        Returns: Json
      }
      get_current_org_id: { Args: never; Returns: string }
      get_industry_templates: { Args: never; Returns: Json }
      get_installed_modules: { Args: { p_tenant_id: string }; Returns: Json }
      get_integrations_for_tenant: {
        Args: { p_tenant_id: string }
        Returns: Json
      }
      get_module_categories: {
        Args: never
        Returns: {
          category: string
          count: number
        }[]
      }
      get_modules: {
        Args: {
          p_category?: string
          p_limit?: number
          p_offset?: number
          p_search?: string
        }
        Returns: {
          category: string
          complexity: string | null
          created_at: string | null
          description_en: string | null
          description_he: string | null
          icon: string | null
          id: string
          is_free: boolean | null
          key: string
          name_en: string
          name_he: string
          price_monthly: number | null
          profession_tags: string[] | null
          recommended_with: string[] | null
          status: string | null
          tags: string[] | null
        }[]
        SetofOptions: {
          from: "*"
          to: "modules"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_modules_by_profession: {
        Args: { p_profession_key: string }
        Returns: {
          category: string
          icon: string
          is_essential: boolean
          module_key: string
          name_en: string
          name_he: string
          recommendation_note_he: string
          relevance_score: number
        }[]
      }
      get_platform_stats: { Args: never; Returns: Json }
      get_tenant_dashboard: { Args: { p_tenant_id: string }; Returns: Json }
      get_tenant_info: { Args: { p_tenant_id: string }; Returns: Json }
      get_user_by_email: { Args: { p_email: string }; Returns: Json }
      gl_balance_sheet: {
        Args: { p_period_id: string; p_tenant_id: string }
        Returns: {
          account_code: string
          account_name: string
          account_type: string
          balance: number
        }[]
      }
      gl_close_period: {
        Args: { p_period_id: string; p_user_id: string }
        Returns: undefined
      }
      gl_income_statement: {
        Args: { p_period_id: string; p_tenant_id: string }
        Returns: {
          account_code: string
          account_name: string
          account_type: string
          amount: number
        }[]
      }
      gl_post_entry: { Args: { p_entry_id: string }; Returns: undefined }
      gl_trial_balance: {
        Args: { p_period_id: string; p_tenant_id: string }
        Returns: {
          account_code: string
          account_name: string
          account_type: string
          credit: number
          debit: number
          net: number
        }[]
      }
      global_search: { Args: { q: string }; Returns: Json }
      install_module: {
        Args: { p_module_key: string; p_tenant_id: string }
        Returns: undefined
      }
      install_modules_batch: {
        Args: { p_module_keys: string[]; p_tenant_id: string }
        Returns: Json
      }
      install_workflow: {
        Args: {
          p_custom_config?: Json
          p_tenant_id: string
          p_workflow_key: string
        }
        Returns: Json
      }
      inv_low_stock_alert: {
        Args: { p_tenant_id: string }
        Returns: {
          alert: string
          item_code: string
          item_name: string
          on_hand: number
          reorder_pt: number
          safety: number
        }[]
      }
      inv_stock_valuation: {
        Args: { p_tenant_id: string; p_warehouse_id?: string }
        Returns: {
          cost: number
          item_code: string
          item_name: string
          qty: number
          total_val: number
          warehouse: string
        }[]
      }
      log_tenant_activity: {
        Args: {
          p_action: string
          p_details?: Json
          p_entity_id?: string
          p_entity_type: string
          p_tenant_id: string
          p_user_id?: string
        }
        Returns: string
      }
      mfg_oee_report: {
        Args: { p_from: string; p_tenant_id: string; p_to: string }
        Returns: {
          availability: number
          oee: number
          performance: number
          quality_rate: number
          work_center: string
        }[]
      }
      save_ai_message: {
        Args: {
          p_content: string
          p_model: string
          p_role: string
          p_session_id: string
          p_tokens: number
        }
        Returns: Json
      }
      search_modules_advanced: {
        Args: {
          p_category?: string
          p_complexity?: string
          p_free_only?: boolean
          p_limit?: number
          p_max_price?: number
          p_offset?: number
          p_query?: string
          p_sort_by?: string
        }
        Returns: Json
      }
      smart_module_composer: {
        Args: {
          p_composite_name: string
          p_features_to_combine?: Json
          p_source_modules: string[]
          p_tenant_id: string
        }
        Returns: Json
      }
      system_evolution_engine: { Args: { p_tenant_id: string }; Returns: Json }
      system_self_heal: { Args: { p_tenant_id: string }; Returns: Json }
      update_last_login: { Args: { p_user_id: string }; Returns: Json }
      update_tenant_owner: {
        Args: { p_owner_id: string; p_tenant_id: string }
        Returns: Json
      }
    }
    Enums: {
      order_status:
        | "draft"
        | "measuring"
        | "quoted"
        | "approved"
        | "production"
        | "ready"
        | "installing"
        | "completed"
        | "invoiced"
        | "paid"
        | "cancelled"
      product_category:
        | "gate"
        | "fence"
        | "railing"
        | "pergola"
        | "stairs"
        | "window"
        | "door"
        | "custom"
        | "other"
      user_role: "admin" | "manager" | "field" | "client"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      order_status: [
        "draft",
        "measuring",
        "quoted",
        "approved",
        "production",
        "ready",
        "installing",
        "completed",
        "invoiced",
        "paid",
        "cancelled",
      ],
      product_category: [
        "gate",
        "fence",
        "railing",
        "pergola",
        "stairs",
        "window",
        "door",
        "custom",
        "other",
      ],
      user_role: ["admin", "manager", "field", "client"],
    },
  },
} as const
