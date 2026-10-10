import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { EditStoreForm } from "./EditStoreForm";
import { ExpressDeliverySettings } from "./ExpressDeliverySettings";
import { isUberDirectConfigured } from "@/lib/uber-direct";
import type { StoreWithContacts } from "@/types";

export default async function MinhaLojaPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase
    .from("stores")
    .select("*, contacts:store_contacts(id, type, value, is_primary)")
    .eq("owner_id", user.id)
    .single();

  if (!data) redirect("/minha-loja/nova");

  const store = data as unknown as StoreWithContacts;
  const whatsapp = store.contacts?.find((c) => c.type === "whatsapp")?.value ?? "";
  const instagram = store.contacts?.find((c) => c.type === "instagram")?.value ?? "";

  const { data: hours } = await supabase
    .from("store_hours")
    .select("weekday, opens, closes")
    .eq("store_id", store.id);

  const storeRow = data as unknown as { express_prep_minutes: number; express_paused: boolean };

  return (
    <>
      <EditStoreForm store={store} whatsapp={whatsapp} instagram={instagram}>
        {/* Sem as credenciais da Uber no ambiente a configuração não teria efeito. */}
        {isUberDirectConfigured() && (
          <ExpressDeliverySettings
            hours={hours ?? []}
            prepMinutes={storeRow.express_prep_minutes}
            paused={storeRow.express_paused}
          />
        )}
      </EditStoreForm>
    </>
  );
}
