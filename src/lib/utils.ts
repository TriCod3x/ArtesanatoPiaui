import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPrice(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

export function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export function formatWhatsApp(phone: string, productName?: string): string {
  const cleaned = phone.replace(/\D/g, "");
  const number = cleaned.startsWith("55") ? cleaned : `55${cleaned}`;
  const text = productName
    ? `Olá! Vi o produto "${productName}" na Artesanatos Piauí e tenho interesse.`
    : `Olá! Vi sua loja no Artesanatos Piauí e quero saber mais.`;
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

export function stripPhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

export function timeAgo(date: string | Date): string {
  const then = new Date(date).getTime();
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));

  if (seconds < 60) return "agora mesmo";

  const units: [number, string, string][] = [
    [60, "minuto", "minutos"],
    [3600, "hora", "horas"],
    [86400, "dia", "dias"],
    [604800, "semana", "semanas"],
    [2592000, "mês", "meses"],
    [31536000, "ano", "anos"],
  ];

  let chosen = units[0];
  for (const unit of units) {
    if (seconds >= unit[0]) chosen = unit;
  }

  const value = Math.floor(seconds / chosen[0]);
  return `há ${value} ${value === 1 ? chosen[1] : chosen[2]}`;
}
