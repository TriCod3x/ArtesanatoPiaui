import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";

export default function BuyerLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      <div className="flex-1 bg-cream/50 dark:bg-[#1a1208]">{children}</div>
      <Footer />
    </>
  );
}
