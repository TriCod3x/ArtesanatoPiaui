import { FileCheck2 } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatCEP, formatCNPJ, formatCPF } from "@/lib/utils";
import { IDENTITY_DOCUMENTS_BUCKET, SIGNED_URL_TTL } from "@/lib/constants";
import { DocumentReviewCard } from "./DocumentReviewCard";
import { StoreManagement, type PendingStoreRow, type StoreRow } from "./StoreManagement";
import type { DocumentStatus } from "@/types";

export const metadata = { title: "Administração — Lojas" };

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png"]);

function isImagePath(path: string | null | undefined): boolean {
  if (!path) return false;
  const ext = path.split(".").pop()?.toLowerCase();
  return !!ext && IMAGE_EXTENSIONS.has(ext);
}

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
      admin.from("profiles").select("id, full_name, phone"),
    ]);

  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
  const phoneById = new Map((profiles ?? []).map((p) => [p.id, p.phone]));
  const storeByOwner = new Map((stores ?? []).map((s) => [s.owner_id, s]));
  const verificationByUser = new Map(
    (verifications ?? []).map((v) => [v.user_id, v]),
  );

  const pending = (verifications ?? []).filter(
    (v) => v.document_status === "pending",
  );

  // Email (auth.users) só é buscado pra quem não tem telefone no perfil.
  const emailById = new Map<string, string | null>();
  await Promise.all(
    pending
      .filter((v) => !phoneById.get(v.user_id))
      .map(async (v) => {
        const { data } = await admin.auth.admin.getUserById(v.user_id);
        emailById.set(v.user_id, data.user?.email ?? null);
      }),
  );

  // Preview inline: signed URL só pra documentos que são imagem (jpg/png).
  const previewUrlById = new Map<string, string>();
  await Promise.all(
    pending
      .filter((v) => isImagePath(v.id_document_path))
      .map(async (v) => {
        const { data } = await admin.storage
          .from(IDENTITY_DOCUMENTS_BUCKET)
          .createSignedUrl(v.id_document_path!, SIGNED_URL_TTL);
        if (data?.signedUrl) previewUrlById.set(v.user_id, data.signedUrl);
      }),
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
            {pending.map((v) => {
              const store = storeByOwner.get(v.user_id);
              return (
                <DocumentReviewCard
                  key={v.user_id}
                  userId={v.user_id}
                  fullName={nameById.get(v.user_id) ?? "Vendedor"}
                  phone={phoneById.get(v.user_id) ?? null}
                  email={emailById.get(v.user_id) ?? null}
                  cpf={formatCPF(v.cpf)}
                  cnpj={v.cnpj ? formatCNPJ(v.cnpj) : null}
                  address={fullAddress(v)}
                  submittedAt={v.submitted_at}
                  store={store ? { name: store.name, slug: store.slug, status: store.status } : null}
                  documentIsImage={isImagePath(v.id_document_path)}
                  documentPreviewUrl={previewUrlById.get(v.user_id) ?? null}
                />
              );
            })}
          </div>
        )}
      </section>

      {/* Aprovação de lojas */}
      <StoreManagement pendingStores={pendingStores} allStores={allStoreRows} />
    </main>
  );
}
