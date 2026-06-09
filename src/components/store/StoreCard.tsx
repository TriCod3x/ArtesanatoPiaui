import Image from "next/image";
import Link from "next/link";
import { MapPin, Star } from "lucide-react";

const WhatsAppIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5" aria-hidden="true">
    <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.867-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
  </svg>
);
import type { StoreWithContacts } from "@/types";

interface StoreCardProps {
  store: StoreWithContacts;
}

const InstagramIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5" aria-hidden="true">
    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
  </svg>
);

export function StoreCard({ store }: StoreCardProps) {
  const whatsapp = store.contacts?.find((c) => c.type === "whatsapp")?.value;
  const instagram = store.contacts?.find((c) => c.type === "instagram")?.value;

  return (
    <Link href={`/lojas/${store.slug}`} className="group block">
      <div className="bg-white dark:bg-[#2a1e0f] rounded-2xl border border-border dark:border-[#3d2c1a] overflow-hidden hover:shadow-md hover:border-terracota/40 transition-all duration-300">
        {/* Banner */}
        <div className="relative h-24 bg-gradient-to-r from-terracota/20 to-amber/20 dark:from-terracota/30 dark:to-amber/30">
          {store.banner_url && (
            <Image src={store.banner_url} alt="" fill className="object-cover" sizes="(max-width: 768px) 100vw, 33vw" />
          )}
          {/* Logo */}
          <div className="absolute -bottom-6 left-4 w-14 h-14 rounded-xl border-2 border-white dark:border-[#2a1e0f] shadow-md overflow-hidden bg-cream dark:bg-[#3d2c1a]">
            {store.logo_url ? (
              <Image src={store.logo_url} alt={store.name} fill className="object-cover" sizes="56px" />
            ) : (
              <div className="w-full h-full flex items-center justify-center font-bold text-terracota text-xl bg-terracota/10">
                {store.name[0]?.toUpperCase()}
              </div>
            )}
          </div>
        </div>

        {/* Info */}
        <div className="pt-8 p-4">
          <h3 className="font-semibold text-dark dark:text-[#f5edd6] group-hover:text-terracota transition-colors leading-snug">
            {store.name}
          </h3>
          <div className="flex items-center gap-1 text-muted-foreground text-xs mt-1">
            <MapPin size={12} />
            <span>{store.city}{store.state ? `, ${store.state}` : ""}</span>
          </div>

          <div className="flex items-center justify-between mt-3">
            <span className="text-xs text-muted-foreground">{store.total_sales} vendas</span>
            {store.rating && store.rating > 0 && (
              <div className="flex items-center gap-1 text-amber text-sm font-semibold">
                <Star size={13} fill="currentColor" />
                <span>{store.rating.toFixed(1)}</span>
              </div>
            )}
          </div>

          {/* Contact icons */}
          {(whatsapp || instagram) && (
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border dark:border-[#3d2c1a]">
              {whatsapp && (
                <span className="flex items-center gap-1 text-xs font-medium text-[#25D366]">
                  <WhatsAppIcon /> WhatsApp
                </span>
              )}
              {instagram && (
                <span
                  className="flex items-center gap-1 text-xs font-medium"
                  style={{ background: "linear-gradient(135deg,#833ab4,#fd1d1d,#fcb045)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}
                >
                  <InstagramIcon /> Instagram
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
