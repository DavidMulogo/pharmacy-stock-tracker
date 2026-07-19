import type { ActivityLogAction, ExpenseCategory, ExpiryStatus, OverrideFlag, PharmacyPlan, PharmacyStatus, PharmacyUserRole, SellingMode, SellType, StockStatus } from "@/lib/types";

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      admin_users: {
        Row: {
          id: string;
          username: string;
          password_hash: string;
          full_name: string | null;
          role: string;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          username: string;
          password_hash: string;
          full_name?: string | null;
          role?: string;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["admin_users"]["Insert"]>;
        Relationships: [];
      };
      pharmacies: {
        Row: {
          id: string;
          pharmacy_name: string;
          owner_name: string;
          phone: string;
          plan: PharmacyPlan;
          status: PharmacyStatus;
          trial_ends_at: string | null;
          subscription_ends_at: string | null;
          archived_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          pharmacy_name: string;
          owner_name: string;
          phone: string;
          plan?: PharmacyPlan;
          status?: PharmacyStatus;
          trial_ends_at?: string | null;
          subscription_ends_at?: string | null;
          archived_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["pharmacies"]["Insert"]>;
        Relationships: [];
      };
      pharmacy_access: {
        Row: {
          id: string;
          pharmacy_id: string;
          pharmacy_code: string;
          password: string;
          password_hash: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          pharmacy_id: string;
          pharmacy_code: string;
          password: string;
          password_hash?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["pharmacy_access"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "pharmacy_access_pharmacy_id_fkey";
            columns: ["pharmacy_id"];
            isOneToOne: false;
            referencedRelation: "pharmacies";
            referencedColumns: ["id"];
          },
        ];
      };
      pharmacy_sessions: {
        Row: {
          id: string;
          pharmacy_id: string;
          pharmacy_user_id: string | null;
          session_token: string;
          role: PharmacyUserRole | null;
          created_at: string;
          expires_at: string;
          last_seen: string;
        };
        Insert: {
          id?: string;
          pharmacy_id: string;
          pharmacy_user_id?: string | null;
          session_token: string;
          role?: PharmacyUserRole | null;
          created_at?: string;
          expires_at: string;
          last_seen?: string;
        };
        Update: Partial<Database["public"]["Tables"]["pharmacy_sessions"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "pharmacy_sessions_pharmacy_id_fkey";
            columns: ["pharmacy_id"];
            isOneToOne: false;
            referencedRelation: "pharmacies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pharmacy_sessions_pharmacy_user_id_fkey";
            columns: ["pharmacy_user_id"];
            isOneToOne: false;
            referencedRelation: "pharmacy_users";
            referencedColumns: ["id"];
          },
        ];
      };
      pharmacy_users: {
        Row: {
          id: string;
          pharmacy_id: string;
          full_name: string;
          username: string;
          password_hash: string;
          role: PharmacyUserRole;
          active: boolean;
          last_login_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          pharmacy_id: string;
          full_name: string;
          username: string;
          password_hash: string;
          role?: PharmacyUserRole;
          active?: boolean;
          last_login_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["pharmacy_users"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "pharmacy_users_pharmacy_id_fkey";
            columns: ["pharmacy_id"];
            isOneToOne: false;
            referencedRelation: "pharmacies";
            referencedColumns: ["id"];
          },
        ];
      };
      pharmacy_settings: {
        Row: {
          id: string;
          pharmacy_id: string;
          registration_number: string;
          license_number: string;
          address: string;
          region: string;
          district: string;
          email: string;
          logo_url: string;
          receipt_header: string;
          receipt_footer: string;
          receipt_prefix: string;
          low_stock_threshold: number;
          expiry_warning_days: number;
          allow_negative_stock: boolean;
          allow_duplicate_batches: boolean;
          allow_price_override: boolean;
          max_discount: number;
          vat_percentage: number;
          currency: string;
          timezone: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          pharmacy_id: string;
          registration_number?: string;
          license_number?: string;
          address?: string;
          region?: string;
          district?: string;
          email?: string;
          logo_url?: string;
          receipt_header?: string;
          receipt_footer?: string;
          receipt_prefix?: string;
          low_stock_threshold?: number;
          expiry_warning_days?: number;
          allow_negative_stock?: boolean;
          allow_duplicate_batches?: boolean;
          allow_price_override?: boolean;
          max_discount?: number;
          vat_percentage?: number;
          currency?: string;
          timezone?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["pharmacy_settings"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "pharmacy_settings_pharmacy_id_fkey";
            columns: ["pharmacy_id"];
            isOneToOne: true;
            referencedRelation: "pharmacies";
            referencedColumns: ["id"];
          },
        ];
      };
      products: {
        Row: {
          id: string;
          pharmacy_id: string | null;
          product_name: string;
          generic_name: string;
          brand_name: string;
          dosage_form: string;
          base_unit: string;
          pack_type: string;
          units_per_pack: number;
          default_selling_price: number;
          selling_mode: SellingMode;
          default_unit_price: number | null;
          default_pack_price: number | null;
          reorder_level: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          pharmacy_id?: string | null;
          product_name: string;
          generic_name: string;
          brand_name: string;
          dosage_form: string;
          base_unit: string;
          pack_type: string;
          units_per_pack: number;
          default_selling_price: number;
          selling_mode?: SellingMode;
          default_unit_price?: number | null;
          default_pack_price?: number | null;
          reorder_level?: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["products"]["Insert"]>;
        Relationships: [];
      };
      inventory_batches: {
        Row: {
          id: string;
          pharmacy_id: string | null;
          product_id: string;
          batch_number: string;
          expiry_date: string;
          packs_received: number;
          units_per_pack: number;
          total_units_received: number;
          buying_price: number;
          buying_price_per_pack: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          pharmacy_id?: string | null;
          product_id: string;
          batch_number: string;
          expiry_date: string;
          packs_received: number;
          units_per_pack: number;
          buying_price?: number;
          buying_price_per_pack: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["inventory_batches"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "inventory_batches_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      sales: {
        Row: {
          id: string;
          pharmacy_id: string | null;
          product_id: string;
          sell_type: SellType;
          quantity_entered: number;
          units_sold: number;
          quantity_sold: number;
          default_price: number;
          override_price: number | null;
          effective_price: number;
          final_selling_price: number | null;
          effective_selling_price: number;
          total_sale: number;
          override_flag: OverrideFlag;
          created_at: string;
        };
        Insert: {
          id?: string;
          pharmacy_id?: string | null;
          product_id: string;
          sell_type?: SellType;
          quantity_entered?: number;
          units_sold?: number;
          quantity_sold: number;
          default_price: number;
          override_price?: number | null;
          effective_price?: number;
          final_selling_price?: number | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["sales"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "sales_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      expenses: {
        Row: {
          id: string;
          pharmacy_id: string;
          expense_date: string;
          category: ExpenseCategory;
          description: string;
          amount: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          pharmacy_id: string;
          expense_date: string;
          category: ExpenseCategory;
          description?: string;
          amount: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["expenses"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "expenses_pharmacy_id_fkey";
            columns: ["pharmacy_id"];
            isOneToOne: false;
            referencedRelation: "pharmacies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "expenses_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "pharmacy_users";
            referencedColumns: ["id"];
          },
        ];
      };
      activity_logs: {
        Row: {
          id: string;
          pharmacy_id: string;
          actor_user_id: string | null;
          actor_name: string;
          actor_role: PharmacyUserRole;
          action: ActivityLogAction;
          entity_type: string;
          entity_id: string | null;
          description: string;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          pharmacy_id: string;
          actor_user_id?: string | null;
          actor_name: string;
          actor_role: PharmacyUserRole;
          action: ActivityLogAction;
          entity_type: string;
          entity_id?: string | null;
          description: string;
          metadata?: Json;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["activity_logs"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "activity_logs_pharmacy_id_fkey";
            columns: ["pharmacy_id"];
            isOneToOne: false;
            referencedRelation: "pharmacies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "activity_logs_actor_user_id_fkey";
            columns: ["actor_user_id"];
            isOneToOne: false;
            referencedRelation: "pharmacy_users";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      product_stock_summary: {
        Row: Database["public"]["Tables"]["products"]["Row"] & {
          total_received: number;
          total_sold: number;
          available_stock: number;
          derived_unit_cost: number | null;
          stock_status: StockStatus;
        };
        Relationships: [];
      };
      batch_expiry_summary: {
        Row: Database["public"]["Tables"]["inventory_batches"]["Row"] & {
          derived_unit_cost: number | null;
          expiry_status: ExpiryStatus;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_batches_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
