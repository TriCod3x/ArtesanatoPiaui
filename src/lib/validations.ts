import { z } from "zod";

export const signInSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "Senha deve ter no mínimo 6 caracteres"),
});

export const signUpSchema = z.object({
  full_name: z.string().min(2, "Nome deve ter no mínimo 2 caracteres"),
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "Senha deve ter no mínimo 6 caracteres"),
  role: z.enum(["buyer", "seller"], { error: "Selecione um perfil" }),
  phone: z.string().optional(),
});

export const storeSchema = z.object({
  name: z.string().min(3, "Nome deve ter no mínimo 3 caracteres"),
  slug: z.string().min(3, "Slug inválido"),
  description: z.string().min(20, "Descrição deve ter no mínimo 20 caracteres"),
  city: z.string().min(2, "Cidade obrigatória"),
  state: z.string().min(2),
  whatsapp: z.string().min(10, "WhatsApp inválido"),
  instagram: z.string().optional(),
  logo_url: z.string().optional(),
  banner_url: z.string().optional(),
});

export const productSchema = z.object({
  name: z.string().min(3, "Nome deve ter no mínimo 3 caracteres"),
  slug: z.string().min(3, "Slug inválido"),
  description: z.string().min(20, "Descrição deve ter no mínimo 20 caracteres"),
  price: z.number().positive("Preço deve ser maior que zero"),
  stock: z.number().int().min(0, "Estoque não pode ser negativo"),
  category_id: z.string().uuid("Categoria inválida").optional().nullable(),
  tags: z.array(z.string()).optional(),
  status: z.enum(["active", "inactive", "out_of_stock"]),
  weight_grams: z.number().int().positive().optional().nullable(),
});

export const postSchema = z.object({
  content: z
    .string()
    .trim()
    .min(3, "Escreva pelo menos 3 caracteres")
    .max(1000, "Máximo de 1000 caracteres"),
  product_id: z.string().uuid("Produto inválido").optional().or(z.literal("")),
});

export const commentSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, "Escreva um comentário")
    .max(500, "Máximo de 500 caracteres"),
});

export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
export type StoreInput = z.infer<typeof storeSchema>;
export type ProductInput = z.infer<typeof productSchema>;
export type PostInput = z.infer<typeof postSchema>;
export type CommentInput = z.infer<typeof commentSchema>;
