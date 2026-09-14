import { FileCheck2 } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatCEP, formatCNPJ, formatCPF } from "@/lib/utils";
import { DocumentReviewCard } from "./DocumentReviewCard";
import { StoreManagement, type PendingStoreRow, type StoreRow } from "./StoreManagement";
import type { DocumentStatus } from "@/types";

export const metadata = { title: "Administração — Lojas" };

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
        .select("id, name, slug, status, owner_id, city, created_at")
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

  const docStatusOf = (ownerId: string) =>
    verificationByUser.get(ownerId)?.document_status as DocumentStatus | undefined;

  const pendingStores: PendingStoreRow[] = (stores ?? [])
    .filter((s) => s.status === "pending")
    .map((s) => ({
      id: s.id,
      name: s.name,
      slug: s.slug,
      ownerName: nameById.get(s.owner_id) ?? "Vendedor",
      city: s.city,
      createdAt: s.created_at,
      docStatus: docStatusOf(s.owner_id),
    }));

  const allStoreRows: StoreRow[] = (stores ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    slug: s.slug,
    status: s.status,
    ownerName: nameById.get(s.owner_id) ?? "—",
    docStatus: docStatusOf(s.owner_id),
  }));

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

      {/* Aprovação de lojas */}
      <StoreManagement pendingStores={pendingStores} allStores={allStoreRows} />
    </main>
  );
}
