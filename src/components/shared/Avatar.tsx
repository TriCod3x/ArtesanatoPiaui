import Image from "next/image";

interface AvatarProps {
  name: string;
  url?: string | null;
  size?: number;
}

export function Avatar({ name, url, size = 40 }: AvatarProps) {
  return (
    <div
      className="rounded-full overflow-hidden bg-cream dark:bg-[#3d2c1a] flex items-center justify-center flex-shrink-0 relative"
      style={{ width: size, height: size }}
    >
      {url ? (
        <Image src={url} alt={name} fill className="object-cover" sizes={`${size}px`} />
      ) : (
        <span className="font-bold text-terracota" style={{ fontSize: size * 0.4 }}>
          {name?.[0]?.toUpperCase() ?? "?"}
        </span>
      )}
    </div>
  );
}
