import type { Tables, Enums } from "./database"

export type Role = Enums<"user_role">
export type StoreStatus = Enums<"store_status">
export type ProductStatus = Enums<"product_status">
export type OrderStatus = Enums<"order_status">
export type CommissionStatus = Enums<"commission_status">
export type ContactType = Enums<"contact_type">

export type Profile = Tables<"profiles">
export type Store = Tables<"stores">
export type Product = Tables<"products">
export type Order = Tables<"orders">
export type OrderItem = Tables<"order_items">
export type Favorite = Tables<"favorites">
export type Review = Tables<"reviews">
export type StoreContact = Tables<"store_contacts">
export type ProductImage = Tables<"product_images">
export type Category = Tables<"categories">
export type Commission = Tables<"commissions">

// Joined/extended types for UI use
export interface ProductWithRelations extends Product {
  store?: Store & { contacts?: StoreContact[] }
  category?: Category
  images?: ProductImage[]
}

export interface StoreWithContacts extends Store {
  contacts?: StoreContact[]
  whatsapp?: string
  instagram?: string
}

export interface CartItem {
  product: ProductWithRelations
  quantity: number
}

export interface CommunityPost {
  id: string
  store_id: string
  content: string
  image_url: string | null
  created_at: string
  store?: { name: string; slug: string; logo_url: string | null }
}
