export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      abuse_reports: {
        Row: {
          admin_notes: string | null
          company_id: string | null
          company_name: string | null
          created_at: string
          description: string
          handled_by: string | null
          id: string
          letter_reference: string | null
          reporter_email: string | null
          status: Database["public"]["Enums"]["abuse_status"]
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          company_id?: string | null
          company_name?: string | null
          created_at?: string
          description: string
          handled_by?: string | null
          id?: string
          letter_reference?: string | null
          reporter_email?: string | null
          status?: Database["public"]["Enums"]["abuse_status"]
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          company_id?: string | null
          company_name?: string | null
          created_at?: string
          description?: string
          handled_by?: string | null
          id?: string
          letter_reference?: string | null
          reporter_email?: string | null
          status?: Database["public"]["Enums"]["abuse_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "abuse_reports_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abuse_reports_handled_by_fkey"
            columns: ["handled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          details: Json
          entity_id: string | null
          entity_type: string
          id: number
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          entity_id?: string | null
          entity_type: string
          id?: never
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          entity_id?: string | null
          entity_type?: string
          id?: never
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      clause_variants: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          editor_help: string | null
          id: string
          jurisdiction_code: string
          language: string
          legal_notes: string | null
          locked: boolean
          locked_reason: string | null
          review_status: Database["public"]["Enums"]["review_status"]
          reviewed_at: string | null
          reviewer: string | null
          section_key: string
          source_file: string | null
          title: string | null
          updated_at: string
          version: number
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          editor_help?: string | null
          id?: string
          jurisdiction_code: string
          language?: string
          legal_notes?: string | null
          locked?: boolean
          locked_reason?: string | null
          review_status?: Database["public"]["Enums"]["review_status"]
          reviewed_at?: string | null
          reviewer?: string | null
          section_key: string
          source_file?: string | null
          title?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          editor_help?: string | null
          id?: string
          jurisdiction_code?: string
          language?: string
          legal_notes?: string | null
          locked?: boolean
          locked_reason?: string | null
          review_status?: Database["public"]["Enums"]["review_status"]
          reviewed_at?: string | null
          reviewer?: string | null
          section_key?: string
          source_file?: string | null
          title?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "clause_variants_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clause_variants_jurisdiction_code_fkey"
            columns: ["jurisdiction_code"]
            isOneToOne: false
            referencedRelation: "jurisdictions"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "clause_variants_section_key_fkey"
            columns: ["section_key"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["key"]
          },
        ]
      }
      companies: {
        Row: {
          archived_at: string | null
          brand_color: string | null
          contact_email: string
          contact_phone: string
          country_code: string
          created_at: string
          id: string
          legal_name: string
          logo_height: number | null
          logo_path: string | null
          logo_width: number | null
          owner_id: string
          registered_address: string
          registration_number: string
          signatory_name: string
          signatory_title: string
          suspended_at: string | null
          suspended_reason: string | null
          trading_name: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          archived_at?: string | null
          brand_color?: string | null
          contact_email: string
          contact_phone: string
          country_code: string
          created_at?: string
          id?: string
          legal_name: string
          logo_height?: number | null
          logo_path?: string | null
          logo_width?: number | null
          owner_id: string
          registered_address: string
          registration_number: string
          signatory_name: string
          signatory_title: string
          suspended_at?: string | null
          suspended_reason?: string | null
          trading_name?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          archived_at?: string | null
          brand_color?: string | null
          contact_email?: string
          contact_phone?: string
          country_code?: string
          created_at?: string
          id?: string
          legal_name?: string
          logo_height?: number | null
          logo_path?: string | null
          logo_width?: number | null
          owner_id?: string
          registered_address?: string
          registration_number?: string
          signatory_name?: string
          signatory_title?: string
          suspended_at?: string | null
          suspended_reason?: string | null
          trading_name?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "companies_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      downloads: {
        Row: {
          created_at: string
          id: number
          kind: string
          letter_version_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: never
          kind?: string
          letter_version_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: never
          kind?: string
          letter_version_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "downloads_letter_version_id_fkey"
            columns: ["letter_version_id"]
            isOneToOne: false
            referencedRelation: "letter_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "downloads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      field_definitions: {
        Row: {
          created_at: string
          default_value: Json | null
          help_text: string | null
          jurisdiction_overrides: Json
          jurisdictions: string[] | null
          key: string
          label: string
          options: Json | null
          placeholder: string | null
          required: boolean
          section_key: string
          sort_order: number
          type: Database["public"]["Enums"]["field_type"]
          updated_at: string
          validation: Json
        }
        Insert: {
          created_at?: string
          default_value?: Json | null
          help_text?: string | null
          jurisdiction_overrides?: Json
          jurisdictions?: string[] | null
          key: string
          label: string
          options?: Json | null
          placeholder?: string | null
          required?: boolean
          section_key: string
          sort_order?: number
          type: Database["public"]["Enums"]["field_type"]
          updated_at?: string
          validation?: Json
        }
        Update: {
          created_at?: string
          default_value?: Json | null
          help_text?: string | null
          jurisdiction_overrides?: Json
          jurisdictions?: string[] | null
          key?: string
          label?: string
          options?: Json | null
          placeholder?: string | null
          required?: boolean
          section_key?: string
          sort_order?: number
          type?: Database["public"]["Enums"]["field_type"]
          updated_at?: string
          validation?: Json
        }
        Relationships: [
          {
            foreignKeyName: "field_definitions_section_key_fkey"
            columns: ["section_key"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["key"]
          },
        ]
      }
      jurisdictions: {
        Row: {
          admin_notes: string | null
          code: string
          created_at: string
          currency: string
          enabled: boolean
          locale: string
          name: string
          paper_size: Database["public"]["Enums"]["paper_size"]
          parent_code: string | null
          public_note: string | null
          selectable: boolean
          sort_order: number
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          code: string
          created_at?: string
          currency: string
          enabled?: boolean
          locale: string
          name: string
          paper_size: Database["public"]["Enums"]["paper_size"]
          parent_code?: string | null
          public_note?: string | null
          selectable?: boolean
          sort_order?: number
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          code?: string
          created_at?: string
          currency?: string
          enabled?: boolean
          locale?: string
          name?: string
          paper_size?: Database["public"]["Enums"]["paper_size"]
          parent_code?: string | null
          public_note?: string | null
          selectable?: boolean
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "jurisdictions_parent_code_fkey"
            columns: ["parent_code"]
            isOneToOne: false
            referencedRelation: "jurisdictions"
            referencedColumns: ["code"]
          },
        ]
      }
      letter_phrases: {
        Row: {
          created_at: string
          id: string
          jurisdiction_code: string | null
          key: string
          language: string
          text: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          jurisdiction_code?: string | null
          key: string
          language?: string
          text: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          jurisdiction_code?: string | null
          key?: string
          language?: string
          text?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "letter_phrases_jurisdiction_code_fkey"
            columns: ["jurisdiction_code"]
            isOneToOne: false
            referencedRelation: "jurisdictions"
            referencedColumns: ["code"]
          },
        ]
      }
      letter_versions: {
        Row: {
          company_snapshot: Json
          content_hash: string
          created_at: string
          id: string
          letter_id: string
          note: string | null
          pdf_path: string | null
          snapshot: Json
          version: number
        }
        Insert: {
          company_snapshot: Json
          content_hash: string
          created_at?: string
          id?: string
          letter_id: string
          note?: string | null
          pdf_path?: string | null
          snapshot: Json
          version: number
        }
        Update: {
          company_snapshot?: Json
          content_hash?: string
          created_at?: string
          id?: string
          letter_id?: string
          note?: string | null
          pdf_path?: string | null
          snapshot?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "letter_versions_letter_id_fkey"
            columns: ["letter_id"]
            isOneToOne: false
            referencedRelation: "letters"
            referencedColumns: ["id"]
          },
        ]
      }
      letters: {
        Row: {
          accent_color: string | null
          author_id: string
          company_id: string
          correction_until: string | null
          created_at: string
          current_version: number
          edited_at: string
          field_values: Json
          id: string
          jurisdiction_code: string
          name: string
          paid_at: string | null
          pinned_clauses: Json
          removed_sections: string[]
          status: Database["public"]["Enums"]["letter_status"]
          template_key: string
          updated_at: string
        }
        Insert: {
          accent_color?: string | null
          author_id: string
          company_id: string
          correction_until?: string | null
          created_at?: string
          current_version?: number
          edited_at?: string
          field_values?: Json
          id?: string
          jurisdiction_code: string
          name?: string
          paid_at?: string | null
          pinned_clauses?: Json
          removed_sections?: string[]
          status?: Database["public"]["Enums"]["letter_status"]
          template_key: string
          updated_at?: string
        }
        Update: {
          accent_color?: string | null
          author_id?: string
          company_id?: string
          correction_until?: string | null
          created_at?: string
          current_version?: number
          edited_at?: string
          field_values?: Json
          id?: string
          jurisdiction_code?: string
          name?: string
          paid_at?: string | null
          pinned_clauses?: Json
          removed_sections?: string[]
          status?: Database["public"]["Enums"]["letter_status"]
          template_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "letters_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "letters_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "letters_jurisdiction_code_fkey"
            columns: ["jurisdiction_code"]
            isOneToOne: false
            referencedRelation: "jurisdictions"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "letters_template_key_fkey"
            columns: ["template_key"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["key"]
          },
        ]
      }
      payments: {
        Row: {
          amount_minor: number
          billing: Json
          company_id: string | null
          company_snapshot: Json | null
          content_hash: string | null
          created_at: string
          currency: string
          display_amount_minor: number | null
          display_currency: string | null
          failure_reason: string | null
          id: string
          letter_id: string | null
          letter_snapshot: Json | null
          payu_payment_id: string | null
          raw_responses: Json
          receipt_sent_at: string | null
          refund_note: string | null
          refunded_at: string | null
          status: Database["public"]["Enums"]["payment_status"]
          txnid: string
          updated_at: string
          user_id: string | null
          verified_at: string | null
        }
        Insert: {
          amount_minor: number
          billing?: Json
          company_id?: string | null
          company_snapshot?: Json | null
          content_hash?: string | null
          created_at?: string
          currency: string
          display_amount_minor?: number | null
          display_currency?: string | null
          failure_reason?: string | null
          id?: string
          letter_id?: string | null
          letter_snapshot?: Json | null
          payu_payment_id?: string | null
          raw_responses?: Json
          receipt_sent_at?: string | null
          refund_note?: string | null
          refunded_at?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          txnid: string
          updated_at?: string
          user_id?: string | null
          verified_at?: string | null
        }
        Update: {
          amount_minor?: number
          billing?: Json
          company_id?: string | null
          company_snapshot?: Json | null
          content_hash?: string | null
          created_at?: string
          currency?: string
          display_amount_minor?: number | null
          display_currency?: string | null
          failure_reason?: string | null
          id?: string
          letter_id?: string | null
          letter_snapshot?: Json | null
          payu_payment_id?: string | null
          raw_responses?: Json
          receipt_sent_at?: string | null
          refund_note?: string | null
          refunded_at?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          txnid?: string
          updated_at?: string
          user_id?: string | null
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_letter_id_fkey"
            columns: ["letter_id"]
            isOneToOne: false
            referencedRelation: "letters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      prices: {
        Row: {
          active: boolean
          amount_minor: number
          created_at: string
          currency: string
          id: string
          notes: string | null
          product: string
          purpose: Database["public"]["Enums"]["price_purpose"]
          updated_at: string
        }
        Insert: {
          active?: boolean
          amount_minor: number
          created_at?: string
          currency: string
          id?: string
          notes?: string | null
          product?: string
          purpose: Database["public"]["Enums"]["price_purpose"]
          updated_at?: string
        }
        Update: {
          active?: boolean
          amount_minor?: number
          created_at?: string
          currency?: string
          id?: string
          notes?: string | null
          product?: string
          purpose?: Database["public"]["Enums"]["price_purpose"]
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          company_limit: number
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          company_limit?: number
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          company_limit?: number
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          hits: number
          key: string
          window_start: string
        }
        Insert: {
          hits?: number
          key: string
          window_start: string
        }
        Update: {
          hits?: number
          key?: string
          window_start?: string
        }
        Relationships: []
      }
      sections: {
        Row: {
          always_included: boolean
          created_at: string
          default_order: number
          default_title: string
          help_text: string | null
          key: string
          short_title: string | null
          show_heading: boolean
          updated_at: string
          varies_by_country: boolean
        }
        Insert: {
          always_included?: boolean
          created_at?: string
          default_order: number
          default_title: string
          help_text?: string | null
          key: string
          short_title?: string | null
          show_heading?: boolean
          updated_at?: string
          varies_by_country?: boolean
        }
        Update: {
          always_included?: boolean
          created_at?: string
          default_order?: number
          default_title?: string
          help_text?: string | null
          key?: string
          short_title?: string | null
          show_heading?: boolean
          updated_at?: string
          varies_by_country?: boolean
        }
        Relationships: []
      }
      templates: {
        Row: {
          active: boolean
          created_at: string
          default_accent: string
          description: string | null
          key: string
          name: string
          sort_order: number
          thumbnail_path: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          default_accent: string
          description?: string | null
          key: string
          name: string
          sort_order?: number
          thumbnail_path?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          default_accent?: string
          description?: string | null
          key?: string
          name?: string
          sort_order?: number
          thumbnail_path?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      company_letter_counts: {
        Row: {
          company_id: string | null
          drafts: number | null
          paid: number | null
        }
        Relationships: [
          {
            foreignKeyName: "letters_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      activate_price: { Args: { p_id: string }; Returns: undefined }
      admin_metrics: {
        Args: { p_from: string; p_prev_from: string; p_to: string }
        Returns: Json
      }
      append_payment_response: {
        Args: { p_entry: Json; p_txnid: string }
        Returns: undefined
      }
      is_admin: { Args: never; Returns: boolean }
      is_service: { Args: never; Returns: boolean }
      jurisdiction_chain: { Args: { p_code: string }; Returns: string[] }
      rate_limit_take: {
        Args: { p_key: string; p_max: number; p_window_seconds: number }
        Returns: boolean
      }
      section_locked: {
        Args: { p_jurisdiction: string; p_section: string }
        Returns: boolean
      }
    }
    Enums: {
      abuse_status: "new" | "investigating" | "closed"
      field_type:
        | "text"
        | "long_text"
        | "date"
        | "money"
        | "number"
        | "select"
        | "email"
        | "phone"
        | "address"
        | "yes_no"
      letter_status: "draft" | "paid"
      paper_size: "a4" | "letter"
      payment_status:
        | "initiated"
        | "pending"
        | "success"
        | "failed"
        | "refunded"
      price_purpose: "display" | "charge"
      review_status: "draft" | "in_review" | "approved"
      user_role: "user" | "admin"
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
      abuse_status: ["new", "investigating", "closed"],
      field_type: [
        "text",
        "long_text",
        "date",
        "money",
        "number",
        "select",
        "email",
        "phone",
        "address",
        "yes_no",
      ],
      letter_status: ["draft", "paid"],
      paper_size: ["a4", "letter"],
      payment_status: ["initiated", "pending", "success", "failed", "refunded"],
      price_purpose: ["display", "charge"],
      review_status: ["draft", "in_review", "approved"],
      user_role: ["user", "admin"],
    },
  },
} as const

