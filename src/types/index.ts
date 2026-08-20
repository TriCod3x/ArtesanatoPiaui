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

export type CommunityPost = Tables<"community_posts">
export type PostComment = Tables<"post_comments">
export type PostLike = Tables<"post_likes">

export interface PostAuthor {
  id: string
  full_name: string
  avatar_url: string | null
}

export interface PostProductRef {
  id: string
  name: string
  slug: string
  price: number
  images?: { url: string; is_cover?: boolean; position?: number }[]
}

export interface PostWithRelations extends CommunityPost {
  author?: PostAuthor | null
  product?: PostProductRef | null
  likes_count: number
  comments_count: number
  liked_by_me: boolean
}

export interface CommentWithAuthor extends PostComment {
  author?: PostAuthor | null
}
