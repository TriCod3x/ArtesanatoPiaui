import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { EditStoreForm } from "./EditStoreForm";
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

  return <EditStoreForm store={store} whatsapp={whatsapp} instagram={instagram} />;
}
