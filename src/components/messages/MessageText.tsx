import { Fragment } from "react";
import { splitMessageLines } from "../../lib/chat";

/**
 * Mensagem de chat SEMPRE como texto puro: cada linha vira um nó de texto do
 * React (escapado), com <br /> entre elas. Nunca dangerouslySetInnerHTML e
 * sem links clicáveis nesta versão — uma URL aparece como texto comum.
 *
 * Import relativo (e não "@/lib/chat") pra o teste unitário compilar só com
 * tsc, sem bundler pra resolver o alias.
 */
export function MessageText({ content, className }: { content: string; className?: string }) {
  const lines = splitMessageLines(content);
  return (
    <p className={className}>
      {lines.map((line, index) => (
        <Fragment key={index}>
          {index > 0 && <br />}
          {line}
        </Fragment>
      ))}
    </p>
  );
}
