"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Check, FileText, Loader2, Upload } from "lucide-react";
import { signUp } from "@/actions/auth";
import { submitSellerRequirements } from "@/actions/stores";
import {
  sellerAccountSchema,
  sellerAddressSchema,
  sellerDocumentIdsSchema,
  sellerTermsSchema,
  ACCEPTED_ID_DOCUMENT_TYPES,
  MAX_ID_DOCUMENT_BYTES,
} from "@/lib/validations";
import { formatCEP, formatCNPJ, formatCPF, onlyDigits } from "@/lib/utils";
import { fetchAddressByCep } from "@/lib/viacep";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TermsDialog } from "./TermsDialog";

const STEP_LABELS = [
  "Dados da conta",
  "CPF / CNPJ",
  "Endereço",
  "Documento",
  "Termos de uso",
];
const TOTAL_STEPS = STEP_LABELS.length;

interface WizardData {
  cpf: string;
  cnpj: string;
  cep: string;
  address_street: string;
  address_number: string;
  address_complement: string;
  address_neighborhood: string;
  address_city: string;
  address_state: string;
}

export interface SellerSignupWizardProps {
  initialStep: number;
  authedEmail: string | null;
  initialValues: Partial<WizardData>;
  redirectAfter: string;
}

const cardClass =
  "bg-white dark:bg-[#2a1e0f] rounded-2xl shadow-sm border border-border dark:border-[#3d2c1a] p-6 sm:p-8";

export function SellerSignupWizard({
  initialStep,
  authedEmail,
  initialValues,
  redirectAfter,
}: SellerSignupWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState(initialStep);
  const [data, setData] = useState<WizardData>({
    cpf: initialValues.cpf ?? "",
    cnpj: initialValues.cnpj ?? "",
    cep: initialValues.cep ?? "",
    address_street: initialValues.address_street ?? "",
    address_number: initialValues.address_number ?? "",
    address_complement: initialValues.address_complement ?? "",
    address_neighborhood: initialValues.address_neighborhood ?? "",
    address_city: initialValues.address_city ?? "",
    address_state: initialValues.address_state ?? "",
  });
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const merge = (patch: Partial<WizardData>) =>
    setData((prev) => ({ ...prev, ...patch }));

  const goNext = () => setStep((s) => Math.min(s + 1, TOTAL_STEPS));
  const goBack = () => setStep((s) => Math.max(s - 1, 1));

  const handleFinish = async (acceptTerms: boolean) => {
    if (!file) {
      toast.error("Envie o documento de identidade na etapa anterior.");
      setStep(4);
      return;
    }
    setSubmitting(true);
    const result = await submitSellerRequirements({
      cpf: data.cpf,
      cnpj: onlyDigits(data.cnpj) ? data.cnpj : undefined,
      cep: data.cep,
      address_street: data.address_street,
      address_number: data.address_number,
      address_complement: data.address_complement || undefined,
      address_neighborhood: data.address_neighborhood,
      address_city: data.address_city,
      address_state: data.address_state,
      accept_terms: acceptTerms,
      document: file,
    });
    if (result?.error) {
      toast.error(result.error);
      setSubmitting(false);
      return;
    }
    toast.success("Cadastro enviado! Seus documentos estão em análise.");
    router.push(redirectAfter);
    router.refresh();
  };

  return (
    <div className="w-full max-w-lg">
      <div className="text-center mb-8">
        <Link href="/" className="inline-block mb-6">
          <span className="font-display text-3xl font-black text-dark dark:text-[#f5edd6]">
            Artesanatos<span className="text-terracota"> Piauí</span>
          </span>
        </Link>
        <h1 className="text-2xl font-bold text-dark dark:text-[#f5edd6]">
          Abra sua loja
        </h1>
        <p className="text-muted-foreground mt-1">
          Etapa {step} de {TOTAL_STEPS} — {STEP_LABELS[step - 1]}
        </p>
      </div>

      <ProgressBar step={step} />

      <div className={cardClass}>
        {step === 1 && (
          <AccountStep
            authedEmail={authedEmail}
            onNext={goNext}
          />
        )}
        {step === 2 && (
          <DocumentIdsStep
            defaults={{ cpf: data.cpf, cnpj: data.cnpj }}
            onBack={initialStep < 2 ? goBack : undefined}
            onNext={(v) => {
              merge(v);
              goNext();
            }}
          />
        )}
        {step === 3 && (
          <AddressStep
            defaults={data}
            onBack={goBack}
            onNext={(v) => {
              merge(v);
              goNext();
            }}
          />
        )}
        {step === 4 && (
          <DocumentUploadStep
            file={file}
            setFile={setFile}
            onBack={goBack}
            onNext={goNext}
          />
        )}
        {step === 5 && (
          <TermsStep
            submitting={submitting}
            onBack={goBack}
            onFinish={handleFinish}
          />
        )}
      </div>

      <Link
        href="/vender"
        className="flex items-center justify-center gap-1.5 mt-6 text-sm text-muted-foreground hover:text-dark dark:hover:text-[#f5edd6] transition-colors"
      >
        <ArrowLeft size={14} /> Voltar para a página de vendedores
      </Link>
    </div>
  );
}

