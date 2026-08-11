import type { ActivityLogAction, ExpenseCategory, ExpiryStatus, InventoryAdjustmentReason, NotificationSeverity, NotificationStatus, NotificationType, OverrideFlag, PharmacyPlan, PharmacyStatus, PharmacyUserRole, SellingMode, SellType, StockStatus } from "@/lib/types";

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
          session_version: number;
          failed_login_attempts: number;
          locked_until: string | null;
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
          session_version?: number;
          failed_login_attempts?: number;
          locked_until?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["admin_users"]["Insert"]>;
        Relationships: [];
      };
      admin_activity_logs: {
        Row: {
          id: string;
          admin_username: string;
          admin_role: string;
          action: string;
          target_pharmacy_id: string | null;
          target_pharmacy_name: string | null;
          backup_checksum: string | null;
          restored_counts: Json;
          skipped_counts: Json;
          success: boolean;
          error_message: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          admin_username: string;
          admin_role: string;
          action: string;
          target_pharmacy_id?: string | null;
          target_pharmacy_name?: string | null;
          backup_checksum?: string | null;
          restored_counts?: Json;
          skipped_counts?: Json;
          success?: boolean;
          error_message?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["admin_activity_logs"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "admin_activity_logs_target_pharmacy_id_fkey";
            columns: ["target_pharmacy_id"];
            isOneToOne: false;
            referencedRelation: "pharmacies";
            referencedColumns: ["id"];
          },
        ];
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
      pharmacy_onboarding: {
        Row: {
          id: string;
          pharmacy_id: string;
          started_at: string;
          profile_reviewed_at: string | null;
          business_rules_reviewed_at: string | null;
          staff_reviewed_at: string | null;
          products_reviewed_at: string | null;
          opening_stock_reviewed_at: string | null;
          subscription_reviewed_at: string | null;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          pharmacy_id: string;
          started_at?: string;
          profile_reviewed_at?: string | null;
          business_rules_reviewed_at?: string | null;
          staff_reviewed_at?: string | null;
          products_reviewed_at?: string | null;
          opening_stock_reviewed_at?: string | null;
          subscription_reviewed_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["pharmacy_onboarding"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "pharmacy_onboarding_pharmacy_id_fkey";
            columns: ["pharmacy_id"];
            isOneToOne: true;
            referencedRelation: "pharmacies";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          id: string;
          pharmacy_id: string;
          type: NotificationType;
          severity: NotificationSeverity;
          title: string;
          message: string;
          entity_type: string | null;
          entity_id: string | null;
          dedupe_key: string;
          status: NotificationStatus;
          first_seen_at: string;
          last_seen_at: string;
          read_at: string | null;
          resolved_at: string | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          pharmacy_id: string;
          type: NotificationType;
          severity: NotificationSeverity;
          title: string;
          message: string;
          entity_type?: string | null;
          entity_id?: string | null;
          dedupe_key: string;
          status?: NotificationStatus;
          first_seen_at?: string;
          last_seen_at?: string;
          read_at?: string | null;
          resolved_at?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["notifications"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "notifications_pharmacy_id_fkey";
            columns: ["pharmacy_id"];
            isOneToOne: false;
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
          reorder_level: number | null;
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
          reorder_level?: number | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["products"]["Insert"]>;
        Relationships: [];
      };
      product_price_history: {
        Row: {
          id: string;
          pharmacy_id: string;
          product_id: string;
          changed_by: string | null;
          old_unit_price: number | null;
          new_unit_price: number | null;
          old_pack_price: number | null;
          new_pack_price: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          pharmacy_id: string;
          product_id: string;
          changed_by?: string | null;
          old_unit_price?: number | null;
          new_unit_price?: number | null;
          old_pack_price?: number | null;
          new_pack_price?: number | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["product_price_history"]["Insert"]>;
        Relationships: [
          { foreignKeyName: "product_price_history_pharmacy_id_fkey"; columns: ["pharmacy_id"]; isOneToOne: false; referencedRelation: "pharmacies"; referencedColumns: ["id"] },
          { foreignKeyName: "product_price_history_product_id_fkey"; columns: ["product_id"]; isOneToOne: false; referencedRelation: "products"; referencedColumns: ["id"] },
          { foreignKeyName: "product_price_history_changed_by_fkey"; columns: ["changed_by"]; isOneToOne: false; referencedRelation: "pharmacy_users"; referencedColumns: ["id"] },
        ];
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
      inventory_adjustments: {
        Row: {
          id: string;
          pharmacy_id: string;
          product_id: string;
          inventory_batch_id: string | null;
          created_by: string | null;
          reason: InventoryAdjustmentReason;
          quantity: number;
          stock_effect: -1 | 0;
          note: string;
          created_at: string;
          reversed_at: string | null;
          reversed_by: string | null;
          reversal_reason: string;
        };
        Insert: {
          id?: string;
          pharmacy_id: string;
          product_id: string;
          inventory_batch_id?: string | null;
          created_by?: string | null;
          reason: InventoryAdjustmentReason;
          quantity: number;
          stock_effect: -1 | 0;
          note?: string;
          created_at?: string;
          reversed_at?: string | null;
          reversed_by?: string | null;
          reversal_reason?: string;
        };
        Update: Partial<Database["public"]["Tables"]["inventory_adjustments"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "inventory_adjustments_pharmacy_id_fkey";
            columns: ["pharmacy_id"];
            isOneToOne: false;
            referencedRelation: "pharmacies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_adjustments_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_adjustments_inventory_batch_id_fkey";
            columns: ["inventory_batch_id"];
            isOneToOne: false;
            referencedRelation: "inventory_batches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_adjustments_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "pharmacy_users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_adjustments_reversed_by_fkey";
            columns: ["reversed_by"];
            isOneToOne: false;
            referencedRelation: "pharmacy_users";
            referencedColumns: ["id"];
          },
        ];
      };
      sale_transactions: {
        Row: {
          id: string;
          pharmacy_id: string;
          created_by: string | null;
          item_count: number;
          total_amount: number;
          created_at: string;
          status: "COMPLETED" | "VOIDED";
          voided_at: string | null;
          voided_by: string | null;
          void_reason: string;
        };
        Insert: {
          id?: string;
          pharmacy_id: string;
          created_by?: string | null;
          item_count: number;
          total_amount: number;
          created_at?: string;
          status?: "COMPLETED" | "VOIDED";
          voided_at?: string | null;
          voided_by?: string | null;
          void_reason?: string;
        };
        Update: Partial<Database["public"]["Tables"]["sale_transactions"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "sale_transactions_pharmacy_id_fkey";
            columns: ["pharmacy_id"];
            isOneToOne: false;
            referencedRelation: "pharmacies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sale_transactions_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "pharmacy_users";
            referencedColumns: ["id"];
          },
        ];
      };
      sales: {
        Row: {
          id: string;
          pharmacy_id: string | null;
          transaction_id: string | null;
          line_number: number | null;
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
          voided_at: string | null;
          voided_by: string | null;
          void_reason: string;
        };
        Insert: {
          id?: string;
          pharmacy_id?: string | null;
          transaction_id?: string | null;
          line_number?: number | null;
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
          voided_at?: string | null;
          voided_by?: string | null;
          void_reason?: string;
        };
        Update: Partial<Database["public"]["Tables"]["sales"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "sales_transaction_id_fkey";
            columns: ["transaction_id"];
            isOneToOne: false;
            referencedRelation: "sale_transactions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sales_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      sale_batch_allocations: {
        Row: {
          id: string;
          pharmacy_id: string;
          sale_id: string;
          product_id: string;
          inventory_batch_id: string;
          quantity: number;
          unit_cost_at_sale: number;
          cost_of_goods_sold: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          pharmacy_id: string;
          sale_id: string;
          product_id: string;
          inventory_batch_id: string;
          quantity: number;
          unit_cost_at_sale: number;
          cost_of_goods_sold: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["sale_batch_allocations"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "sale_batch_allocations_pharmacy_id_fkey";
            columns: ["pharmacy_id"];
            isOneToOne: false;
            referencedRelation: "pharmacies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sale_batch_allocations_sale_id_fkey";
            columns: ["sale_id"];
            isOneToOne: false;
            referencedRelation: "sales";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sale_batch_allocations_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sale_batch_allocations_inventory_batch_id_fkey";
            columns: ["inventory_batch_id"];
            isOneToOne: false;
            referencedRelation: "inventory_batches";
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
          total_adjusted: number;
          available_stock: number;
          derived_unit_cost: number | null;
          reorder_level_configured: boolean;
          stock_status: StockStatus | null;
        };
        Relationships: [];
      };
      batch_expiry_summary: {
        Row: Database["public"]["Tables"]["inventory_batches"]["Row"] & {
          derived_unit_cost: number | null;
          expiry_status: ExpiryStatus;
          available_stock: number;
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
    Functions: {
      create_sale_transaction_v1: {
        Args: {
          p_pharmacy_id: string;
          p_created_by: string | null;
          p_items: Json;
        };
        Returns: Json;
      };
      create_sale_transaction_v2: {
        Args: {
          p_pharmacy_id: string;
          p_created_by: string | null;
          p_items: Json;
        };
        Returns: Json;
      };
      create_inventory_adjustment_v1: {
        Args: {
          p_pharmacy_id: string;
          p_created_by: string | null;
          p_product_id: string;
          p_inventory_batch_id: string | null;
          p_reason: InventoryAdjustmentReason;
          p_quantity: number;
          p_note?: string;
        };
        Returns: Json;
      };
      create_inventory_adjustment_v2: {
        Args: Database["public"]["Functions"]["create_inventory_adjustment_v1"]["Args"];
        Returns: Json;
      };
      create_sale_transaction_v3: {
        Args: Database["public"]["Functions"]["create_sale_transaction_v2"]["Args"];
        Returns: Json;
      };
      void_sale_transaction_v1: {
        Args: { p_pharmacy_id: string; p_voided_by: string; p_transaction_id: string; p_reason: string };
        Returns: Json;
      };
      void_legacy_sale_v1: {
        Args: { p_pharmacy_id: string; p_voided_by: string; p_sale_id: string; p_reason: string };
        Returns: Json;
      };
      reverse_inventory_adjustment_v1: {
        Args: { p_pharmacy_id: string; p_reversed_by: string; p_adjustment_id: string; p_reason: string };
        Returns: Json;
      };
      update_product_selling_prices_v1: {
        Args: { p_pharmacy_id: string; p_changed_by: string; p_product_id: string; p_unit_price: number | null; p_pack_price: number | null };
        Returns: Json;
      };
      restore_pharmastock_backup_v1: {
        Args: {
          p_target_pharmacy_id: string;
          p_backup: Json;
          p_fail_after?: string | null;
        };
        Returns: Json;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
