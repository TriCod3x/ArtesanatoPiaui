"use server";

import { createClient } from "@/lib/supabase/server";

export interface ProductSearchResult {
  id: string;
  name: string;
  slug: string;
  price: number;
  categoryName: string | null;
  storeName: string | null;
  imageUrl: string | null;
}

const RESULT_LIMIT = 8;
const MIN_QUERY_LENGTH = 2;
const TAG_CANDIDATE_LIMIT = 200;

const SEARCH_SELECT = `
  id, name, slug, price, tags,
  category:categories(name),
  store:stores(name),
  images:product_images(url, position, is_cover)
`;

type SearchRow = {
  id: string;
  name: string;
  slug: string;
  price: number;
  tags: string[] | null;
  category: { name: string } | { name: string }[] | null;
  store: { name: string } | { name: string }[] | null;
  images: { url: string; position: number; is_cover: boolean }[] | null;
};

function toResult(row: SearchRow): ProductSearchResult {
  const category = Array.isArray(row.category) ? row.category[0] : row.category;
  const store = Array.isArray(row.store) ? row.store[0] : row.store;
  const images = [...(row.images ?? [])].sort(
    (a, b) => Number(b.is_cover) - Number(a.is_cover) || a.position - b.position,
  );

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    price: row.price,
    categoryName: category?.name ?? null,
    storeName: store?.name ?? null,
    imageUrl: images[0]?.url ?? null,
  };
}

export async function searchProducts(query: string): Promise<ProductSearchResult[]> {
  const term = query.trim();
  if (term.length < MIN_QUERY_LENGTH) return [];

  const supabase = await createClient();

  const { data: byName } = await supabase
    .from("products")
    .select(SEARCH_SELECT)
    .eq("status", "active")
    .ilike("name", `%${term}%`)
    .limit(RESULT_LIMIT);

  const results = new Map<string, ProductSearchResult>();
  for (const row of (byName ?? []) as unknown as SearchRow[]) {
    results.set(row.id, toResult(row));
  }

  // PostgREST has no partial/`ilike` filter over individual array elements,
  // so tag matches are done in memory over a bounded, indexable candidate set.
  if (results.size < RESULT_LIMIT) {
    const { data: tagged } = await supabase
      .from("products")
      .select(SEARCH_SELECT)
      .eq("status", "active")
      .not("tags", "is", null)
      .limit(TAG_CANDIDATE_LIMIT);

    const lowerTerm = term.toLowerCase();
    for (const row of (tagged ?? []) as unknown as SearchRow[]) {
      if (results.size >= RESULT_LIMIT) break;
      if (results.has(row.id)) continue;
      if (row.tags?.some((tag) => tag.toLowerCase().includes(lowerTerm))) {
        results.set(row.id, toResult(row));
      }
    }
  }

  return [...results.values()].slice(0, RESULT_LIMIT);
}
