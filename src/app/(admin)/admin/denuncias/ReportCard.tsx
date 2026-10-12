"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban, Check, X } from "lucide-react";
import { resolveReport, setChatDisabled } from "@/actions/admin";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { MessageText } from "@/components/messages/MessageText";
import { REPORT_REASON_LABEL } from "@/lib/chat";
import type { ChatReportItem } from "@/types/actions";

type Outcome = "dismissed" | "reviewed" | "actioned";

const DIALOG: Record<Outcome, { title: string; description: string; confirmLabel: string }> = {
  dismissed: {
    title: "Descartar denúncia?",
    description: "A denúncia é encerrada sem nenhuma ação sobre o usuário.",
    confirmLabel: "Descartar",
  },
  reviewed: {
    title: "Marcar como analisada?",
    description: "A denúncia é encerrada como analisada, sem desativar o chat do usuário.",
    confirmLabel: "Marcar como analisada",
  },
  actioned: {
    title: "Desativar o chat do usuário?",
    description:
      "O usuário não poderá mais enviar mensagens. Você pode reativar depois. A denúncia é encerrada com ação tomada.",
    confirmLabel: "Desativar chat",
  },
};

export function ReportCard({ report }: { report: ChatReportItem }) {
  const router = useRouter();
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const confirm = async (note?: string) => {
    if (!outcome) return;

    if (outcome === "actioned") {
      const disabled = await setChatDisabled(report.reportedUserId, true);
      if ("error" in disabled) {
        toast.error(disabled.error);
        return disabled;
      }
    }

    const result = await resolveReport(report.id, outcome, note);
    if ("error" in result) {
      toast.error(result.error);
      return result;
    }

    toast.success(
      outcome === "actioned"
        ? "Chat do usuário desativado e denúncia encerrada."
        : "Denúncia encerrada.",
    );
    router.refresh();
  };

  const dialog = outcome ? DIALOG[outcome] : null;

  return (
    <article className="bg-white dark:bg-[#2a1e0f] rounded-xl border border-border dark:border-[#3d2c1a] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-dark dark:text-[#f5edd6]">
            {report.reportedName}
            {report.reportedChatDisabled && (
              <span className="ml-2 text-xs font-semibold rounded-full px-2 py-0.5 bg-destructive/15 text-destructive">
                Chat desativado
              </span>
            )}
          </p>
          <p className="text-sm text-muted-foreground mt-0.5">
            Denunciado por {report.reporterName} ·{" "}
            {new Date(report.createdAt).toLocaleString("pt-BR")}
          </p>
        </div>
        <span className="text-xs font-semibold rounded-full px-2.5 py-1 bg-amber/15 text-amber">
          {REPORT_REASON_LABEL[report.reason]}
        </span>
      </div>

      {report.details && (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
            Detalhes
          </p>
          <MessageText
            content={report.details}
            className="text-sm text-dark dark:text-[#f5edd6] break-words"
          />
        </div>
      )}

      <div className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
          Últimas mensagens
        </p>
        {report.snapshot.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma mensagem na conversa.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {report.snapshot.map((entry, index) => (
              <li
                key={index}
                className="rounded-lg bg-cream/50 dark:bg-[#1f1509] border border-border dark:border-[#3d2c1a] px-3 py-2"
              >
                <p className="text-xs text-muted-foreground">
                  <span className="font-semibold text-dark dark:text-[#f5edd6]">
                    {entry.author_name}
                  </span>{" "}
                  · {new Date(entry.at).toLocaleString("pt-BR")}
                </p>
                <MessageText
                  content={entry.text}
                  className="text-sm text-dark dark:text-[#f5edd6] break-words mt-0.5"
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap gap-2 mt-5">
        <Button type="button" variant="outline" size="sm" onClick={() => setOutcome("dismissed")}>
          <X size={14} /> Descartar
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => setOutcome("reviewed")}>
          <Check size={14} /> Marcar como analisada
        </Button>
        {!report.reportedChatDisabled && (
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => setOutcome("actioned")}
          >
            <Ban size={14} /> Desativar chat do usuário
          </Button>
        )}
      </div>

      {dialog && (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setOutcome(null);
          }}
          title={dialog.title}
          description={dialog.description}
          confirmLabel={dialog.confirmLabel}
          destructive={outcome === "actioned"}
          withReason
          reasonPlaceholder="Nota interna (opcional)"
          onConfirm={confirm}
        />
      )}
    </article>
  );
}
