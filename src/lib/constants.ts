export const COMMISSION_RATE = 0.1;

// slugs alinhados com a tabela `categories` do banco.
export const CATEGORIES = [
  { slug: "ceramica", label: "Cerâmica", icon: "🏺" },
  { slug: "capim-dourado", label: "Capim Dourado", icon: "🌾" },
  { slug: "bordado", label: "Bordado", icon: "🧵" },
  { slug: "couro", label: "Couro", icon: "👜" },
  { slug: "madeira", label: "Madeira", icon: "🪵" },
  { slug: "redes-tecidos", label: "Redes e Tecidos", icon: "🌿" },
  { slug: "bijuteria", label: "Bijuteria", icon: "💎" },
  { slug: "pintura", label: "Pintura", icon: "🎨" },
  { slug: "outros", label: "Outros", icon: "✨" },
];

/**
 * Placeholder inline (data URI) para quando um produto não tem imagem —
 * evita 404 de `/images/placeholder-product.png`.
 */
export const PLACEHOLDER_PRODUCT_IMG =
  "data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='400'%20height='400'%20viewBox='0%200%20400%20400'%3E%3Crect%20width='400'%20height='400'%20fill='%23f2e8dc'/%3E%3Cg%20fill='none'%20stroke='%23c4622d'%20stroke-width='10'%20stroke-linecap='round'%20stroke-linejoin='round'%3E%3Cpath%20d='M150%20120h100l15%2050H135z'/%3E%3Cpath%20d='M135%20170c0%200-30%2030-30%2090s35%20105%2095%20105%2095-45%2095-105-30-90-30-90'/%3E%3C/g%3E%3C/svg%3E";

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
export const SIGNED_URL_TTL = 60 * 5; // 5 minutos

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

export const STORE_STATUS_LABEL: Record<string, string> = {
  pending: "Em análise",
  active: "Ativa",
  suspended: "Suspensa",
};

export const STORE_STATUS_CLASS: Record<string, string> = {
  pending: "bg-amber/15 text-amber",
  active: "bg-capim/15 text-capim",
  suspended: "bg-destructive/15 text-destructive",
};

export const DOCUMENT_STATUS_LABEL: Record<string, string> = {
  pending: "Documento em análise",
  approved: "Documento aprovado",
  rejected: "Documento rejeitado",
};

export const DOCUMENT_STATUS_CLASS: Record<string, string> = {
  pending: "bg-amber/15 text-amber",
  approved: "bg-capim/15 text-capim",
  rejected: "bg-destructive/15 text-destructive",
};

export const ORDER_STATUS = {
  PENDING: "pending",
  CONFIRMED: "confirmed",
  SHIPPED: "shipped",
  DELIVERED: "delivered",
  CANCELLED: "cancelled",
} as const;

export const PAYMENT_STATUS_LABEL: Record<string, string> = {
  pending: "Aguardando pagamento",
  paid: "Pago",
  failed: "Falhou",
  refunded: "Reembolsado",
  cancelled: "Cancelado",
};

export const PAYMENT_STATUS_CLASS: Record<string, string> = {
  pending: "bg-amber/15 text-amber",
  paid: "bg-capim/15 text-capim",
  failed: "bg-destructive/15 text-destructive",
  refunded: "bg-muted text-muted-foreground",
  cancelled: "bg-destructive/15 text-destructive",
};
