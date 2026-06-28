import type { ExpiryStatus, OverrideFlag, SellingMode, SellType, StockStatus } from "@/lib/types";

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      pharmacies: {
        Row: {
          id: string;
          pharmacy_name: string;
          owner_name: string;
          phone: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          pharmacy_name: string;
          owner_name: string;
          phone: string;
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
          session_token: string;
          created_at: string;
          expires_at: string;
          last_seen: string;
        };
        Insert: {
          id?: string;
          pharmacy_id: string;
          session_token: string;
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
