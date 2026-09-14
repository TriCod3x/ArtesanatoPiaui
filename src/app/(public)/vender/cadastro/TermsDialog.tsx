"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { TERMS_SECTIONS, TERMS_TITLE, TERMS_VERSION } from "@/lib/terms";

export function TermsDialog({ label = "Ler os termos de uso" }: { label?: string }) {
  return (
    <Dialog>
      <DialogTrigger
        render={
          <button
            type="button"
            className="text-terracota font-semibold hover:underline"
          />
        }
      >
        {label}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{TERMS_TITLE}</DialogTitle>
          <DialogDescription>Versão {TERMS_VERSION}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm text-muted-foreground">
          {TERMS_SECTIONS.map((section) => (
            <div key={section.heading}>
              <h3 className="font-semibold text-dark dark:text-[#f5edd6] mb-1">
                {section.heading}
              </h3>
              <div className="space-y-2">
                {section.body.map((paragraph, i) => (
                  <p key={i} className="leading-relaxed">
                    {paragraph}
                  </p>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
