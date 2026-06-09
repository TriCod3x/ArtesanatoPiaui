import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight, Store } from "lucide-react";

export function HeroSection() {
  return (
    <section className="relative overflow-hidden" style={{ minHeight: "520px" }}>
      {/* Background image */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: "url('/capa.jpg')" }}
      />
      {/* Dark overlay */}
      <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.62)" }} />

      <div className="relative max-w-7xl mx-auto px-4 py-20 md:py-28 flex flex-col items-center text-center">
        <span className="inline-block bg-terracota/30 text-cream text-sm font-semibold px-4 py-1.5 rounded-full mb-6 border border-terracota/40 backdrop-blur-sm">
          Do sertão para o mundo
        </span>

        <h1
          className="font-display text-4xl md:text-6xl lg:text-7xl font-black text-white leading-tight max-w-4xl"
          style={{ textShadow: "0 2px 12px rgba(0,0,0,0.7)" }}
        >
          Arte e alma do{" "}
          <span className="text-terracota">Piauí</span>{" "}
          nas suas mãos
        </h1>

        <p
          className="mt-6 text-lg md:text-xl text-white/80 max-w-2xl leading-relaxed"
          style={{ textShadow: "0 2px 12px rgba(0,0,0,0.7)" }}
        >
          Descubra peças únicas feitas por artesãos locais. Cerâmica, capim dourado, rendas, couro e muito mais — cada peça carrega a história do nosso povo.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row gap-4">
          <Link href="/produtos">
            <Button size="lg" className="bg-terracota hover:bg-terracota/90 text-white font-semibold px-8 h-12 text-base gap-2 shadow-lg">
              Explorar produtos <ArrowRight size={18} />
            </Button>
          </Link>
          <Link href="/vender">
            <Button
              size="lg"
              variant="outline"
              className="bg-transparent border-white/50 text-white hover:bg-white/10 hover:text-white font-semibold px-8 h-12 text-base gap-2"
            >
              <Store size={18} /> Vender aqui
            </Button>
          </Link>
        </div>

        {/* Stats */}
        <div className="mt-16 grid grid-cols-3 gap-8 text-center">
          {[
            { value: "500+", label: "Artesãos" },
            { value: "2.000+", label: "Produtos" },
            { value: "15+", label: "Cidades" },
          ].map((stat) => (
            <div key={stat.label}>
              <p className="font-display text-3xl font-black text-terracota drop-shadow">{stat.value}</p>
              <p className="text-white/70 text-sm mt-1">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
