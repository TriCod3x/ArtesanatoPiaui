"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { ExternalLink, Upload, Loader2 } from "lucide-react";
import { updateStore, uploadStoreLogo, uploadStoreBanner } from "@/actions/stores";
import { storeSchema, type StoreInput } from "@/lib/validations";
import { CITIES_PI } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { StoreWithContacts } from "@/types";

interface EditStoreFormProps {
  store: StoreWithContacts;
  whatsapp: string;
  instagram: string;
}

export function EditStoreForm({ store, whatsapp, instagram }: EditStoreFormProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [logoUrl, setLogoUrl] = useState(store.logo_url ?? "");
  const [bannerUrl, setBannerUrl] = useState(store.banner_url ?? "");
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const logoRef = useRef<HTMLInputElement>(null);
  const bannerRef = useRef<HTMLInputElement>(null);

  const { register, handleSubmit, formState: { errors } } = useForm<StoreInput>({
    resolver: zodResolver(storeSchema),
    defaultValues: {
      name: store.name,
      slug: store.slug,
      description: store.description ?? "",
      city: store.city,
      state: store.state,
      whatsapp,
      instagram,
      logo_url: store.logo_url ?? "",
      banner_url: store.banner_url ?? "",
    },
  });

  const onSubmit = async (data: StoreInput) => {
    setSaving(true);
    const result = await updateStore(store.id, data);
    if (result?.error) {
      toast.error(result.error);
    } else {
      toast.success("Loja atualizada com sucesso!");
      router.refresh();
    }
    setSaving(false);
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    const result = await uploadStoreLogo(store.id, file);
    if (result?.url) {
      setLogoUrl(result.url);
      toast.success("Logo atualizado!");
    } else {
      toast.error(result?.error ?? "Erro ao enviar logo.");
    }
    setUploadingLogo(false);
  };

  const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingBanner(true);
    const result = await uploadStoreBanner(store.id, file);
    if (result?.url) {
      setBannerUrl(result.url);
      toast.success("Banner atualizado!");
    } else {
      toast.error(result?.error ?? "Erro ao enviar banner.");
    }
    setUploadingBanner(false);
  };

  return (
    <main className="max-w-2xl mx-auto px-4 py-10 min-h-screen dark:bg-[#1a1208] transition-colors duration-300">
      <div className="flex items-center justify-between mb-2">
        <h1 className="font-display text-3xl font-bold text-dark dark:text-[#f5edd6]">Editar loja</h1>
        <Link href={`/lojas/${store.slug}`} target="_blank" rel="noopener noreferrer">
          <Button variant="outline" size="sm" className="gap-1.5 text-sm border-border dark:border-[#3d2c1a] hover:border-terracota/40 dark:text-[#f5edd6]">
            <ExternalLink size={14} /> Ver loja pública
          </Button>
        </Link>
      </div>
      <p className="text-muted-foreground mb-8">As alterações ficam visíveis imediatamente na sua loja.</p>

      {/* Image uploads */}
      <div className="bg-white dark:bg-[#2a1e0f] rounded-2xl border border-border dark:border-[#3d2c1a] p-6 mb-6 space-y-5">
        <h2 className="font-semibold text-dark dark:text-[#f5edd6] text-sm uppercase tracking-wide">Imagens da loja</h2>

        {/* Banner */}
        <div className="space-y-2">
          <Label className="dark:text-terracota">Banner</Label>
          <div
            className="relative w-full h-32 rounded-xl overflow-hidden border border-dashed border-border dark:border-[#3d2c1a] cursor-pointer hover:border-terracota/50 transition-colors group"
            onClick={() => bannerRef.current?.click()}
            style={bannerUrl ? undefined : { background: "linear-gradient(135deg, #1A1208 0%, #C4622D 60%, #D4920A 100%)" }}
          >
            {bannerUrl && (
              <Image src={bannerUrl} alt="Banner" fill className="object-cover" sizes="672px" />
            )}
            <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              {uploadingBanner
                ? <Loader2 size={20} className="text-white animate-spin" />
                : <Upload size={20} className="text-white" />}
            </div>
          </div>
          <input ref={bannerRef} type="file" accept="image/*" className="hidden" onChange={handleBannerUpload} />
          <p className="text-xs text-muted-foreground dark:text-[#8a6a4a]">Clique para fazer upload. Recomendado: 1200×300px.</p>
        </div>

        {/* Logo */}
        <div className="space-y-2">
          <Label className="dark:text-terracota">Logo</Label>
          <div className="flex items-center gap-4">
            <div
              className="relative w-16 h-16 rounded-xl overflow-hidden border border-dashed border-border dark:border-[#3d2c1a] cursor-pointer hover:border-terracota/50 transition-colors group flex-shrink-0 bg-cream dark:bg-[#2a1e0f]"
              onClick={() => logoRef.current?.click()}
            >
              {logoUrl
                ? <Image src={logoUrl} alt="Logo" fill className="object-cover" sizes="64px" />
                : <div className="w-full h-full flex items-center justify-center font-bold text-terracota text-xl">{store.name[0]}</div>}
              <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-xl">
                {uploadingLogo
                  ? <Loader2 size={14} className="text-white animate-spin" />
                  : <Upload size={14} className="text-white" />}
              </div>
            </div>
            <p className="text-xs text-muted-foreground dark:text-[#8a6a4a]">Clique no quadrado para trocar o logo. Recomendado: 200×200px, fundo transparente.</p>
          </div>
          <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
        </div>
      </div>

      {/* Main form */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 bg-white dark:bg-[#2a1e0f] rounded-2xl border border-border dark:border-[#3d2c1a] p-8">
        <div className="space-y-2">
          <Label htmlFor="name" className="dark:text-terracota">Nome da loja</Label>
          <Input id="name" {...register("name")} className={errors.name ? "border-destructive" : ""} />
          {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="slug" className="dark:text-terracota">URL da loja</Label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground whitespace-nowrap">/lojas/</span>
            <Input id="slug" {...register("slug")} className={errors.slug ? "border-destructive" : ""} />
          </div>
          {errors.slug && <p className="text-sm text-destructive">{errors.slug.message}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="description" className="dark:text-terracota">Descrição</Label>
          <Textarea id="description" rows={4} {...register("description")} className={errors.description ? "border-destructive" : ""} />
          {errors.description && <p className="text-sm text-destructive">{errors.description.message}</p>}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="city" className="dark:text-terracota">Cidade</Label>
            <select
              id="city"
              {...register("city")}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-white text-dark focus:outline-none focus:ring-2 focus:ring-terracota"
            >
              <option value="">Selecione</option>
              {CITIES_PI.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            {errors.city && <p className="text-sm text-destructive">{errors.city.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="state" className="dark:text-terracota">Estado</Label>
            <Input id="state" {...register("state")} readOnly className="bg-cream/30 dark:bg-[#3d2c1a]" />
          </div>
        </div>

        {/* Contacts */}
        <div className="pt-2 border-t border-border dark:border-[#3d2c1a] space-y-5">
          <p className="text-sm font-semibold text-dark dark:text-[#f5edd6]">Contatos</p>

          <div className="space-y-2">
            <Label htmlFor="whatsapp" className="dark:text-terracota">
              WhatsApp <span className="text-destructive">*</span>
            </Label>
            <Input
              id="whatsapp"
              type="tel"
              placeholder="86999999999"
              {...register("whatsapp")}
              className={errors.whatsapp ? "border-destructive" : ""}
            />
            <p className="text-xs text-muted-foreground dark:text-[#8a6a4a]">Somente números, com DDD. Ex: 86999999999</p>
            {errors.whatsapp && <p className="text-sm text-destructive">{errors.whatsapp.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="instagram" className="dark:text-terracota">Instagram (opcional)</Label>
            <Input id="instagram" placeholder="sualoja (sem @)" {...register("instagram")} />
            <p className="text-xs text-muted-foreground dark:text-[#8a6a4a]">Somente o nome do usuário, sem @</p>
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <Button type="button" variant="outline" onClick={() => router.back()} className="flex-1 dark:border-[#3d2c1a] dark:text-[#f5edd6]">
            Cancelar
          </Button>
          <Button type="submit" className="flex-1 bg-terracota hover:bg-terracota/90 text-white font-semibold" disabled={saving}>
            {saving ? "Salvando..." : "Salvar alterações"}
          </Button>
        </div>
      </form>
    </main>
  );
}
