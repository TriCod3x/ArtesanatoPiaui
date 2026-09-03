import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { EditProfileForm } from "./EditProfileForm";

export const dynamic = "force-dynamic";

export default async function PerfilPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirect=/perfil");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, city, avatar_url, role")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <>
      <Header />
      <main className="flex-1 bg-background">
        <div className="max-w-xl mx-auto px-4 py-10">
          <header className="mb-8">
            <h1 className="font-display text-3xl font-bold text-dark dark:text-[#f5edd6]">
              Meu perfil
            </h1>
            <p className="text-muted-foreground mt-1">
              Essas informações aparecem para outras pessoas na comunidade e nas suas lojas.
            </p>
          </header>

          <EditProfileForm
            userId={user.id}
            initial={{
              full_name: profile?.full_name ?? "",
              city: profile?.city ?? "",
              avatar_url: profile?.avatar_url ?? "",
            }}
          />
        </div>
      </main>
      <Footer />
    </>
  );
}
