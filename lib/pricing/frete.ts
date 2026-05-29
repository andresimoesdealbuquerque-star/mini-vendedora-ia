/**
 * Política de frete da Mini Marcenaria.
 *
 * Atendimento atual:
 * - João Pessoa (PB) e Campina Grande (PB): grátis
 * - Recife (PE) e Natal (RN): R$ 59,90
 * - Outras cidades: passa pra humano (não cotar sozinha)
 *
 * Entrega é sempre dentro da casa do cliente, com o móvel já montado.
 */

const FRETE_GRATIS_CIDADES = [
  "joao pessoa", "joão pessoa", "jp", "campina grande", "cg",
];

const FRETE_PAGO_CIDADES = [
  "recife", "natal",
];

const VALOR_FRETE_PAGO = 59.9;

export interface FreteInput {
  cidade: string;
  estado?: string;
}

export interface FreteOutput {
  atende: boolean;
  valor: number;
  texto_para_cliente: string;
  precisa_humano: boolean;
}

export function calcularFrete(input: FreteInput): FreteOutput {
  const cidadeNorm = normalizar(input.cidade);

  if (FRETE_GRATIS_CIDADES.some((c) => cidadeNorm.includes(c))) {
    return {
      atende: true,
      valor: 0,
      texto_para_cliente: "Frete grátis. A entrega vai dentro da sua casa, com o móvel já montado.",
      precisa_humano: false,
    };
  }

  if (FRETE_PAGO_CIDADES.some((c) => cidadeNorm.includes(c))) {
    return {
      atende: true,
      valor: VALOR_FRETE_PAGO,
      texto_para_cliente: `Frete de R$ ${VALOR_FRETE_PAGO.toFixed(2).replace(".", ",")}. A entrega vai dentro da sua casa, com o móvel já montado.`,
      precisa_humano: false,
    };
  }

  return {
    atende: false,
    valor: 0,
    texto_para_cliente: `Pra ${input.cidade} preciso conferir com a equipe — vou te passar pra Marina pra ela cotar o frete certinho.`,
    precisa_humano: true,
  };
}

function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}
