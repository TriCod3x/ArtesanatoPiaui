"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { AlertTriangle, Check, X } from "lucide-react";
import { approveStore, rejectStore } from "@/actions/admin";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { DOCUMENT_STATUS_CLASS, DOCUMENT_STATUS_LABEL } from "@/lib/constants";
import type { DocumentStatus } from "@/types";

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
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);

  const canApprove = docStatus === "approved";

  const approve = async () => {
    const result = await approveStore(storeId);
    if ("error" in result) {
      toast.error(result.error);
      return result;
    }
    toast.success("Loja aprovada.");
    router.refresh();
  };

  const reject = async (reason?: string) => {
    const result = await rejectStore(storeId, reason);
    if ("error" in result) {
      toast.error(result.error);
      return result;
    }
    toast.success("Loja rejeitada.");
    router.refresh();
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
            docStatus ? DOCUMENT_STATUS_CLASS[docStatus] : "bg-muted text-muted-foreground"
          }`}
        >
          {docStatus ? DOCUMENT_STATUS_LABEL[docStatus] : "Documento não enviado"}
        </span>
      </div>

      {!canApprove && (
        <div className="flex items-center gap-2 mt-4 text-sm text-amber bg-amber/10 border border-amber/30 rounded-lg px-3 py-2">
          <AlertTriangle size={15} className="flex-shrink-0" />
          Documento de identidade ainda não foi aprovado.
        </div>
      )}

      <div className="flex gap-2 mt-4">
        <Button
          type="button"
          size="sm"
          onClick={() => setApproveOpen(true)}
          disabled={!canApprove}
          title={canApprove ? undefined : "Documento de identidade ainda não foi aprovado."}
          className="gap-1.5 bg-capim hover:bg-capim/90 text-white disabled:opacity-50"
        >
          <Check size={14} />
          Aprovar loja
        </Button>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          onClick={() => setRejectOpen(true)}
          className="gap-1.5"
        >
          <X size={14} /> Rejeitar
        </Button>
      </div>

      <ConfirmDialog
        open={approveOpen}
        onOpenChange={setApproveOpen}
        title={`Aprovar a loja ${storeName}?`}
        description="A loja passa a aparecer na vitrine pública imediatamente."
        confirmLabel="Confirmar"
        onConfirm={approve}
      />

      <ConfirmDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        title={`Rejeitar a loja ${storeName}?`}
        description="A loja fica suspensa e o vendedor poderá editar e reenviar para análise."
        confirmLabel="Confirmar rejeição"
        destructive
        withReason
        reasonPlaceholder="Motivo da rejeição (opcional) — será mostrado ao vendedor"
        onConfirm={reject}
      />
    </div>
  );
}
