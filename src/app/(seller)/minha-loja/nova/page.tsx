"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { createStore } from "@/actions/stores";
import { storeSchema, type StoreInput } from "@/lib/validations";
import { generateSlug } from "@/lib/utils";
import { CITIES_PI } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default function NovaLojaPage() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const { register, handleSubmit, setValue, formState: { errors } } = useForm<StoreInput>({
    resolver: zodResolver(storeSchema),
    defaultValues: { state: "PI" },
  });

  const onSubmit = async (data: StoreInput) => {
    setLoading(true);
    const result = await createStore(data);
    if (result?.error) {
      toast.error(result.error);
      setLoading(false);
    } else {
      toast.success("Loja criada! Aguardando aprovação.");
      router.push("/dashboard");
    }
  };

  return (
    <main className="max-w-2xl mx-auto px-4 py-10 min-h-screen dark:bg-[#1a1208] transition-colors duration-300">
      <h1 className="font-display text-3xl font-bold text-dark dark:text-[#f5edd6] mb-2">Criar sua loja</h1>
      <p className="text-muted-foreground mb-8">Preencha as informações da sua loja. Ela ficará em análise até ser aprovada.</p>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 bg-white dark:bg-[#2a1e0f] rounded-2xl border border-border dark:border-[#3d2c1a] p-8">
        <div className="space-y-2">
          <Label htmlFor="name" className="dark:text-terracota">Nome da loja</Label>
          <Input
            id="name"
            placeholder="Ex: Cerâmicas do Sertão"
            {...register("name")}
            onBlur={(e) => setValue("slug", generateSlug(e.target.value))}
            className={errors.name ? "border-destructive" : ""}
          />
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
          <Textarea
            id="description"
            rows={4}
            placeholder="Conte a história da sua loja, o que você faz, sua inspiração..."
            {...register("description")}
            className={errors.description ? "border-destructive" : ""}
          />
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
            <Input id="state" {...register("state")} defaultValue="PI" readOnly className="bg-cream/30 dark:bg-[#3d2c1a]" />
          </div>
        </div>

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

        <Button type="submit" className="w-full bg-terracota hover:bg-terracota/90 text-white font-semibold h-11" disabled={loading}>
          {loading ? "Criando loja..." : "Criar loja"}
        </Button>
      </form>
    </main>
  );
}
