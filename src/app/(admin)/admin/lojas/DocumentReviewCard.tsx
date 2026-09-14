"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Check, ExternalLink, Loader2, Mail, Phone, X } from "lucide-react";
import {
  approveSellerDocument,
  getSellerDocumentUrl,
  rejectSellerDocument,
} from "@/actions/admin";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { STORE_STATUS_CLASS, STORE_STATUS_LABEL } from "@/lib/constants";

export interface DocumentReviewCardProps {
  userId: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  cpf: string;
  cnpj: string | null;
  address: string;
  submittedAt: string;
  store: { name: string; slug: string; status: string } | null;
  documentIsImage: boolean;
  documentPreviewUrl: string | null;
}

export function DocumentReviewCard({
  userId,
  fullName,
  phone,
  email,
  cpf,
  cnpj,
  address,
  submittedAt,
  store,
  documentIsImage,
  documentPreviewUrl,
}: DocumentReviewCardProps) {
  const router = useRouter();
  const [loadingDoc, setLoadingDoc] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);

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

  const approve = async () => {
    const result = await approveSellerDocument(userId);
    if ("error" in result) {
      toast.error(result.error);
      return result;
    }
    toast.success("Documento aprovado.");
    router.refresh();
  };

  const reject = async (reason?: string) => {
    const result = await rejectSellerDocument(userId, reason);
    if ("error" in result) {
      toast.error(result.error);
      return result;
    }
    toast.success("Documento rejeitado.");
    router.refresh();
  };

  return (
    <div className="bg-white dark:bg-[#2a1e0f] rounded-xl border border-border dark:border-[#3d2c1a] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex gap-4">
          {documentIsImage && documentPreviewUrl && (
            <button
              type="button"
              onClick={() => setLightboxOpen(true)}
              className="relative w-16 h-16 rounded-lg overflow-hidden border border-border dark:border-[#3d2c1a] flex-shrink-0 hover:opacity-80 transition-opacity"
              title="Ver documento em tamanho maior"
            >
              {/* Signed URL expira em minutos e não é servida pelo domínio configurado no next/image — <img> simples evita otimização/cache indevidos de um link privado. */}
              <img
                src={documentPreviewUrl}
                alt={`Documento de identidade de ${fullName}`}
                className="w-full h-full object-cover"
              />
            </button>
          )}

          <div>
            <p className="font-semibold text-dark dark:text-[#f5edd6]">{fullName}</p>
            {(phone || email) && (
              <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-1.5">
                {phone ? (
                  <>
                    <Phone size={13} className="flex-shrink-0" /> {phone}
                  </>
                ) : (
                  <>
                    <Mail size={13} className="flex-shrink-0" /> {email}
                  </>
                )}
              </p>
            )}
            <p className="text-sm text-muted-foreground mt-1">
              {store ? (
                <>
                  Loja:{" "}
                  <Link
                    href={`/lojas/${store.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-dark dark:text-[#f5edd6] font-medium hover:text-terracota"
                  >
                    {store.name}
                  </Link>
                  {" — status: "}
                  <span
                    className={`text-xs font-semibold rounded-full px-2 py-0.5 ${
                      STORE_STATUS_CLASS[store.status] ?? "bg-muted text-muted-foreground"
                    }`}
                  >
                    {STORE_STATUS_LABEL[store.status] ?? store.status}
                  </span>
                </>
              ) : (
                "Ainda não criou uma loja"
              )}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Enviado em {new Date(submittedAt).toLocaleDateString("pt-BR")}
            </p>
          </div>
        </div>

        {!documentIsImage && (
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
        )}
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

      <div className="flex gap-2 mt-4">
        <Button
          type="button"
          size="sm"
          onClick={() => setApproveOpen(true)}
          className="gap-1.5 bg-capim hover:bg-capim/90 text-white"
        >
          <Check size={14} /> Aprovar
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
        title={`Aprovar documento de ${fullName}?`}
        description="Isso libera a loja para revisão final."
        confirmLabel="Confirmar"
        onConfirm={approve}
      />

      <ConfirmDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        title={`Rejeitar documento de ${fullName}?`}
        description="O vendedor será notificado e poderá reenviar o documento."
        confirmLabel="Confirmar rejeição"
        destructive
        withReason
        reasonPlaceholder="Ex: Documento ilegível, foto cortada, dados não conferem..."
        onConfirm={reject}
      />

      {documentIsImage && documentPreviewUrl && (
        <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
          <DialogContent className="sm:max-w-2xl p-2 flex items-center justify-center">
            <img
              src={documentPreviewUrl}
              alt={`Documento de identidade de ${fullName}`}
              className="max-h-[80vh] max-w-full object-contain rounded-lg"
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
