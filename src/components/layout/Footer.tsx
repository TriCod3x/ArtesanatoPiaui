import Link from "next/link";
import { MessageCircle, Mail, ExternalLink } from "lucide-react";

export function Footer() {
  return (
    <footer className="bg-dark dark:bg-[#110c05] text-cream/80 mt-auto transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-4 py-12 grid grid-cols-1 md:grid-cols-4 gap-8">
        {/* Brand */}
        <div className="md:col-span-2">
          <p className="font-display text-2xl font-black text-cream mb-3">
            Artesanatos<br />
            <span className="text-terracota">Piauí</span>
          </p>
          <p className="text-sm text-cream/60 max-w-xs leading-relaxed">
            O maior marketplace de artesanato piauiense. Conectando artesãos locais a compradores de todo o Brasil.
          </p>
        </div>

        {/* Links */}
        <div>
          <h3 className="text-cream font-semibold mb-3 text-sm uppercase tracking-wider">Navegação</h3>
          <ul className="space-y-2 text-sm">
            <li><Link href="/produtos" className="hover:text-terracota transition-colors">Produtos</Link></li>
            <li><Link href="/lojas" className="hover:text-terracota transition-colors">Lojas</Link></li>
            <li><Link href="/cadastro" className="hover:text-terracota transition-colors">Vender aqui</Link></li>
          </ul>
        </div>

        {/* Info */}
        <div>
          <h3 className="text-cream font-semibold mb-3 text-sm uppercase tracking-wider">Informações</h3>
          <ul className="space-y-2 text-sm">
            <li><Link href="#" className="hover:text-terracota transition-colors">Sobre nós</Link></li>
            <li><Link href="#" className="hover:text-terracota transition-colors">Como funciona</Link></li>
            <li><Link href="#" className="hover:text-terracota transition-colors">Termos de uso</Link></li>
            <li><Link href="#" className="hover:text-terracota transition-colors">Privacidade</Link></li>
          </ul>
        </div>
      </div>

      <div className="border-t border-cream/10 max-w-7xl mx-auto px-4 py-6 flex flex-col md:flex-row items-center justify-between gap-4">
        <p className="text-xs text-cream/40">
          © {new Date().getFullYear()} Artesanatos Piauí. Todos os direitos reservados.
        </p>
        <div className="flex items-center gap-4">
          <a href="#" className="text-cream/40 hover:text-terracota transition-colors">
            <ExternalLink size={18} />
          </a>
          <a href="#" className="text-cream/40 hover:text-terracota transition-colors">
            <MessageCircle size={18} />
          </a>
          <a href="mailto:contato@artesanatospiaui.com.br" className="text-cream/40 hover:text-terracota transition-colors">
            <Mail size={18} />
          </a>
        </div>
      </div>
    </footer>
  );
}
