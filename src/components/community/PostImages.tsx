"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

interface PostImagesProps {
  images: string[];
}

/**
 * Imagem única como sempre; com 2+ vira carrossel de scroll-snap com pontos
 * (sem biblioteca). O ponto ativo acompanha o scroll.
 */
export function PostImages({ images }: PostImagesProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  if (images.length === 0) return null;

  if (images.length === 1) {
    return (
      <div className="px-4 pb-3">
        <div className="relative rounded-xl overflow-hidden bg-cream dark:bg-[#3d2c1a]">
          <Image
            src={images[0]}
            alt="Imagem do post"
            width={1200}
            height={900}
            loading="lazy"
            className="w-full h-auto object-contain"
            style={{ maxHeight: "480px" }}
            sizes="(max-width: 768px) 100vw, 640px"
          />
        </div>
      </div>
    );
  }

  const onScroll = () => {
    const el = scroller.current;
    if (!el || el.clientWidth === 0) return;
    setActive(Math.round(el.scrollLeft / el.clientWidth));
  };

  const goTo = (index: number) => {
    const el = scroller.current;
    if (el) el.scrollTo({ left: index * el.clientWidth, behavior: "smooth" });
  };

  return (
    <div className="px-4 pb-3">
      <div className="relative rounded-xl overflow-hidden bg-cream dark:bg-[#3d2c1a]">
        <div
          ref={scroller}
          onScroll={onScroll}
          className="flex overflow-x-auto snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          aria-roledescription="carrossel"
        >
          {images.map((src, i) => (
            <div
              key={src}
              className="relative flex-none w-full snap-center flex items-center justify-center"
              style={{ height: "420px" }}
              aria-label={`Imagem ${i + 1} de ${images.length}`}
            >
              <Image
                src={src}
                alt={`Imagem ${i + 1} do post`}
                fill
                loading="lazy"
                className="object-contain"
                sizes="(max-width: 768px) 100vw, 640px"
              />
            </div>
          ))}
        </div>

        <span className="absolute top-2 right-2 text-[11px] font-semibold text-white bg-dark/70 rounded-full px-2 py-0.5">
          {active + 1}/{images.length}
        </span>
      </div>

      <div className="flex items-center justify-center gap-1.5 mt-2">
        {images.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => goTo(i)}
            aria-label={`Ir para a imagem ${i + 1}`}
            aria-current={i === active}
            className={cn(
              "h-1.5 rounded-full transition-all cursor-pointer",
              i === active ? "w-4 bg-terracota" : "w-1.5 bg-muted-foreground/40",
            )}
          />
        ))}
      </div>
    </div>
  );
}
