"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { StoreApprovalCard } from "./StoreApprovalCard";
import type { DocumentStatus } from "@/types";

const STORE_STATUS_LABEL: Record<string, string> = {
  pending: "Em análise",
  active: "Ativa",
  suspended: "Suspensa",
};

const STORE_STATUS_CLASS: Record<string, string> = {
  pending: "bg-amber/15 text-amber",
  active: "bg-capim/15 text-capim",
  suspended: "bg-destructive/15 text-destructive",
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

export interface PendingStoreRow {
  id: string;
  name: string;
  slug: string;
  ownerName: string;
  city: string;
  createdAt: string;
  docStatus: DocumentStatus | undefined;
}

export interface StoreRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  ownerName: string;
  docStatus: DocumentStatus | undefined;
}

interface StoreManagementProps {
  pendingStores: PendingStoreRow[];
  allStores: StoreRow[];
}

type Tab = "pending" | "all";

export function StoreManagement({ pendingStores, allStores }: StoreManagementProps) {
  const [tab, setTab] = useState<Tab>(pendingStores.length > 0 ? "pending" : "all");
  const [statusFilter, setStatusFilter] = useState<string>("");

  const filteredStores = useMemo(
    () => (statusFilter ? allStores.filter((s) => s.status === statusFilter) : allStores),
    [allStores, statusFilter],
  );

  return (
    <section>
      <div className="flex items-center gap-1 border-b border-border dark:border-[#3d2c1a] mb-6">
        <button
          type="button"
          onClick={() => setTab("pending")}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
            tab === "pending"
              ? "border-terracota text-terracota"
              : "border-transparent text-muted-foreground hover:text-dark dark:hover:text-[#f5edd6]"
          }`}
        >
          Aguardando aprovação
          {pendingStores.length > 0 && (
            <span className="ml-2 text-xs font-bold bg-amber/15 text-amber rounded-full px-2 py-0.5">
              {pendingStores.length}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setTab("all")}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
            tab === "all"
              ? "border-terracota text-terracota"
              : "border-transparent text-muted-foreground hover:text-dark dark:hover:text-[#f5edd6]"
          }`}
        >
          Todas as lojas
        </button>
      </div>

      {tab === "pending" ? (
        pendingStores.length === 0 ? (
          <p className="text-sm text-muted-foreground bg-white dark:bg-[#2a1e0f] border border-border dark:border-[#3d2c1a] rounded-xl p-6">
            Nenhuma loja aguardando aprovação.
          </p>
        ) : (
          <div className="space-y-4">
            {pendingStores.map((s) => (
              <StoreApprovalCard
                key={s.id}
                storeId={s.id}
                storeName={s.name}
                storeSlug={s.slug}
                ownerName={s.ownerName}
                city={s.city}
                createdAt={s.createdAt}
                docStatus={s.docStatus}
              />
            ))}
          </div>
        )
      ) : (
        <div>
          <div className="flex justify-end mb-4">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="border border-border dark:border-[#3d2c1a] rounded-lg px-3 py-2 text-sm bg-white dark:bg-[#2a1e0f] text-dark dark:text-[#f5edd6] focus:outline-none focus:ring-2 focus:ring-terracota"
            >
              <option value="">Todos os status</option>
              <option value="pending">Em análise</option>
              <option value="active">Ativa</option>
              <option value="suspended">Suspensa</option>
            </select>
          </div>

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
                {filteredStores.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                      Nenhuma loja encontrada.
                    </td>
                  </tr>
                )}
                {filteredStores.map((s) => (
                  <tr
                    key={s.id}
                    className="border-b border-border/60 dark:border-[#3d2c1a]/60 last:border-0"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/lojas/${s.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-dark dark:text-[#f5edd6] font-medium hover:text-terracota"
                      >
                        {s.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{s.ownerName}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs font-semibold rounded-full px-2 py-0.5 ${
                          STORE_STATUS_CLASS[s.status] ?? "bg-muted text-muted-foreground"
                        }`}
                      >
                        {STORE_STATUS_LABEL[s.status] ?? s.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {s.docStatus ? (
                        <span
                          className={`text-xs font-semibold rounded-full px-2 py-0.5 ${DOC_STATUS_CLASS[s.docStatus]}`}
                        >
                          {DOC_STATUS_LABEL[s.docStatus]}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Não enviados</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
