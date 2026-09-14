"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { AlertTriangle, Check, Loader2, X } from "lucide-react";
import { approveStore, rejectStore } from "@/actions/admin";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { DocumentStatus } from "@/types";

const DOC_STATUS_LABEL: Record<DocumentStatus, string> = {
  pending: "Documento pendente",
  approved: "Documento aprovado",
  rejected: "Documento rejeitado",
};

const DOC_STATUS_CLASS: Record<DocumentStatus, string> = {
  pending: "bg-amber/15 text-amber",
  approved: "bg-capim/15 text-capim",
  rejected: "bg-destructive/15 text-destructive",
};

export interface StoreApprovalCardProps {
  storeId: string;
  storeName: string;
  storeSlug: string;
  ownerName: string;
  city: string;
  createdAt: string;
  docStatus: DocumentStatus | undefined;
}

export function StoreApprovalCard({
  storeId,
  storeName,
  storeSlug,
  ownerName,
  city,
  createdAt,
  docStatus,
}: StoreApprovalCardProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  const canApprove = docStatus === "approved";

  const approve = () => {
    startTransition(async () => {
      const result = await approveStore(storeId);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Loja aprovada.");
      router.refresh();
    });
  };

  const reject = () => {
    startTransition(async () => {
      const result = await rejectStore(storeId, reason);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Loja rejeitada.");
      setRejecting(false);
      setReason("");
      router.refresh();
    });
  };

  return (
    <div className="bg-white dark:bg-[#2a1e0f] rounded-xl border border-border dark:border-[#3d2c1a] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href={`/lojas/${storeSlug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-dark dark:text-[#f5edd6] hover:text-terracota"
          >
            {storeName}
          </Link>
          <p className="text-sm text-muted-foreground mt-0.5">
            Dono: {ownerName} · {city}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Criada em {new Date(createdAt).toLocaleDateString("pt-BR")}
          </p>
        </div>

        <span
          className={`text-xs font-semibold rounded-full px-2.5 py-1 ${
            docStatus ? DOC_STATUS_CLASS[docStatus] : "bg-muted text-muted-foreground"
          }`}
        >
          {docStatus ? DOC_STATUS_LABEL[docStatus] : "Documento não enviado"}
        </span>
      </div>

      {!canApprove && (
        <div className="flex items-center gap-2 mt-4 text-sm text-amber bg-amber/10 border border-amber/30 rounded-lg px-3 py-2">
          <AlertTriangle size={15} className="flex-shrink-0" />
          Documento de identidade ainda não foi aprovado.
        </div>
      )}

      {rejecting ? (
        <div className="mt-4 space-y-2">
          <Textarea
            rows={2}
            placeholder="Motivo da rejeição (opcional) — será mostrado ao vendedor"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="flex gap-2">
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={reject}
              disabled={pending}
            >
              {pending ? <Loader2 size={14} className="animate-spin" /> : "Confirmar rejeição"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setRejecting(false)}
              disabled={pending}
            >
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2 mt-4">
          <Button
            type="button"
            size="sm"
            onClick={approve}
            disabled={pending || !canApprove}
            title={canApprove ? undefined : "Documento de identidade ainda não foi aprovado."}
            className="gap-1.5 bg-capim hover:bg-capim/90 text-white disabled:opacity-50"
          >
            {pending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            Aprovar loja
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => setRejecting(true)}
            disabled={pending}
            className="gap-1.5"
          >
            <X size={14} /> Rejeitar
          </Button>
        </div>
      )}
    </div>
  );
}
