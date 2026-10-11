// Regras de republicação e de composição do feed. Puro (sem I/O).
//
// Uma republicação é uma linha em community_reposts apontando pro post
// ORIGINAL — ela não é um post, então "republicar uma republicação" nunca cria
// uma cadeia: se o cliente mandar o id de uma republicação, o alvo é o post
// original dela.

export interface RepostTargetPost {
  id: string;
  author_id: string;
}

/**
 * `postById`: linha de community_posts com o id recebido (se existir).
 * `originalOfRepost`: se o id recebido era de uma republicação, o post original dela.
 */
export function resolveRepostTarget(input: {
  postById: RepostTargetPost | null;
  originalOfRepost: RepostTargetPost | null;
}): RepostTargetPost | null {
  return input.postById ?? input.originalOfRepost ?? null;
}

export type RepostDecision =
  | { kind: "error"; error: string }
  | { kind: "add"; postId: string }
  | { kind: "remove"; postId: string };

export function decideRepost(input: {
  userId: string | null;
  target: RepostTargetPost | null;
  alreadyReposted: boolean;
}): RepostDecision {
  if (!input.userId) return { kind: "error", error: "Você precisa estar logado." };
  if (!input.target) return { kind: "error", error: "Post não encontrado." };
  if (input.target.author_id === input.userId) {
    return { kind: "error", error: "Você não pode republicar o seu próprio post." };
  }
  return input.alreadyReposted
    ? { kind: "remove", postId: input.target.id }
    : { kind: "add", postId: input.target.id };
}

/**
 * Link da notificação de republicação. Leva o id de quem republicou na query
 * (ignorada pela página) só pra a notificação ser única por par
 * (usuário, post): notifications não tem coluna pra isso.
 */
export function repostNotificationLink(postId: string, reposterId: string): string {
  return `/comunidade?de=${reposterId}#post-${postId}`;
}

export function mentionNotificationLink(postId: string): string {
  return `/comunidade#post-${postId}`;
}

/** Junta posts e republicações num feed só, mais recente primeiro, e corta em `limit`. */
export function mergeFeed<T extends { sortAt: string; key: string }>(
  items: T[],
  limit: number,
): T[] {
  return [...items]
    .sort((a, b) => {
      const diff = Date.parse(b.sortAt) - Date.parse(a.sortAt);
      return diff !== 0 ? diff : a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
    })
    .slice(0, limit);
}
