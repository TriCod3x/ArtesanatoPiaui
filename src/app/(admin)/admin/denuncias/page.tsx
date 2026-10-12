import Link from "next/link";
import { Flag } from "lucide-react";
import { listReports } from "@/actions/admin";
import { ReportCard } from "./ReportCard";

export const metadata = { title: "Administração — Denúncias" };
export const dynamic = "force-dynamic";

export default async function AdminDenunciasPage({
  searchParams,
}: {
  searchParams: Promise<{ denunciado?: string }>;
}) {
  const { denunciado } = await searchParams;
  const result = await listReports(denunciado);

  return (
    <main className="max-w-4xl mx-auto px-4 py-10">
      <h1 className="font-display text-3xl font-bold text-dark dark:text-[#f5edd6] mb-1">
        Administração — Denúncias do chat
      </h1>
      <p className="text-muted-foreground mb-8">
        Denúncias abertas de conversas entre compradores e lojas. Você vê apenas as últimas
        mensagens enviadas junto com a denúncia.
      </p>

      <div className="flex items-center gap-2 mb-4">
        <Flag size={18} className="text-terracota" />
        <h2 className="font-semibold text-lg text-dark dark:text-[#f5edd6]">Denúncias abertas</h2>
        {"reports" in result && (
          <span className="text-xs font-bold bg-amber/15 text-amber rounded-full px-2 py-0.5">
            {result.reports.length}
          </span>
        )}
        {denunciado && (
          <Link href="/admin/denuncias" className="ml-auto text-sm text-terracota hover:underline">
            Ver todas
          </Link>
        )}
      </div>

      {"error" in result ? (
        <p className="text-sm text-destructive bg-white dark:bg-[#2a1e0f] border border-border dark:border-[#3d2c1a] rounded-xl p-6">
          {result.error}
        </p>
      ) : result.reports.length === 0 ? (
        <p className="text-sm text-muted-foreground bg-white dark:bg-[#2a1e0f] border border-border dark:border-[#3d2c1a] rounded-xl p-6">
          Nenhuma denúncia aberta.
        </p>
      ) : (
        <div className="space-y-4">
          {result.reports.map((report) => (
            <ReportCard key={report.id} report={report} />
          ))}
        </div>
      )}
    </main>
  );
}