function ProgressBar({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-1.5 mb-6" aria-hidden>
      {Array.from({ length: TOTAL_STEPS }).map((_, i) => {
        const n = i + 1;
        const done = n < step;
        const current = n === step;
        return (
          <div key={n} className="flex-1 flex items-center gap-1.5">
            <span
              className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center shrink-0 ${
                done
                  ? "bg-capim text-white"
                  : current
                    ? "bg-terracota text-white"
                    : "bg-border dark:bg-[#3d2c1a] text-muted-foreground"
              }`}
            >
              {done ? <Check size={13} /> : n}
            </span>
            {n < TOTAL_STEPS && (
              <span
                className={`flex-1 h-px ${
                  done ? "bg-capim" : "bg-border dark:bg-[#3d2c1a]"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-sm text-destructive">{message}</p>;
}

function StepNav({
  onBack,
  nextLabel = "Continuar",
  loading,
}: {
  onBack?: () => void;
  nextLabel?: string;
  loading?: boolean;
}) {
  return (
    <div className="flex gap-3 pt-2">
      {onBack && (
        <Button
          type="button"
          variant="outline"
          onClick={onBack}
          className="flex-1 dark:border-[#3d2c1a] dark:text-[#f5edd6]"
        >
          <ArrowLeft size={15} /> Voltar
        </Button>
      )}
      <Button
        type="submit"
        disabled={loading}
        className="flex-1 bg-terracota hover:bg-terracota/90 text-white font-semibold h-11"
      >
        {loading ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <>
            {nextLabel} <ArrowRight size={15} />
          </>
        )}
      </Button>
    </div>
  );
}

// ── Etapa 1 — conta ─────────────────────────────────────────────────────────
function AccountStep({
  authedEmail,
  onNext,
}: {
  authedEmail: string | null;
  onNext: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({ resolver: zodResolver(sellerAccountSchema) });

  if (authedEmail) {
    return (
      <div className="space-y-5">
        <p className="text-sm text-muted-foreground">
          Você já está logado como{" "}
          <span className="font-semibold text-dark dark:text-[#f5edd6]">
            {authedEmail}
          </span>
          .
        </p>
        <Button
          type="button"
          onClick={onNext}
          className="w-full bg-terracota hover:bg-terracota/90 text-white font-semibold h-11"
        >
          Continuar <ArrowRight size={15} />
        </Button>
      </div>
    );
  }

  const onSubmit = handleSubmit(async (values) => {
    setLoading(true);
    const result = await signUp(
      { ...values, role: "seller", phone: undefined },
      { redirect: false },
    );
    if (result?.error) {
      toast.error(result.error);
      setLoading(false);
      return;
    }
    onNext();
  });

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="full_name" className="dark:text-terracota">
          Seu nome completo
        </Label>
        <Input
          id="full_name"
          placeholder="Ex: Maria das Graças Silva"
          {...register("full_name")}
          className={errors.full_name ? "border-destructive" : ""}
        />
        <FieldError message={errors.full_name?.message} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email" className="dark:text-terracota">
          Email
        </Label>
        <Input
          id="email"
          type="email"
          placeholder="seu@email.com"
          {...register("email")}
          className={errors.email ? "border-destructive" : ""}
        />
        <FieldError message={errors.email?.message} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password" className="dark:text-terracota">
          Senha
        </Label>
        <Input
          id="password"
          type="password"
          placeholder="Mínimo 6 caracteres"
          {...register("password")}
          className={errors.password ? "border-destructive" : ""}
        />
        <FieldError message={errors.password?.message} />
      </div>
      <StepNav loading={loading} nextLabel="Criar conta e continuar" />
    </form>
  );
}

// ── Etapa 2 — CPF / CNPJ ────────────────────────────────────────────────────
function DocumentIdsStep({
  defaults,
  onBack,
  onNext,
}: {
  defaults: { cpf: string; cnpj: string };
  onBack?: () => void;
  onNext: (v: { cpf: string; cnpj: string }) => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(sellerDocumentIdsSchema),
    defaultValues: { cpf: defaults.cpf, cnpj: defaults.cnpj },
  });

  const cpfReg = register("cpf");
  const cnpjReg = register("cnpj");

  const onSubmit = handleSubmit((values) => {
    onNext({ cpf: values.cpf ?? "", cnpj: values.cnpj ?? "" });
  });

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="cpf" className="dark:text-terracota">
          CPF <span className="text-destructive">*</span>
        </Label>
        <Input
          id="cpf"
          inputMode="numeric"
          placeholder="000.000.000-00"
          {...cpfReg}
          onChange={(e) => {
            e.target.value = formatCPF(e.target.value);
            cpfReg.onChange(e);
          }}
          className={errors.cpf ? "border-destructive" : ""}
        />
        <FieldError message={errors.cpf?.message} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="cnpj" className="dark:text-terracota">
          CNPJ (opcional)
        </Label>
        <Input
          id="cnpj"
          inputMode="numeric"
          placeholder="00.000.000/0000-00"
          {...cnpjReg}
          onChange={(e) => {
            e.target.value = formatCNPJ(e.target.value);
            cnpjReg.onChange(e);
          }}
          className={errors.cnpj ? "border-destructive" : ""}
        />
        <FieldError message={errors.cnpj?.message} />
      </div>
      <p className="text-xs text-muted-foreground dark:text-[#8a6a4a]">
        Esses dados são usados apenas para verificação e nunca aparecem em
        páginas públicas.
      </p>
      <StepNav onBack={onBack} />
    </form>
  );
}

// ── Etapa 3 — endereço com ViaCEP ───────────────────────────────────────────
function AddressStep({
  defaults,
  onBack,
  onNext,
}: {
  defaults: WizardData;
  onBack: () => void;
  onNext: (v: Partial<WizardData>) => void;
}) {
  const [cepLoading, setCepLoading] = useState(false);
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(sellerAddressSchema),
    defaultValues: {
      cep: defaults.cep,
      address_street: defaults.address_street,
      address_number: defaults.address_number,
      address_complement: defaults.address_complement,
      address_neighborhood: defaults.address_neighborhood,
      address_city: defaults.address_city,
      address_state: defaults.address_state,
    },
  });

  const cepReg = register("cep");

  const handleCepBlur = async (value: string) => {
    if (onlyDigits(value).length !== 8) return;
    setCepLoading(true);
    const address = await fetchAddressByCep(value);
    setCepLoading(false);
    if (!address) {
      toast.error("CEP não encontrado. Preencha o endereço manualmente.");
      return;
    }
    if (address.street)
      setValue("address_street", address.street, { shouldValidate: true });
    if (address.neighborhood)
      setValue("address_neighborhood", address.neighborhood, {
        shouldValidate: true,
      });
    if (address.city)
      setValue("address_city", address.city, { shouldValidate: true });
    if (address.state)
      setValue("address_state", address.state, { shouldValidate: true });
  };

  const onSubmit = handleSubmit((values) => onNext(values));

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="cep" className="dark:text-terracota">
          CEP <span className="text-destructive">*</span>
        </Label>
        <div className="relative">
          <Input
            id="cep"
            inputMode="numeric"
            placeholder="00000-000"
            {...cepReg}
            onChange={(e) => {
              e.target.value = formatCEP(e.target.value);
              cepReg.onChange(e);
            }}
            onBlur={(e) => {
              cepReg.onBlur(e);
              handleCepBlur(e.target.value);
            }}
            className={errors.cep ? "border-destructive" : ""}
          />
          {cepLoading && (
            <Loader2
              size={16}
              className="animate-spin absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
          )}
        </div>
        <FieldError message={errors.cep?.message} />
        <p className="text-xs text-muted-foreground dark:text-[#8a6a4a]">
          Preenchemos rua, bairro, cidade e estado automaticamente.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="address_street" className="dark:text-terracota">
          Rua
        </Label>
        <Input
          id="address_street"
          {...register("address_street")}
          className={errors.address_street ? "border-destructive" : ""}
        />
        <FieldError message={errors.address_street?.message} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="address_number" className="dark:text-terracota">
            Número
          </Label>
          <Input
            id="address_number"
            {...register("address_number")}
            className={errors.address_number ? "border-destructive" : ""}
          />
          <FieldError message={errors.address_number?.message} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="address_complement" className="dark:text-terracota">
            Complemento
          </Label>
          <Input id="address_complement" {...register("address_complement")} />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="address_neighborhood" className="dark:text-terracota">
          Bairro
        </Label>
        <Input
          id="address_neighborhood"
          {...register("address_neighborhood")}
          className={errors.address_neighborhood ? "border-destructive" : ""}
        />
        <FieldError message={errors.address_neighborhood?.message} />
      </div>

      <div className="grid grid-cols-[1fr_5rem] gap-4">
        <div className="space-y-2">
          <Label htmlFor="address_city" className="dark:text-terracota">
            Cidade
          </Label>
          <Input
            id="address_city"
            {...register("address_city")}
            className={errors.address_city ? "border-destructive" : ""}
          />
          <FieldError message={errors.address_city?.message} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="address_state" className="dark:text-terracota">
            UF
          </Label>
          <Input
            id="address_state"
            maxLength={2}
            {...register("address_state")}
            className={errors.address_state ? "border-destructive uppercase" : "uppercase"}
          />
          <FieldError message={errors.address_state?.message} />
        </div>
      </div>

      <StepNav onBack={onBack} />
    </form>
  );
}

