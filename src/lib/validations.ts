import { z } from "zod";
import { isValidCPF, isValidCNPJ, onlyDigits } from "@/lib/utils";

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

// ── Cadastro de vendedor (KYC-lite) ─────────────────────────────────────────

export const MAX_ID_DOCUMENT_BYTES = 5 * 1024 * 1024; // 5MB
export const ACCEPTED_ID_DOCUMENT_TYPES = [
  "image/jpeg",
  "image/png",
  "application/pdf",
] as const;

/** Etapa 1 — dados da conta. */
export const sellerAccountSchema = z.object({
  full_name: z.string().trim().min(2, "Nome deve ter no mínimo 2 caracteres"),
  email: z.string().trim().email("Email inválido"),
  password: z.string().min(6, "Senha deve ter no mínimo 6 caracteres"),
});

/** Etapa 2 — CPF / CNPJ. */
export const sellerDocumentIdsSchema = z.object({
  cpf: z
    .string()
    .trim()
    .refine((v) => isValidCPF(v), "CPF inválido"),
  cnpj: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && onlyDigits(v).length > 0 ? v : undefined))
    .refine((v) => v === undefined || isValidCNPJ(v), "CNPJ inválido"),
});

/** Etapa 3 — endereço (preenchido em parte pela busca de CEP). */
export const sellerAddressSchema = z.object({
  cep: z
    .string()
    .trim()
    .refine((v) => onlyDigits(v).length === 8, "CEP deve ter 8 dígitos"),
  address_street: z.string().trim().min(3, "Informe a rua"),
  address_number: z.string().trim().min(1, "Informe o número"),
  address_complement: z.string().trim().optional(),
  address_neighborhood: z.string().trim().min(2, "Informe o bairro"),
  address_city: z.string().trim().min(2, "Informe a cidade"),
  address_state: z
    .string()
    .trim()
    .length(2, "UF deve ter 2 letras")
    .transform((v) => v.toUpperCase()),
});

/** Etapa 5 — termos de uso. */
export const sellerTermsSchema = z.object({
  accept_terms: z.literal(true, {
    error: "Você precisa aceitar os termos de uso para continuar",
  }),
});

/** Payload completo recebido pela server action `submitSellerRequirements`. */
export const submitSellerRequirementsSchema = sellerDocumentIdsSchema
  .and(sellerAddressSchema)
  .and(sellerTermsSchema);

export type SellerAccountInput = z.infer<typeof sellerAccountSchema>;
export type SellerDocumentIdsInput = z.infer<typeof sellerDocumentIdsSchema>;
export type SellerAddressInput = z.infer<typeof sellerAddressSchema>;
export type SellerTermsInput = z.infer<typeof sellerTermsSchema>;
export type SubmitSellerRequirementsInput = z.infer<
  typeof submitSellerRequirementsSchema
>;

// ── Dados bancários do vendedor (Pagar.me recipient) ────────────────────────

export const bankDetailsSchema = z.object({
  bank_code: z
    .string()
    .trim()
    .refine((v) => /^\d{3}$/.test(v), "Selecione um banco"),
  bank_agency: z
    .string()
    .trim()
    .min(1, "Informe a agência")
    .refine((v) => /^\d{1,6}$/.test(onlyDigits(v)), "Agência inválida")
    .transform((v) => onlyDigits(v)),
  bank_account: z
    .string()
    .trim()
    .min(1, "Informe o número da conta")
    .refine((v) => /^\d{1,13}$/.test(onlyDigits(v)), "Conta inválida")
    .transform((v) => onlyDigits(v)),
  bank_account_digit: z
    .string()
    .trim()
    .min(1, "Informe o dígito")
    .max(2, "Dígito inválido")
    .transform((v) => v.replace(/[^0-9xX]/g, "").toLowerCase()),
  bank_account_type: z.enum(["checking", "savings"], {
    error: "Selecione o tipo de conta",
  }),
});

export type BankDetailsInput = z.infer<typeof bankDetailsSchema>;

export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
export type StoreInput = z.infer<typeof storeSchema>;
export type ProductInput = z.infer<typeof productSchema>;
export type PostInput = z.infer<typeof postSchema>;
export type CommentInput = z.infer<typeof commentSchema>;
