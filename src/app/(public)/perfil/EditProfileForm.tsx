"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Upload, User } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateProfile } from "@/actions/profile";
import { profileSchema, type ProfileInput } from "@/lib/validations";
import { uploadAvatarFile, validateImageFile } from "@/lib/upload";
import { CITIES_PI } from "@/lib/constants";

interface EditProfileFormProps {
  userId: string;
  initial: { full_name: string; city: string; avatar_url: string };
}

export function EditProfileForm({ userId, initial }: EditProfileFormProps) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  // Avatar já salvo (ou recém-enviado) e o preview local antes de salvar.
  const [avatarUrl, setAvatarUrl] = useState(initial.avatar_url);
  const [preview, setPreview] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ProfileInput>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      full_name: initial.full_name,
      city: initial.city,
      avatar_url: initial.avatar_url,
    },
  });

  const shownAvatar = preview ?? avatarUrl;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const err = validateImageFile(file);
    if (err) {
      toast.error(err);
      return;
    }

    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(file);
    });
    setPendingFile(file);
  };

  const onSubmit = async (values: ProfileInput) => {
    let finalAvatar = avatarUrl;

    if (pendingFile) {
      setUploading(true);
      try {
        finalAvatar = await uploadAvatarFile(userId, pendingFile);
      } catch (e) {
        setUploading(false);
        toast.error(
          e instanceof Error ? e.message : "Falha ao enviar a foto de perfil.",
        );
        return;
      }
      setUploading(false);
    }

    const result = await updateProfile({ ...values, avatar_url: finalAvatar });
    if (result.error) {
      toast.error(result.error);
      return;
    }

    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setPendingFile(null);
    setAvatarUrl(finalAvatar);
    toast.success("Perfil atualizado!");
    router.refresh();
  };

  const busy = isSubmitting || uploading;

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      autoComplete="off"
      className="space-y-6 bg-white dark:bg-[#2a1e0f] rounded-2xl border border-border dark:border-[#3d2c1a] p-8"
    >
      {/* Avatar */}
      <div className="flex items-center gap-4">
        <div className="relative w-20 h-20 rounded-full overflow-hidden bg-cream dark:bg-[#3d2c1a] flex items-center justify-center flex-shrink-0 border border-border dark:border-[#3d2c1a]">
          {shownAvatar ? (
            <Image
              src={shownAvatar}
              alt="Foto de perfil"
              fill
              className="object-cover"
              sizes="80px"
              unoptimized={shownAvatar.startsWith("blob:")}
            />
          ) : (
            <User size={28} className="text-terracota" />
          )}
        </div>
        <div>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleFileChange}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileRef.current?.click()}
            className="gap-2 border-border dark:border-[#3d2c1a] dark:text-[#f5edd6]"
          >
            <Upload size={14} />
            {shownAvatar ? "Trocar foto" : "Adicionar foto"}
          </Button>
          <p className="text-xs text-muted-foreground dark:text-[#8a6a4a] mt-2">
            JPG, PNG ou WEBP · até 5MB
          </p>
          {preview && (
            <p className="text-xs text-terracota mt-1">
              Pré-visualização — clique em “Salvar” para confirmar.
            </p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="full_name" className="dark:text-terracota">
          Nome completo
        </Label>
        <Input
          id="full_name"
          autoComplete="off"
          {...register("full_name")}
          className={errors.full_name ? "border-destructive" : ""}
        />
        {errors.full_name && (
          <p className="text-sm text-destructive">{errors.full_name.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="city" className="dark:text-terracota">
          Cidade
        </Label>
        <select
          id="city"
          {...register("city")}
          className="w-full border border-border dark:border-[#3d2c1a] rounded-lg px-3 py-2 text-sm bg-white dark:bg-[#2a1e0f] text-dark dark:text-[#f5edd6] focus:outline-none focus:ring-2 focus:ring-terracota"
        >
          <option value="">Não informar</option>
          {CITIES_PI.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
          {initial.city && !CITIES_PI.includes(initial.city) && (
            <option value={initial.city}>{initial.city}</option>
          )}
        </select>
        {errors.city && (
          <p className="text-sm text-destructive">{errors.city.message}</p>
        )}
      </div>

      <Button
        type="submit"
        disabled={busy}
        className="w-full bg-terracota hover:bg-terracota/90 text-white font-semibold h-11 gap-2"
      >
        {busy && <Loader2 size={15} className="animate-spin" />}
        {uploading ? "Enviando foto..." : busy ? "Salvando..." : "Salvar"}
      </Button>
    </form>
  );
}
