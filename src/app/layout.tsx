import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { CartProvider } from "@/components/providers/CartProvider";
import { CartDrawer } from "@/components/cart/CartDrawer";
import { ThemeProvider } from "@/components/shared/ThemeProvider";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  weight: ["700", "900"],
});

export const metadata: Metadata = {
  title: "Artesanatos Piauí – Marketplace de Artesanato Piauiense",
  description:
    "Descubra e compre artesanato autêntico do Piauí. Cerâmica, rendas, capim dourado e muito mais, direto de artesãos locais.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      suppressHydrationWarning
      className={`${inter.variable} ${playfair.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col transition-colors duration-300">
        <ThemeProvider>
          <CartProvider>
            {children}
            <CartDrawer />
          </CartProvider>
          <Toaster richColors position="top-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
