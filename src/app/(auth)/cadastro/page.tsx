"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { z } from "zod";
import { signUp } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const buyerSchema = z.object({
  full_name: z.string().min(2, "Nome deve ter no mínimo 2 caracteres"),
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "Senha deve ter no mínimo 6 caracteres"),
});
type BuyerInput = z.infer<typeof buyerSchema>;

export default function CadastroPage() {
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<BuyerInput>({
    resolver: zodResolver(buyerSchema),
  });

  const onSubmit = async (data: BuyerInput) => {
    setLoading(true);
    const result = await signUp({ ...data, role: "buyer", phone: undefined });
    if (result?.error) {
      toast.error(result.error);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#faf7f2] dark:bg-[#1a1208] flex items-center justify-center px-4 py-12 transition-colors duration-300">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-block mb-6">
            <span className="font-display text-3xl font-black text-dark dark:text-[#f5edd6]">
              Artesanatos<span className="text-terracota"> Piauí</span>
            </span>
          </Link>
          <h1 className="text-2xl font-bold text-dark dark:text-[#f5edd6]">Crie sua conta</h1>
          <p className="text-muted-foreground mt-1">Descubra e compre artesanato autêntico do Piauí</p>
        </div>

        <div className="bg-white dark:bg-[#2a1e0f] rounded-2xl shadow-sm border border-border dark:border-[#3d2c1a] p-8">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="full_name" className="dark:text-terracota">Nome completo</Label>
              <Input
                id="full_name"
                placeholder="Seu nome"
                {...register("full_name")}
                className={errors.full_name ? "border-destructive" : ""}
              />
              {errors.full_name && <p className="text-sm text-destructive">{errors.full_name.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="dark:text-terracota">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="seu@email.com"
                {...register("email")}
                className={errors.email ? "border-destructive" : ""}
              />
              {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="dark:text-terracota">Senha</Label>
              <Input
                id="password"
                type="password"
                placeholder="Mínimo 6 caracteres"
                {...register("password")}
                className={errors.password ? "border-destructive" : ""}
              />
              {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
            </div>

            <Button
              type="submit"
              className="w-full bg-terracota hover:bg-terracota/90 text-white font-semibold h-11"
              disabled={loading}
            >
              {loading ? "Criando conta..." : "Criar conta"}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground mt-6">
            Já tem conta?{" "}
            <Link href="/login" className="text-terracota font-semibold hover:underline">Entrar</Link>
          </p>
          <p className="text-center text-sm text-muted-foreground mt-2">
            Quer vender?{" "}
            <Link href="/vender" className="text-terracota font-semibold hover:underline">Abra sua loja</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
