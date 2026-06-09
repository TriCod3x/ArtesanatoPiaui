"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { signIn } from "@/actions/auth";
import { signInSchema, type SignInInput } from "@/lib/validations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignInInput>({
    resolver: zodResolver(signInSchema),
  });

  const onSubmit = async (data: SignInInput) => {
    setLoading(true);
    const result = await signIn(data);
    if (result?.error) {
      toast.error(result.error);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-cream dark:bg-[#1a1208] flex items-center justify-center px-4 transition-colors duration-300">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-block mb-6">
            <span className="font-display text-3xl font-black text-dark dark:text-[#f5edd6]">
              Artesanatos<span className="text-terracota"> Piauí</span>
            </span>
          </Link>
          <h1 className="text-2xl font-bold text-dark dark:text-[#f5edd6]">Bem-vindo de volta</h1>
          <p className="text-muted-foreground mt-1">Entre na sua conta para continuar</p>
        </div>

        {/* Form */}
        <div className="bg-white dark:bg-[#2a1e0f] rounded-2xl shadow-sm border border-border dark:border-[#3d2c1a] p-8">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="seu@email.com"
                {...register("email")}
                className={errors.email ? "border-destructive" : ""}
              />
              {errors.email && (
                <p className="text-sm text-destructive">{errors.email.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                {...register("password")}
                className={errors.password ? "border-destructive" : ""}
              />
              {errors.password && (
                <p className="text-sm text-destructive">{errors.password.message}</p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full bg-terracota hover:bg-terracota/90 text-white font-semibold h-11"
              disabled={loading}
            >
              {loading ? "Entrando..." : "Entrar"}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground mt-6">
            Não tem conta?{" "}
            <Link href="/cadastro" className="text-terracota font-semibold hover:underline">
              Cadastre-se
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
