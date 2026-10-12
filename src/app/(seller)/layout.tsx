import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";

export default function SellerLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      <div className="flex-1 bg-background">
        {children}
      </div>
      <Footer />
    </>
  );
}
