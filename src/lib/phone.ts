import { onlyDigits } from "@/lib/utils";

// DDDs em uso no Brasil (lista oficial da Anatel).
const BRAZIL_DDDS = new Set([
  "11", "12", "13", "14", "15", "16", "17", "18", "19",
  "21", "22", "24", "27", "28",
  "31", "32", "33", "34", "35", "37", "38",
  "41", "42", "43", "44", "45", "46", "47", "48", "49",
  "51", "53", "54", "55",
  "61", "62", "63", "64", "65", "66", "67", "68", "69",
  "71", "73", "74", "75", "77", "79",
  "81", "82", "83", "84", "85", "86", "87", "88", "89",
  "91", "92", "93", "94", "95", "96", "97", "98", "99",
]);

/**
 * Valida um celular brasileiro (comprador ou WhatsApp da loja), que vai pro entregador da Uber Direct: só
 * dígitos (a máscara é ignorada), DDD existente + 9 dígitos começando em 9, e
 * sem número de dígito repetido (99999999999). Devolve a mensagem de erro, ou
 * null se estiver válido.
 */
export function getMobilePhoneError(value: string): string | null {
  const digits = onlyDigits(value);

  if (digits.length !== 11) return "Informe o celular com DDD e 9 dígitos, ex.: (86) 99999-1234";
  if (!BRAZIL_DDDS.has(digits.slice(0, 2))) return "DDD inválido — confira o telefone";
  if (digits[2] !== "9") return "Informe um celular válido (começa com 9 depois do DDD)";
  if (/^(\d)\1+$/.test(digits.slice(2))) return "Telefone inválido — não use números repetidos";

  return null;
}

/**
 * Converte um telefone brasileiro pro formato E.164 (+55...) que a Uber Direct
 * exige: sem o "+", ela interpreta o número como americano e recusa. Números que
 * já trazem o 55 na frente (12 ou 13 dígitos) só ganham o "+".
 */
export function toE164Brazil(value: string): string {
  const digits = onlyDigits(value);
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) return `+${digits}`;
  return `+55${digits}`;
}
