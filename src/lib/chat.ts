// Regras puras do chat comprador <-> loja (sem I/O): validação de conteúdo,
// motivos de denúncia, snapshot, aviso de comprador desconhecido, limites de
// denúncia e tradução de erros do banco. Ficam aqui, e não no arquivo
// "use server", pra serem testáveis e importáveis pelo client.

export const MESSAGE_MAX_LENGTH = 2000;
export const REPORT_DETAILS_MAX_LENGTH = 500;
export const REPORT_SNAPSHOT_SIZE = 5;
/** Janela de uma denúncia por (denunciante, conversa). */
export const REPORT_COOLDOWN_MS = 24 * 60 * 60 * 1000;
/** Janela e limiar do alerta de auditoria pros admins. */
export const REPORT_AUDIT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
export const REPORT_AUDIT_DISTINCT_REPORTERS = 3;

export const GENERIC_SEND_ERROR = "Não foi possível enviar a mensagem agora";

// ---------------------------------------------------------------------------
// Conteúdo da mensagem
// ---------------------------------------------------------------------------

export type MessageContentResult = { ok: true; content: string } | { ok: false; error: string };

/**
 * Trim e limite de 1..2000 caracteres. Conta por code point (como o
 * char_length do Postgres), não por unidade UTF-16, pra emoji não estourar o
 * limite no JS e passar no banco ou vice-versa.
 */
export function validateMessageContent(raw: unknown): MessageContentResult {
  if (typeof raw !== "string") return { ok: false, error: "A mensagem não pode estar vazia." };
  const content = raw.trim();
  if (content.length === 0) return { ok: false, error: "A mensagem não pode estar vazia." };
  if ([...content].length > MESSAGE_MAX_LENGTH) {
    return { ok: false, error: `A mensagem pode ter no máximo ${MESSAGE_MAX_LENGTH} caracteres.` };
  }
  return { ok: true, content };
}

/** Quebras de linha viram um array de linhas (render como nós de texto). */
export function splitMessageLines(content: string): string[] {
  return content.replace(/\r\n?/g, "\n").split("\n");
}

// ---------------------------------------------------------------------------
// Denúncia
// ---------------------------------------------------------------------------

export const REPORT_REASONS = ["spam", "golpe", "assedio", "conteudo_improprio", "outro"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_REASON_LABEL: Record<ReportReason, string> = {
  spam: "Spam",
  golpe: "Golpe ou fraude",
  assedio: "Assédio ou ofensa",
  conteudo_improprio: "Conteúdo impróprio",
  outro: "Outro motivo",
};

export function isReportReason(value: unknown): value is ReportReason {
  return typeof value === "string" && (REPORT_REASONS as readonly string[]).includes(value);
}

export const REPORT_RESOLUTION_STATUSES = ["reviewed", "dismissed", "actioned"] as const;
export type ReportResolutionStatus = (typeof REPORT_RESOLUTION_STATUSES)[number];

export function isReportResolutionStatus(value: unknown): value is ReportResolutionStatus {
  return (
    typeof value === "string" && (REPORT_RESOLUTION_STATUSES as readonly string[]).includes(value)
  );
}

export type ReportDetailsResult = { ok: true; details: string | null } | { ok: false; error: string };

export function normalizeReportDetails(raw: unknown): ReportDetailsResult {
  if (raw === undefined || raw === null) return { ok: true, details: null };
  if (typeof raw !== "string") return { ok: false, error: "Detalhes inválidos." };
  const details = raw.trim();
  if ([...details].length > REPORT_DETAILS_MAX_LENGTH) {
    return {
      ok: false,
      error: `Os detalhes podem ter no máximo ${REPORT_DETAILS_MAX_LENGTH} caracteres.`,
    };
  }
  return { ok: true, details: details || null };
}

export interface SnapshotSourceMessage {
  id: string;
  sender_id: string;
  content: string;
  created_at: string;
}

export interface ReportSnapshotEntry {
  author_id: string;
  author_name: string;
  text: string;
  at: string;
}

/**
 * Últimas `size` mensagens, em ordem cronológica (da mais antiga pra mais
 * nova). Não depende da ordem de entrada. Empate de horário desempata por id,
 * pra o resultado ser determinístico.
 */
export function buildReportSnapshot(
  messages: SnapshotSourceMessage[],
  nameById: ReadonlyMap<string, string>,
  size: number = REPORT_SNAPSHOT_SIZE,
): ReportSnapshotEntry[] {
  return [...messages]
    .sort((a, b) => {
      const byDate = Date.parse(a.created_at) - Date.parse(b.created_at);
      return byDate !== 0 ? byDate : a.id.localeCompare(b.id);
    })
    .slice(-size)
    .map((m) => ({
      author_id: m.sender_id,
      author_name: nameById.get(m.sender_id) ?? "Usuário",
      text: m.content,
      at: m.created_at,
    }));
}

export interface ExistingReport {
  status: string;
  created_at: string;
}

/**
 * No máximo uma denúncia aberta por (denunciante, conversa), e no máximo uma
 * a cada 24 h: bloqueia se existe alguma ainda aberta OU criada na janela.
 */
export function canReportAgain(existing: ExistingReport[], now: number = Date.now()): boolean {
  return !existing.some(
    (r) => r.status === "open" || now - Date.parse(r.created_at) < REPORT_COOLDOWN_MS,
  );
}

export function countDistinctReporters(reports: { reporter_id: string }[]): number {
  return new Set(reports.map((r) => r.reporter_id)).size;
}

/** 3 denunciantes DISTINTOS em 30 dias → alerta de auditoria (sem banir). */
export function shouldAlertAdmins(distinctReporters: number): boolean {
  return distinctReporters >= REPORT_AUDIT_DISTINCT_REPORTERS;
}

// ---------------------------------------------------------------------------
// Aviso "comprador desconhecido" (visto só pela loja)
// ---------------------------------------------------------------------------

export function shouldWarnUnknownBuyer(params: {
  viewerIsStoreOwner: boolean;
  buyerHasPaidOrderAtStore: boolean;
}): boolean {
  return params.viewerIsStoreOwner && !params.buyerHasPaidOrderAtStore;
}

// ---------------------------------------------------------------------------
// Erros do banco
// ---------------------------------------------------------------------------

export type ChatDbError = "rate_limit_conversations" | "rate_limit_messages" | "disabled" | "other";

/** Os triggers da migration levantam mensagens curtas e estáveis. */
export function classifyChatDbError(error: { message?: string; code?: string } | null): ChatDbError {
  const message = error?.message ?? "";
  if (message.includes("chat_rate_limit_conversations")) return "rate_limit_conversations";
  if (message.includes("chat_rate_limit_messages")) return "rate_limit_messages";
  if (message.includes("chat_disabled")) return "disabled";
  return "other";
}

// ---------------------------------------------------------------------------
// Lista de mensagens do client (Realtime + fallback)
// ---------------------------------------------------------------------------

export interface ChatMessage {
  id: string;
  senderId: string;
  content: string;
  createdAt: string;
}

/** Junta duas listas sem duplicar por id, em ordem cronológica. */
export function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const byId = new Map<string, ChatMessage>();
  for (const m of current) byId.set(m.id, m);
  for (const m of incoming) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => {
    const byDate = Date.parse(a.createdAt) - Date.parse(b.createdAt);
    return byDate !== 0 ? byDate : a.id.localeCompare(b.id);
  });
}
