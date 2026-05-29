/**
 * Política de desconto e parcelamento da Mini Marcenaria.
 *
 * Regras:
 * - 12x sem juros no cartão (sem desconto adicional)
 * - 8% de desconto à vista (padrão, sempre vale)
 * - Em períodos de promoção, teto à vista pode subir pra 10% ou 12%
 *
 * A Mila NÃO decide — só chama a tool. A função aplica o teto vigente
 * (8% padrão, ou o teto da promoção quando ativa).
 */

type CondicaoPagamento = "a_vista" | "cartao";

const DESCONTO_PADRAO_AVISTA_PCT = 8;

/**
 * Promoção ativa. Quando `ativa: true`, o teto à vista vira `teto_pct`
 * (10 ou 12). Atualize esse objeto manualmente quando rolar campanha.
 *
 * AJUSTE AQUI quando ativar/desativar promoção.
 */
export const PROMOCAO_ATIVA: {
  ativa: boolean;
  teto_pct: 10 | 12;
  nome: string;
  valida_ate?: string; // YYYY-MM-DD
} = {
  ativa: false,
  teto_pct: 10,
  nome: "",
};

export interface DescontoInput {
  valor_orcado: number;
  desconto_pedido_reais: number;
  condicao_pagamento: CondicaoPagamento;
  justificativa_cliente?: string;
}

export interface DescontoOutput {
  aprovado: boolean;
  valor_final: number;
  percentual_concedido: number;
  texto_para_cliente: string;
  texto_interno: string;
  contraproposta?: {
    valor: number;
    condicao: string;
    explicacao: string;
  };
}

function tetoVigenteAVista(): number {
  if (PROMOCAO_ATIVA.ativa) {
    if (PROMOCAO_ATIVA.valida_ate) {
      const hoje = new Date().toISOString().split("T")[0];
      if (hoje > PROMOCAO_ATIVA.valida_ate) return DESCONTO_PADRAO_AVISTA_PCT;
    }
    return PROMOCAO_ATIVA.teto_pct;
  }
  return DESCONTO_PADRAO_AVISTA_PCT;
}

export function avaliarDesconto(input: DescontoInput): DescontoOutput {
  // Cartão: 12x sem juros, sem desconto adicional.
  if (input.condicao_pagamento === "cartao") {
    return {
      aprovado: false,
      valor_final: input.valor_orcado,
      percentual_concedido: 0,
      texto_para_cliente:
        `No cartão a gente parcela em até 12x sem juros pelo valor cheio (R$ ${input.valor_orcado.toLocaleString("pt-BR")}).\n\nÀ vista (PIX/dinheiro/transferência) tem ${tetoVigenteAVista()}% de desconto.`,
      texto_interno: "Cartão 12x sem juros não acumula desconto.",
    };
  }

  // À vista
  const percentualPedido = (input.desconto_pedido_reais / input.valor_orcado) * 100;
  const teto = tetoVigenteAVista();

  // Dentro do teto vigente → aprova
  if (percentualPedido <= teto) {
    const valorFinal = Math.round((input.valor_orcado - input.desconto_pedido_reais) / 50) * 50;
    return {
      aprovado: true,
      valor_final: valorFinal,
      percentual_concedido: Math.round(percentualPedido * 10) / 10,
      texto_para_cliente: `Fica R$ ${valorFinal.toLocaleString("pt-BR")} à vista (PIX, 50% no fechamento + 50% na entrega).`,
      texto_interno: PROMOCAO_ATIVA.ativa
        ? `Aprovado em PROMOÇÃO "${PROMOCAO_ATIVA.nome}": ${percentualPedido.toFixed(1)}% (teto promo ${teto}%)`
        : `Aprovado: ${percentualPedido.toFixed(1)}% (teto padrão ${teto}%)`,
    };
  }

  // Acima do teto: contraproposta no teto vigente
  const valorTeto = Math.round((input.valor_orcado * (1 - teto / 100)) / 50) * 50;
  return {
    aprovado: false,
    valor_final: valorTeto,
    percentual_concedido: teto,
    contraproposta: {
      valor: valorTeto,
      condicao: "à vista",
      explicacao: PROMOCAO_ATIVA.ativa
        ? `Esse é o teto da promoção atual (${teto}%).`
        : "Esse é o desconto máximo padrão da Mini à vista (8%).",
    },
    texto_para_cliente: PROMOCAO_ATIVA.ativa
      ? `Estamos com a promoção "${PROMOCAO_ATIVA.nome}" e o teto à vista é ${teto}% — fica R$ ${valorTeto.toLocaleString("pt-BR")}.\n\nAbaixo disso eu não consigo.`
      : `Nosso desconto à vista é ${teto}%, então fica R$ ${valorTeto.toLocaleString("pt-BR")}.\n\nAbaixo disso eu não consigo.`,
    texto_interno: `Pedido ${percentualPedido.toFixed(1)}% > teto ${teto}%. Contraproposta no teto.`,
  };
}
