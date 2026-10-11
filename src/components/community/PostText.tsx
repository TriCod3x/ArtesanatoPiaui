import Link from "next/link";
import { splitMentionSegments, mentionKey } from "@/lib/mentions";
import type { PostMention } from "@/types";

interface PostTextProps {
  content: string;
  mentions?: PostMention[];
  className?: string;
}

const MENTION_CLASS = "font-semibold text-terracota";

/**
 * Texto do post com as marcações destacadas. Tudo sai como nó de texto do
 * React (nunca HTML cru). Só vira destaque o token cujo id está na tabela de
 * menções do post (validada no servidor); token solto aparece como "@Nome"
 * comum. Loja com slug visível vira link; usuário não tem página pública de
 * perfil (ainda), então só ganha destaque.
 */
export function PostText({ content, mentions = [], className }: PostTextProps) {
  const known = new Map(mentions.map((m) => [mentionKey(m.kind, m.id), m]));

  return (
    <p className={className}>
      {splitMentionSegments(content).map((segment, i) => {
        if (segment.type === "text") return segment.text;

        const mention = known.get(mentionKey(segment.kind, segment.id));
        if (!mention) return `@${segment.name}`;

        if (mention.kind === "store" && mention.storeSlug) {
          return (
            <Link
              key={i}
              href={`/lojas/${mention.storeSlug}`}
              className={`${MENTION_CLASS} hover:underline`}
            >
              @{segment.name}
            </Link>
          );
        }

        return (
          <span key={i} className={MENTION_CLASS}>
            @{segment.name}
          </span>
        );
      })}
    </p>
  );
}
