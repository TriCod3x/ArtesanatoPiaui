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
      categories: {
        Row: {
          created_at: string
          description: string | null
          icon_url: string | null
          id: string
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          icon_url?: string | null
          id?: string
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          description?: string | null
          icon_url?: string | null
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      commissions: {
        Row: {
          commission_amount: number
          commission_rate: number
          created_at: string
          gross_amount: number
          id: string
          net_amount: number
          order_item_id: string
          paid_at: string | null
          status: Database["public"]["Enums"]["commission_status"]
          store_id: string
        }
        Insert: {
          commission_amount: number
          commission_rate: number
          created_at?: string
          gross_amount: number
          id?: string
          net_amount: number
          order_item_id: string
          paid_at?: string | null
          status?: Database["public"]["Enums"]["commission_status"]
          store_id: string
        }
        Update: {
          commission_amount?: number
          commission_rate?: number
          created_at?: string
          gross_amount?: number
          id?: string
          net_amount?: number
          order_item_id?: string
          paid_at?: string | null
          status?: Database["public"]["Enums"]["commission_status"]
          store_id?: string
        }
        Relationships: [
          { foreignKeyName: "commissions_order_item_id_fkey"; columns: ["order_item_id"]; referencedRelation: "order_items"; referencedColumns: ["id"] },
          { foreignKeyName: "commissions_store_id_fkey"; columns: ["store_id"]; referencedRelation: "stores"; referencedColumns: ["id"] }
        ]
      }
      favorites: {
        Row: {
          created_at: string
          id: string
          product_id: string | null
          store_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id?: string | null
          store_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string | null
          store_id?: string | null
          user_id?: string
        }
        Relationships: [
          { foreignKeyName: "favorites_product_id_fkey"; columns: ["product_id"]; referencedRelation: "products"; referencedColumns: ["id"] },
          { foreignKeyName: "favorites_store_id_fkey"; columns: ["store_id"]; referencedRelation: "stores"; referencedColumns: ["id"] },
          { foreignKeyName: "favorites_user_id_fkey"; columns: ["user_id"]; referencedRelation: "profiles"; referencedColumns: ["id"] }
        ]
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          item_status: Database["public"]["Enums"]["order_status"]
          order_id: string
          product_id: string
          quantity: number
          store_id: string
          subtotal: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          item_status?: Database["public"]["Enums"]["order_status"]
          order_id: string
          product_id: string
          quantity: number
          store_id: string
          subtotal: number
          unit_price: number
        }
        Update: {
          created_at?: string
          id?: string
          item_status?: Database["public"]["Enums"]["order_status"]
          order_id?: string
          product_id?: string
          quantity?: number
          store_id?: string
          subtotal?: number
          unit_price?: number
        }
        Relationships: [
          { foreignKeyName: "order_items_order_id_fkey"; columns: ["order_id"]; referencedRelation: "orders"; referencedColumns: ["id"] },
          { foreignKeyName: "order_items_product_id_fkey"; columns: ["product_id"]; referencedRelation: "products"; referencedColumns: ["id"] },
          { foreignKeyName: "order_items_store_id_fkey"; columns: ["store_id"]; referencedRelation: "stores"; referencedColumns: ["id"] }
        ]
      }
      orders: {
        Row: {
          buyer_id: string
          created_at: string
          id: string
          notes: string | null
          status: Database["public"]["Enums"]["order_status"]
          total_amount: number
          updated_at: string
        }
        Insert: {
          buyer_id: string
          created_at?: string
          id?: string
          notes?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          total_amount: number
          updated_at?: string
        }
        Update: {
          buyer_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          { foreignKeyName: "orders_buyer_id_fkey"; columns: ["buyer_id"]; referencedRelation: "profiles"; referencedColumns: ["id"] }
        ]
      }
      product_images: {
        Row: {
          created_at: string
          id: string
          is_cover: boolean
          position: number
          product_id: string
          url: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_cover?: boolean
          position?: number
          product_id: string
          url: string
        }
        Update: {
          created_at?: string
          id?: string
          is_cover?: boolean
          position?: number
          product_id?: string
          url?: string
        }
        Relationships: [
          { foreignKeyName: "product_images_product_id_fkey"; columns: ["product_id"]; referencedRelation: "products"; referencedColumns: ["id"] }
        ]
      }
      products: {
        Row: {
          category_id: string | null
          created_at: string
          description: string | null
          id: string
          is_featured: boolean
          name: string
          price: number
          slug: string
          status: Database["public"]["Enums"]["product_status"]
          stock: number
          store_id: string
          tags: string[] | null
          updated_at: string
          weight_grams: number | null
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_featured?: boolean
          name: string
          price: number
          slug: string
          status?: Database["public"]["Enums"]["product_status"]
          stock?: number
          store_id: string
          tags?: string[] | null
          updated_at?: string
          weight_grams?: number | null
        }
        Update: {
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_featured?: boolean
          name?: string
          price?: number
          slug?: string
          status?: Database["public"]["Enums"]["product_status"]
          stock?: number
          store_id?: string
          tags?: string[] | null
          updated_at?: string
          weight_grams?: number | null
        }
        Relationships: [
          { foreignKeyName: "products_category_id_fkey"; columns: ["category_id"]; referencedRelation: "categories"; referencedColumns: ["id"] },
          { foreignKeyName: "products_store_id_fkey"; columns: ["store_id"]; referencedRelation: "stores"; referencedColumns: ["id"] }
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          city: string | null
          created_at: string
          full_name: string
          id: string
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          state: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          city?: string | null
          created_at?: string
          full_name: string
          id: string
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          state?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          city?: string | null
          created_at?: string
          full_name?: string
          id?: string
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          state?: string
          updated_at?: string
        }
        Relationships: []
      }
      reviews: {
        Row: {
          buyer_id: string
          comment: string | null
          created_at: string
          id: string
          order_item_id: string | null
          product_id: string
          rating: number
          store_id: string
        }
        Insert: {
          buyer_id: string
          comment?: string | null
          created_at?: string
          id?: string
          order_item_id?: string | null
          product_id: string
          rating: number
          store_id: string
        }
        Update: {
          buyer_id?: string
          comment?: string | null
          created_at?: string
          id?: string
          order_item_id?: string | null
          product_id?: string
          rating?: number
          store_id?: string
        }
        Relationships: [
          { foreignKeyName: "reviews_buyer_id_fkey"; columns: ["buyer_id"]; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "reviews_order_item_id_fkey"; columns: ["order_item_id"]; referencedRelation: "order_items"; referencedColumns: ["id"] },
          { foreignKeyName: "reviews_product_id_fkey"; columns: ["product_id"]; referencedRelation: "products"; referencedColumns: ["id"] },
          { foreignKeyName: "reviews_store_id_fkey"; columns: ["store_id"]; referencedRelation: "stores"; referencedColumns: ["id"] }
        ]
      }
      store_contacts: {
        Row: {
          created_at: string
          id: string
          is_primary: boolean
          store_id: string
          type: Database["public"]["Enums"]["contact_type"]
          value: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_primary?: boolean
          store_id: string
          type: Database["public"]["Enums"]["contact_type"]
          value: string
        }
        Update: {
          created_at?: string
          id?: string
          is_primary?: boolean
          store_id?: string
          type?: Database["public"]["Enums"]["contact_type"]
          value?: string
        }
        Relationships: [
          { foreignKeyName: "store_contacts_store_id_fkey"; columns: ["store_id"]; referencedRelation: "stores"; referencedColumns: ["id"] }
        ]
      }
      stores: {
        Row: {
          address: string | null
          banner_url: string | null
          city: string
          commission_rate: number
          created_at: string
          description: string | null
          id: string
          logo_url: string | null
          name: string
          owner_id: string
          rating: number | null
          rating_count: number
          slug: string
          state: string
          status: Database["public"]["Enums"]["store_status"]
          total_sales: number
          updated_at: string
        }
        Insert: {
          address?: string | null
          banner_url?: string | null
          city: string
          commission_rate?: number
          created_at?: string
          description?: string | null
          id?: string
          logo_url?: string | null
          name: string
          owner_id: string
          rating?: number | null
          rating_count?: number
          slug: string
          state?: string
          status?: Database["public"]["Enums"]["store_status"]
          total_sales?: number
          updated_at?: string
        }
        Update: {
          address?: string | null
          banner_url?: string | null
          city?: string
          commission_rate?: number
          created_at?: string
          description?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          owner_id?: string
          rating?: number | null
          rating_count?: number
          slug?: string
          state?: string
          status?: Database["public"]["Enums"]["store_status"]
          total_sales?: number
          updated_at?: string
        }
        Relationships: [
          { foreignKeyName: "stores_owner_id_fkey"; columns: ["owner_id"]; referencedRelation: "profiles"; referencedColumns: ["id"] }
        ]
      }
    }
    Views: Record<string, never>
    Functions: {
      unaccent: {
        Args: { "": string }
        Returns: string
      }
    }
    Enums: {
      commission_status: "pending" | "paid" | "cancelled"
      contact_type: "whatsapp" | "email" | "instagram" | "facebook"
      order_status: "pending" | "confirmed" | "shipped" | "delivered" | "cancelled"
      product_status: "active" | "inactive" | "out_of_stock"
      store_status: "pending" | "active" | "suspended"
      user_role: "buyer" | "seller" | "admin"
    }
    CompositeTypes: Record<string, never>
  }
}

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"]

export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"]

export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"]

export type Enums<T extends keyof Database["public"]["Enums"]> =
  Database["public"]["Enums"][T]
