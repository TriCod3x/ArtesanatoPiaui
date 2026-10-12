"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { reportConversation } from "@/actions/messages";
import {
  REPORT_DETAILS_MAX_LENGTH,
  REPORT_REASONS,
  REPORT_REASON_LABEL,
  type ReportReason,
} from "@/lib/chat";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ReportDialogProps {
  conversationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Chamado depois que a denúncia foi gravada (e, se pedido, o bloqueio). */
  onReported: (blocked: boolean) => void;
  /** Esconde "Bloquear também" quando o contato já está bloqueado. */
  alreadyBlocked: boolean;
}

export function ReportDialog({
  conversationId,
  open,
  onOpenChange,
  onReported,
  alreadyBlocked,
}: ReportDialogProps) {
  const [reason, setReason] = useState<ReportReason | "">("");
  const [details, setDetails] = useState("");
  const [alsoBlock, setAlsoBlock] = useState(false);
  const [pending, setPending] = useState(false);

  const reset = () => {
    setReason("");
    setDetails("");
    setAlsoBlock(false);
  };

  const handleSubmit = async () => {
    if (!reason || pending) return;
    setPending(true);
    const result = await reportConversation(
      conversationId,
      reason,
      details,
      alreadyBlocked ? false : alsoBlock,
    );
    setPending(false);

    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    toast.success("Denúncia enviada. Obrigado por avisar a equipe.");
    onReported(result.blocked);
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Denunciar conversa</DialogTitle>
          <DialogDescription>
            As últimas 5 mensagens desta conversa serão enviadas à equipe.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-sm font-medium text-dark dark:text-[#f5edd6]">
            Motivo
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value as ReportReason | "")}
              className="rounded-lg border border-border dark:border-[#3d2c1a] bg-white dark:bg-[#2a1e0f] text-dark dark:text-[#f5edd6] px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-terracota"
            >
              <option value="">Selecione um motivo</option>
              {REPORT_REASONS.map((r) => (
                <option key={r} value={r}>
                  {REPORT_REASON_LABEL[r]}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5 text-sm font-medium text-dark dark:text-[#f5edd6]">
            Detalhes (opcional)
            <Textarea
              rows={3}
              maxLength={REPORT_DETAILS_MAX_LENGTH}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Conte o que aconteceu"
            />
            <span className="text-xs font-normal text-muted-foreground text-right">
              {details.length}/{REPORT_DETAILS_MAX_LENGTH}
            </span>
          </label>

          {!alreadyBlocked && (
            <label className="flex items-center gap-2 text-sm text-dark dark:text-[#f5edd6]">
              <input
                type="checkbox"
                checked={alsoBlock}
                onChange={(e) => setAlsoBlock(e.target.checked)}
                className="accent-[var(--color-terracota,#c2512d)]"
              />
              Bloquear também
            </label>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={!reason || pending}
            className="bg-terracota hover:bg-terracota/90 text-white"
          >
            {pending ? <Loader2 size={14} className="animate-spin" /> : "Enviar denúncia"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
