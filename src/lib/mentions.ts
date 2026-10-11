// Marcação com @ nos posts da comunidade (usuários e lojas).
//
// Formato no texto: @[Nome](user:UUID) ou @[Nome](store:UUID). Só o token
// conta como menção — "@texto" digitado à mão é texto comum. Este módulo é
// puro (sem I/O) de propósito, pra ser testado com node --test; a busca no
// banco e a gravação ficam em src/actions/community.ts.

export const MAX_MENTIONS = 5;
export const MENTION_NAME_MAX = 80;
export const POST_TEXT_MIN = 3;
export const POST_TEXT_MAX = 1000;
/** Teto do texto cru (com tokens): 5 marcações de ~120 caracteres a mais que o texto visível. */
export const POST_RAW_MAX = POST_TEXT_MAX + MAX_MENTIONS * 120;

export type MentionKind = "user" | "store";

export interface MentionToken {
  start: number;
  end: number;
  name: string;
  kind: MentionKind;
  /** Normalizado em minúsculas. */
  id: string;
}

export interface ParsedMentions {
  tokens: MentionToken[];
  /** Tokens com forma de marcação mas id que não é UUID. */
  malformed: string[];
}

export interface ResolvedMention {
  kind: MentionKind;
  id: string;
  name: string;
}

export type ApplyMentionsResult =
  | { ok: true; content: string; mentions: ResolvedMention[] }
  | { ok: false; error: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN_RE = /@\[([^\]\n]*)\]\((user|store):([^)\n]*)\)/g;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export function mentionKey(kind: MentionKind, id: string): string {
  return `${kind}:${id.toLowerCase()}`;
}

/** Nome seguro pra caber num token: sem [ ] ( ) nem quebra de linha. */
export function sanitizeMentionName(name: string): string {
  return name
    .replace(/[[\]()\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MENTION_NAME_MAX);
}

export function formatMentionToken(name: string, kind: MentionKind, id: string): string {
  return `@[${sanitizeMentionName(name)}](${kind}:${id.toLowerCase()})`;
}

export function parseMentions(content: string): ParsedMentions {
  const tokens: MentionToken[] = [];
  const malformed: string[] = [];

  for (const match of content.matchAll(TOKEN_RE)) {
    const [raw, name, kind, id] = match;
    if (!isUuid(id)) {
      malformed.push(raw);
      continue;
    }
    tokens.push({
      start: match.index,
      end: match.index + raw.length,
      name,
      kind: kind as MentionKind,
      id: id.toLowerCase(),
    });
  }

  return { tokens, malformed };
}

/** Alvos distintos (o mesmo token repetido conta uma vez só). */
export function uniqueMentionTargets(tokens: MentionToken[]): { kind: MentionKind; id: string }[] {
  const seen = new Map<string, { kind: MentionKind; id: string }>();
  for (const t of tokens) {
    const key = mentionKey(t.kind, t.id);
    if (!seen.has(key)) seen.set(key, { kind: t.kind, id: t.id });
  }
  return [...seen.values()];
}

/** Checagens que não dependem do banco. Devolve a mensagem de erro, ou null. */
export function checkMentionShape(parsed: ParsedMentions): string | null {
  if (parsed.malformed.length > 0) return "Marcação inválida no texto.";
  if (uniqueMentionTargets(parsed.tokens).length > MAX_MENTIONS) {
    return `Você pode marcar no máximo ${MAX_MENTIONS} pessoas ou lojas por post.`;
  }
  return null;
}

/**
 * Reescreve cada token com o nome que está no banco (`found`, indexado por
 * mentionKey) — o nome que veio do cliente é descartado. Rejeita se algum id
 * não foi encontrado (usuário inexistente / loja não ativa).
 */
export function applyMentions(
  content: string,
  parsed: ParsedMentions,
  found: Map<string, string>,
): ApplyMentionsResult {
  const shapeError = checkMentionShape(parsed);
  if (shapeError) return { ok: false, error: shapeError };

  const mentions: ResolvedMention[] = [];
  for (const target of uniqueMentionTargets(parsed.tokens)) {
    const dbName = found.get(mentionKey(target.kind, target.id));
    if (dbName === undefined) {
      return { ok: false, error: "Uma das pessoas ou lojas marcadas não existe mais." };
    }
    mentions.push({ kind: target.kind, id: target.id, name: sanitizeMentionName(dbName) });
  }

  const nameOf = new Map(mentions.map((m) => [mentionKey(m.kind, m.id), m.name]));
  let out = content;
  // De trás pra frente, pra os índices dos tokens anteriores continuarem valendo.
  for (const t of [...parsed.tokens].reverse()) {
    const name = nameOf.get(mentionKey(t.kind, t.id)) ?? "";
    out = out.slice(0, t.start) + `@[${name}](${t.kind}:${t.id})` + out.slice(t.end);
  }

  return { ok: true, content: out, mentions };
}

export type MentionSegment =
  | { type: "text"; text: string }
  | { type: "mention"; name: string; kind: MentionKind; id: string };

/** Quebra o texto em trechos de texto e de menção, pra renderizar como nós React. */
export function splitMentionSegments(content: string): MentionSegment[] {
  const { tokens } = parseMentions(content);
  const segments: MentionSegment[] = [];
  let cursor = 0;
  for (const t of tokens) {
    if (t.start > cursor) segments.push({ type: "text", text: content.slice(cursor, t.start) });
    segments.push({ type: "mention", name: t.name, kind: t.kind, id: t.id });
    cursor = t.end;
  }
  if (cursor < content.length) segments.push({ type: "text", text: content.slice(cursor) });
  return segments;
}

/** Texto como o leitor vê: tokens viram "@Nome". */
export function mentionsToPlainText(content: string): string {
  return splitMentionSegments(content)
    .map((s) => (s.type === "text" ? s.text : `@${s.name}`))
    .join("");
}

/** Mensagem de erro do tamanho do texto, ou null. Mede o texto visível. */
export function checkPostTextLength(content: string): string | null {
  if (content.length > POST_RAW_MAX) return `Máximo de ${POST_TEXT_MAX} caracteres`;
  const visible = mentionsToPlainText(content).trim();
  if (visible.length < POST_TEXT_MIN) return `Escreva pelo menos ${POST_TEXT_MIN} caracteres`;
  if (visible.length > POST_TEXT_MAX) return `Máximo de ${POST_TEXT_MAX} caracteres`;
  return null;
}

/**
 * Autocomplete: dado o texto e a posição do cursor, acha o "@consulta" que
 * está sendo digitado (começo do texto ou depois de espaço, sem espaço dentro).
 */
export function findMentionQuery(
  text: string,
  caret: number,
): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf("@");
  if (at === -1) return null;
  if (at > 0 && !/\s/.test(before[at - 1])) return null;
  const query = before.slice(at + 1);
  if (/[\s@[\]()]/.test(query) || query.length > 40) return null;
  return { start: at, query };
}