// ── Etapa 4 — documento ─────────────────────────────────────────────────────
function DocumentUploadStep({
  file,
  setFile,
  onBack,
  onNext,
}: {
  file: File | null;
  setFile: (f: File | null) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const previewUrl = useMemo(() => {
    if (file && file.type.startsWith("image/")) return URL.createObjectURL(file);
    return null;
  }, [file]);

  const pick = (f: File | undefined) => {
    if (!f) return;
    if (!(ACCEPTED_ID_DOCUMENT_TYPES as readonly string[]).includes(f.type)) {
      setError("Formato inválido. Envie JPG, PNG ou PDF.");
      return;
    }
    if (f.size > MAX_ID_DOCUMENT_BYTES) {
      setError("O arquivo deve ter no máximo 5MB.");
      return;
    }
    setError(null);
    setFile(f);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError("Selecione o documento de identidade.");
      return;
    }
    onNext();
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="space-y-2">
        <Label className="dark:text-terracota">
          Documento de identidade <span className="text-destructive">*</span>
        </Label>
        <p className="text-xs text-muted-foreground dark:text-[#8a6a4a]">
          RG, CNH ou outro documento oficial com foto. JPG, PNG ou PDF, até 5MB.
        </p>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="w-full border border-dashed border-border dark:border-[#3d2c1a] rounded-xl p-6 flex flex-col items-center gap-2 hover:border-terracota/50 transition-colors text-center"
        >
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt="Pré-visualização do documento"
              className="max-h-40 w-auto rounded-lg object-contain"
            />
          ) : file ? (
            <FileText size={28} className="text-terracota" />
          ) : (
            <Upload size={24} className="text-muted-foreground" />
          )}
          <span className="text-sm text-dark dark:text-[#f5edd6]">
            {file ? file.name : "Clique para selecionar o arquivo"}
          </span>
        </button>

        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,application/pdf"
          className="hidden"
          onChange={(e) => pick(e.target.files?.[0])}
        />
        <FieldError message={error ?? undefined} />
      </div>
      <StepNav onBack={onBack} />
    </form>
  );
}

// ── Etapa 5 — termos ────────────────────────────────────────────────────────
function TermsStep({
  submitting,
  onBack,
  onFinish,
}: {
  submitting: boolean;
  onBack: () => void;
  onFinish: (accept: boolean) => void;
}) {
  const {
    handleSubmit,
    register,
    formState: { errors },
  } = useForm({ resolver: zodResolver(sellerTermsSchema) });

  const onSubmit = handleSubmit(() => onFinish(true));

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Falta pouco! Leia e aceite os termos para enviar seu cadastro para
        análise.
      </p>

      <div className="rounded-xl border border-border dark:border-[#3d2c1a] p-4">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            {...register("accept_terms")}
            className="mt-0.5 h-4 w-4 accent-terracota"
          />
          <span className="text-sm text-dark dark:text-[#f5edd6]">
            Li e concordo com os Termos de Uso para vendedores da Artesanatos
            Piauí.
          </span>
        </label>
        <div className="mt-2 pl-7 text-sm">
          <TermsDialog label="Ler os termos de uso" />
        </div>
      </div>
      <FieldError message={errors.accept_terms?.message as string | undefined} />

      <StepNav
        onBack={onBack}
        loading={submitting}
        nextLabel="Enviar cadastro"
      />
    </form>
  );
}
