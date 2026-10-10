"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { validateStoreHoursInput, type StoreHoursInputDay } from "@/lib/store-hours";

export interface ExpressSettingsInput {
  days: StoreHoursInputDay[];
  prepMinutes: number;
  paused: boolean;
}

/**
 * Salva horário de funcionamento, tempo de preparo e pausa da entrega
 * expressa. Usa o client comum de propósito: a RLS (dono da loja) é quem
 * autoriza as escritas em stores/store_hours — nada de admin aqui.
 *
 * A validação roda de novo no servidor (a do formulário é só conveniência).
 */
export async function saveExpressSettings(
  input: ExpressSettingsInput,
): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Você precisa estar logado." };

  if (!input || !Array.isArray(input.days) || input.days.length > 7) {
    return { error: "Dados inválidos." };
  }
  const days: StoreHoursInputDay[] = input.days.map((d) => ({
    weekday: Number(d.weekday),
    enabled: d.enabled === true,
    opens: String(d.opens ?? ""),
    closes: String(d.closes ?? ""),
  }));
  const prepMinutes = Number(input.prepMinutes);

  const validationError = validateStoreHoursInput(days, prepMinutes);
  if (validationError) return { error: validationError };

  const { data: store } = await supabase.from("stores").select("id").eq("owner_id", user.id).maybeSingle();
  if (!store) return { error: "Loja não encontrada." };

  const { error: storeError } = await supabase
    .from("stores")
    .update({ express_prep_minutes: prepMinutes, express_paused: input.paused === true })
    .eq("id", store.id);
  if (storeError) {
    console.error("[store-hours] falha ao salvar preparo/pausa", { storeId: store.id }, storeError);
    return { error: "Não foi possível salvar. Tente novamente." };
  }

  // Grava os dias ligados primeiro e só depois apaga os desligados: assim
  // não existe janela em que a loja fica sem nenhuma linha (= sem expressa)
  // no meio do salvamento.
  const enabled = days.filter((d) => d.enabled);
  if (enabled.length > 0) {
    const { error: upsertError } = await supabase.from("store_hours").upsert(
      enabled.map((d) => ({ store_id: store.id, weekday: d.weekday, opens: d.opens, closes: d.closes })),
      { onConflict: "store_id,weekday" },
    );
    if (upsertError) {
      console.error("[store-hours] falha ao gravar horários", { storeId: store.id }, upsertError);
      return { error: "Não foi possível salvar os horários. Tente novamente." };
    }
  }

  const disabledWeekdays = days.filter((d) => !d.enabled).map((d) => d.weekday);
  if (disabledWeekdays.length > 0) {
    const { error: deleteError } = await supabase
      .from("store_hours")
      .delete()
      .eq("store_id", store.id)
      .in("weekday", disabledWeekdays);
    if (deleteError) {
      console.error("[store-hours] falha ao remover dias desligados", { storeId: store.id }, deleteError);
      return { error: "Não foi possível salvar os horários. Tente novamente." };
    }
  }

  revalidatePath("/minha-loja");
  return { success: true };
}
