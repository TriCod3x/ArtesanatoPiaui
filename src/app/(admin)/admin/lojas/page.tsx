import Link from "next/link";
import { FileCheck2 } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatCEP, formatCNPJ, formatCPF } from "@/lib/utils";
import { DocumentReviewCard } from "./DocumentReviewCard";
import type { DocumentStatus } from "@/types";

export const metadata = { title: "Administração — Lojas" };

const STORE_STATUS_LABEL: Record<string, string> = {
  pending: "Em análise",
  active: "Ativa",
  suspended: "Suspensa",
};

const DOC_STATUS_LABEL: Record<DocumentStatus, string> = {
  pending: "Documentos em análise",
  approved: "Documentos aprovados",
  rejected: "Documentos rejeitados",
};

const DOC_STATUS_CLASS: Record<DocumentStatus, string> = {
  pending: "bg-amber/15 text-amber",
  approved: "bg-capim/15 text-capim",
  rejected: "bg-destructive/15 text-destructive",
};

export default async function AdminLojasPage() {
  const admin = createAdminClient();

  const [{ data: verifications }, { data: stores }, { data: profiles }] =
    await Promise.all([
      admin
        .from("seller_verifications")
        .select("*")
        .order("submitted_at", { ascending: false }),
      admin
        .from("stores")
        .select("id, name, slug, status, owner_id, created_at")
        .order("created_at", { ascending: false }),
      admin.from("profiles").select("id, full_name"),
    ]);

  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
  const storeByOwner = new Map((stores ?? []).map((s) => [s.owner_id, s]));
  const verificationByUser = new Map(
    (verifications ?? []).map((v) => [v.user_id, v]),
  );

  const pending = (verifications ?? []).filter(
    (v) => v.document_status === "pending",
  );

  const fullAddress = (v: NonNullable<typeof verifications>[number]) =>
    `${v.address_street}, ${v.address_number}` +
    (v.address_complement ? ` - ${v.address_complement}` : "") +
    ` — ${v.address_neighborhood}, ${v.address_city}/${v.address_state}` +
    ` — CEP ${formatCEP(v.cep)}`;

  return (
    <main className="max-w-6xl mx-auto px-4 py-10">
      <h1 className="font-display text-3xl font-bold text-dark dark:text-[#f5edd6] mb-1">
        Administração — Lojas
      </h1>
      <p className="text-muted-foreground mb-8">
        Aprovação de documentos e visão geral das lojas do marketplace.
      </p>

      {/* Documentos pendentes */}
      <section className="mb-12">
        <div className="flex items-center gap-2 mb-4">
          <FileCheck2 size={18} className="text-terracota" />
          <h2 className="font-semibold text-lg text-dark dark:text-[#f5edd6]">
            Documentos pendentes de aprovação
          </h2>
          <span className="text-xs font-bold bg-amber/15 text-amber rounded-full px-2 py-0.5">
            {pending.length}
          </span>
        </div>

        {pending.length === 0 ? (
          <p className="text-sm text-muted-foreground bg-white dark:bg-[#2a1e0f] border border-border dark:border-[#3d2c1a] rounded-xl p-6">
            Nenhum documento aguardando análise.
          </p>
        ) : (
          <div className="space-y-4">
            {pending.map((v) => (
              <DocumentReviewCard
                key={v.user_id}
                userId={v.user_id}
                fullName={nameById.get(v.user_id) ?? "Vendedor"}
                cpf={formatCPF(v.cpf)}
                cnpj={v.cnpj ? formatCNPJ(v.cnpj) : null}
                address={fullAddress(v)}
                submittedAt={v.submitted_at}
                storeName={storeByOwner.get(v.user_id)?.name ?? null}
              />
            ))}
          </div>
        )}
      </section>

      {/* Todas as lojas */}
      <section>
        <h2 className="font-semibold text-lg text-dark dark:text-[#f5edd6] mb-4">
          Todas as lojas
        </h2>
        <div className="overflow-x-auto bg-white dark:bg-[#2a1e0f] border border-border dark:border-[#3d2c1a] rounded-xl">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border dark:border-[#3d2c1a] text-left text-muted-foreground">
                <th className="px-4 py-3 font-medium">Loja</th>
                <th className="px-4 py-3 font-medium">Responsável</th>
                <th className="px-4 py-3 font-medium">Status da loja</th>
                <th className="px-4 py-3 font-medium">Documentos</th>
              </tr>
            </thead>
            <tbody>
              {(stores ?? []).length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                    Nenhuma loja cadastrada.
                  </td>
                </tr>
              )}
              {(stores ?? []).map((s) => {
                const doc = verificationByUser.get(s.owner_id)?.document_status as
                  | DocumentStatus
                  | undefined;
                return (
                  <tr
                    key={s.id}
                    className="border-b border-border/60 dark:border-[#3d2c1a]/60 last:border-0"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/lojas/${s.slug}`}
                        className="text-dark dark:text-[#f5edd6] font-medium hover:text-terracota"
                      >
                        {s.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {nameById.get(s.owner_id) ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {STORE_STATUS_LABEL[s.status] ?? s.status}
                    </td>
                    <td className="px-4 py-3">
                      {doc ? (
                        <span
                          className={`text-xs font-semibold rounded-full px-2 py-0.5 ${DOC_STATUS_CLASS[doc]}`}
                        >
                          {DOC_STATUS_LABEL[doc]}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          Não enviados
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
