import { redirect } from "next/navigation";

/**
 * Não existe uma página dedicada de categoria — a listagem de produtos já
 * filtra por `?categoria=`. Mantemos esta rota só para não gerar 404 em links
 * antigos / prefetch de `/categorias/<slug>`.
 */
export default async function CategoriaRedirectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/produtos?categoria=${encodeURIComponent(slug)}`);
}
