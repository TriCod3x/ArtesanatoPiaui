export const COMMISSION_RATE = 0.1;

export const CATEGORIES = [
  { slug: "ceramica", label: "Cerâmica", icon: "🏺" },
  { slug: "capim-dourado", label: "Capim Dourado", icon: "🌾" },
  { slug: "rendas-bordados", label: "Rendas e Bordados", icon: "🧵" },
  { slug: "couro", label: "Couro", icon: "👜" },
  { slug: "madeira", label: "Madeira", icon: "🪵" },
  { slug: "palha", label: "Palha e Fibras", icon: "🌿" },
  { slug: "bijuterias", label: "Bijuterias", icon: "💎" },
  { slug: "pinturas", label: "Pinturas", icon: "🎨" },
  { slug: "escultura", label: "Esculturas", icon: "🗿" },
  { slug: "outros", label: "Outros", icon: "✨" },
];

export const CITIES_PI = [
  "Teresina",
  "Parnaíba",
  "Picos",
  "Floriano",
  "Campo Maior",
  "Oeiras",
  "São Raimundo Nonato",
  "Piripiri",
  "União",
  "Altos",
];

export const MAX_PRODUCT_IMAGES = 5;

export const IDENTITY_DOCUMENTS_BUCKET = "identity-documents";

export const DOCUMENT_STATUS = {
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
} as const;
export const STORE_STATUS = {
  PENDING: "pending",
  ACTIVE: "active",
  SUSPENDED: "suspended",
} as const;

export const ORDER_STATUS = {
  PENDING: "pending",
  CONFIRMED: "confirmed",
  SHIPPED: "shipped",
  DELIVERED: "delivered",
  CANCELLED: "cancelled",
} as const;

// ── Pagamento (Pagar.me) ────────────────────────────────────────────────────

/** Validade do QR code Pix, em segundos (1h). */
export const PIX_EXPIRES_IN_SECONDS = 60 * 60;

/** Parcelamento máximo no cartão de crédito. */
export const MAX_INSTALLMENTS = 12;

/** Texto que aparece na fatura do cartão do comprador (máx. 13 chars). */
export const CARD_STATEMENT_DESCRIPTOR = "ARTESANATOPI";

/**
 * Bancos brasileiros mais comuns. `code` é o número de compensação usado
 * tanto pelo Pagar.me (`bank`) quanto pela ficha de compensação.
 */
export const BRAZILIAN_BANKS: { code: string; name: string }[] = [
  { code: "001", name: "Banco do Brasil" },
  { code: "104", name: "Caixa Econômica Federal" },
  { code: "237", name: "Bradesco" },
  { code: "341", name: "Itaú Unibanco" },
  { code: "033", name: "Santander" },
  { code: "260", name: "Nu Pagamentos (Nubank)" },
  { code: "077", name: "Banco Inter" },
  { code: "336", name: "Banco C6" },
  { code: "212", name: "Banco Original" },
  { code: "748", name: "Sicredi" },
  { code: "756", name: "Sicoob" },
  { code: "422", name: "Banco Safra" },
  { code: "070", name: "BRB - Banco de Brasília" },
  { code: "085", name: "Ailos" },
  { code: "655", name: "Banco Votorantim / Neon" },
  { code: "290", name: "PagBank (PagSeguro)" },
  { code: "323", name: "Mercado Pago" },
  { code: "380", name: "PicPay" },
];

export const BANK_ACCOUNT_TYPES = [
  { value: "checking", label: "Conta corrente" },
  { value: "savings", label: "Conta poupança" },
] as const;
