"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  /** Mostra um Textarea (motivo opcional) e passa o valor pro onConfirm. */
  withReason?: boolean;
  reasonPlaceholder?: string;
  /** Retorne `{ error }` pra manter o dialog aberto e deixar o chamador exibir o toast. */
  onConfirm: (reason?: string) => Promise<{ error?: string } | void>;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive,
  withReason,
  reasonPlaceholder,
  onConfirm,
}: ConfirmDialogProps) {
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);

  const close = () => {
    onOpenChange(false);
    setReason("");
  };

  const handleConfirm = async () => {
    setPending(true);
    const result = await onConfirm(withReason ? reason : undefined);
    setPending(false);
    if (result && "error" in result && result.error) return;
    close();
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        if (!next) close();
        else onOpenChange(next);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>

        {withReason && (
          <Textarea
            rows={3}
            placeholder={reasonPlaceholder}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            autoFocus
          />
        )}

        <AlertDialogFooter>
          <Button type="button" variant="outline" onClick={close} disabled={pending}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant={destructive ? "destructive" : "default"}
            onClick={handleConfirm}
            disabled={pending}
            className={destructive ? undefined : "bg-capim hover:bg-capim/90 text-white"}
          >
            {pending ? <Loader2 size={14} className="animate-spin" /> : confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
