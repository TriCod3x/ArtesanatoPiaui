"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, ExternalLink, Loader2, X } from "lucide-react";
import {
  approveSellerDocument,
  getSellerDocumentUrl,
  rejectSellerDocument,
} from "@/actions/admin";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export interface DocumentReviewCardProps {
  userId: string;
  fullName: string;
  cpf: string;
  cnpj: string | null;
  address: string;
  submittedAt: string;
  storeName: string | null;
}

export function DocumentReviewCard({
  userId,
  fullName,
  cpf,
  cnpj,
  address,
  submittedAt,
  storeName,
}: DocumentReviewCardProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [loadingDoc, setLoadingDoc] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  const openDocument = async () => {
    setLoadingDoc(true);
    const result = await getSellerDocumentUrl(userId);
    setLoadingDoc(false);
    if ("url" in result) {
      window.open(result.url, "_blank", "noopener,noreferrer");
      return;
    }
    toast.error(result.error ?? "Erro ao abrir o documento.");
  };

  const approve = () => {
    startTransition(async () => {
      const result = await approveSellerDocument(userId);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Documento aprovado.");
      router.refresh();
    });
  };

  const reject = () => {
    startTransition(async () => {
      const result = await rejectSellerDocument(userId, reason);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Documento rejeitado.");
      setRejecting(false);
      setReason("");
      router.refresh();
    });
  };

  return (
    <div className="bg-white dark:bg-[#2a1e0f] rounded-xl border border-border dark:border-[#3d2c1a] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-dark dark:text-[#f5edd6]">{fullName}</p>
          {storeName && (
            <p className="text-sm text-muted-foreground">Loja: {storeName}</p>
          )}
          <p className="text-xs text-muted-foreground mt-1">
            Enviado em {new Date(submittedAt).toLocaleDateString("pt-BR")}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={openDocument}
          disabled={loadingDoc}
          className="gap-1.5 dark:border-[#3d2c1a] dark:text-[#f5edd6]"
        >
          {loadingDoc ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <ExternalLink size={14} />
          )}
          Ver documento
        </Button>
      </div>

      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 mt-4 text-sm">
        <div className="flex gap-2">
          <dt className="text-muted-foreground">CPF:</dt>
          <dd className="text-dark dark:text-[#f5edd6] font-medium">{cpf}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-muted-foreground">CNPJ:</dt>
          <dd className="text-dark dark:text-[#f5edd6] font-medium">
            {cnpj ?? "—"}
          </dd>
        </div>
        <div className="flex gap-2 sm:col-span-2">
          <dt className="text-muted-foreground">Endereço:</dt>
          <dd className="text-dark dark:text-[#f5edd6]">{address}</dd>
        </div>
      </dl>

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
            disabled={pending}
            className="gap-1.5 bg-capim hover:bg-capim/90 text-white"
          >
            <Check size={14} /> Aprovar
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
