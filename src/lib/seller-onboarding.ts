/**
 * Checklist "Para começar a vender" do dashboard da vendedora — lógica pura.
 * Os três passos são os que faltam para uma loja nova de fato vender: receber
 * (Mercado Pago), enviar (Melhor Envio) e ter o que vender (produto).
 */

export interface OnboardingInput {
  mercadoPagoConnected: boolean;
  melhorEnvioConnected: boolean;
  hasProducts: boolean;
}

export interface OnboardingStep {
  key: "mercadopago" | "melhorenvio" | "product";
  title: string;
  description: string;
  href: string;
  cta: string;
  done: boolean;
}

export function buildOnboardingChecklist(input: OnboardingInput): OnboardingStep[] {
  return [
    {
      key: "mercadopago",
      title: "Conectar Mercado Pago",
      description: "Sem isso sua loja não recebe pagamentos e os compradores não conseguem finalizar a compra.",
      href: "/minha-loja/pagamentos",
      cta: "Conectar Mercado Pago",
      done: input.mercadoPagoConnected,
    },
    {
      key: "melhorenvio",
      title: "Conectar Melhor Envio",
      description: "Calcula o frete no checkout e compra as etiquetas de envio automaticamente.",
      href: "/minha-loja/frete",
      cta: "Conectar Melhor Envio",
      done: input.melhorEnvioConnected,
    },
    {
      key: "product",
      title: "Cadastrar o primeiro produto",
      description: "Adicione fotos, preço e estoque do que você vende.",
      href: "/meus-produtos/novo",
      cta: "Cadastrar produto",
      done: input.hasProducts,
    },
  ];
}

export function isOnboardingComplete(steps: readonly OnboardingStep[]): boolean {
  return steps.every((s) => s.done);
}
