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
