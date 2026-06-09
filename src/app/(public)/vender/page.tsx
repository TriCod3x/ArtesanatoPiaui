import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { ArrowRight, CheckCircle2, Store, Zap, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";

const BENEFITS = [
  {
    icon: CheckCircle2,
    title: "Gratuito pra começar",
    description: "Crie sua loja sem pagar nada. Sem mensalidade, sem taxa de adesão. Você só paga quando vende.",
  },
  {
    icon: Zap,
    title: "Sua loja em minutos",
    description: "Cadastro rápido e intuitivo. Em menos de 5 minutos sua loja já está no ar e pronta para receber pedidos.",
  },
  {
    icon: Globe,
    title: "Alcance o Brasil inteiro",
    description: "Sua arte piauiense chega a compradores de todo o país. Mais de 2.000 compradores ativos na plataforma.",
  },
];

export default function VenderPage() {
  return (
    <>
      <Header />
      <main>
        {/* Hero */}
        <section className="bg-dark dark:bg-[#110c05] py-20 md:py-28 px-4 transition-colors duration-300">
          <div className="max-w-4xl mx-auto text-center">
            <span className="inline-block bg-terracota/20 text-terracota text-sm font-semibold px-4 py-1.5 rounded-full mb-6 border border-terracota/30">
              Para artesãos do Piauí
            </span>
            <h1
              className="font-display text-4xl md:text-6xl font-black text-white leading-tight mb-6"
              style={{ textShadow: "0 2px 12px rgba(0,0,0,0.4)" }}
            >
              Venda seu artesanato<br />
              <span className="text-terracota">para o Brasil inteiro</span>
            </h1>
            <p className="text-white/75 text-lg md:text-xl max-w-2xl mx-auto leading-relaxed mb-10">
              O maior marketplace de artesanato piauiense. Abra sua loja grátis hoje e mostre sua arte para o mundo.
            </p>
            <Link href="/vender/cadastro">
              <Button
                size="lg"
                className="bg-terracota hover:bg-terracota/90 text-white font-bold px-10 h-13 text-lg gap-2 shadow-lg"
              >
                Criar minha loja grátis <ArrowRight size={20} />
              </Button>
            </Link>
            <p className="text-white/40 text-sm mt-4">Sem cartão de crédito. Sem mensalidade.</p>
          </div>
        </section>

        {/* Benefits */}
        <section className="py-16 px-4 bg-[#faf7f2] dark:bg-[#1a1208] transition-colors duration-300">
          <div className="max-w-5xl mx-auto">
            <h2 className="font-display text-3xl font-bold text-dark dark:text-[#f5edd6] text-center mb-12">
              Por que vender na Artesanatos Piauí?
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {BENEFITS.map((b) => (
                <div key={b.title} className="bg-white dark:bg-[#2a1e0f] rounded-2xl border border-border dark:border-[#3d2c1a] p-7 flex flex-col gap-4">
                  <div className="w-12 h-12 rounded-xl bg-terracota/10 flex items-center justify-center">
                    <b.icon size={24} className="text-terracota" />
                  </div>
                  <h3 className="font-bold text-dark dark:text-[#f5edd6] text-lg">{b.title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{b.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Commission callout */}
        <section className="py-16 px-4 bg-white dark:bg-[#2a1e0f] border-y border-border dark:border-[#3d2c1a] transition-colors duration-300">
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center gap-3 bg-terracota/10 border border-terracota/20 rounded-2xl px-8 py-6 mb-8">
              <Store size={32} className="text-terracota flex-shrink-0" />
              <div className="text-left">
                <p className="font-black text-4xl text-terracota leading-none">10%</p>
                <p className="text-sm font-semibold text-dark dark:text-[#f5edd6] mt-0.5">de comissão por venda</p>
              </div>
            </div>
            <h2 className="font-display text-3xl font-bold text-dark dark:text-[#f5edd6] mb-4">
              Só 10% por venda.<br />Zero mensalidade.
            </h2>
            <p className="text-muted-foreground text-lg max-w-xl mx-auto mb-8">
              Você fica com 90% de cada venda. Sem taxa mensal, sem surpresa. Nossa comissão só é cobrada quando você vende — ou seja, só ganhamos quando você ganha.
            </p>
            <Link href="/vender/cadastro">
              <Button
                size="lg"
                className="bg-terracota hover:bg-terracota/90 text-white font-bold px-8 h-12 text-base gap-2"
              >
                Criar minha loja grátis <ArrowRight size={18} />
              </Button>
            </Link>
          </div>
        </section>

        {/* Social proof strip */}
        <section className="py-12 px-4 bg-dark dark:bg-[#110c05] transition-colors duration-300">
          <div className="max-w-4xl mx-auto grid grid-cols-3 gap-8 text-center">
            {[
              { value: "500+", label: "Artesãos cadastrados" },
              { value: "2.000+", label: "Produtos vendidos" },
              { value: "15+", label: "Cidades do Piauí" },
            ].map((s) => (
              <div key={s.label}>
                <p className="font-display text-3xl md:text-4xl font-black text-terracota">{s.value}</p>
                <p className="text-white/60 text-sm mt-1">{s.label}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
