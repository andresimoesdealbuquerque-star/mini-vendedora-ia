/**
 * Registry de artes/mídias que a Mila pode enviar pro cliente.
 *
 * Convenção: arquivos em `public/artes/`. URL pública é `/artes/<arquivo>`
 * (Next serve a pasta `public/` na raiz).
 *
 * Pra adicionar uma nova arte: salva o arquivo em public/artes/, registra aqui,
 * e (se quiser que a Mila chame em uma situação específica) menciona no
 * system-prompt em "# Mídias disponíveis".
 */

export type MidiaId = "paleta_cores" | "dados_fechamento" | "pix_pagamento";

export interface Midia {
  id: MidiaId;
  arquivo: string;       // nome do arquivo dentro de public/artes/
  descricao: string;     // o que a arte mostra
  quando_usar: string;   // gatilho pra Mila chamar
  caption?: string;       // legenda opcional ao enviar
}

export const MIDIAS: Record<MidiaId, Midia> = {
  paleta_cores: {
    id: "paleta_cores",
    arquivo: "paleta-cores.jpg",
    descricao: "Arte com as 14 cores do FORMINI: Sólidos, Madeiras e Lacas, com nome e amostra de cada.",
    quando_usar: "Cliente pergunta sobre cores, está em dúvida sobre qual cor escolher, ou pede pra ver opções.",
  },
  dados_fechamento: {
    id: "dados_fechamento",
    arquivo: "dados-fechamento.jpg",
    descricao: "Checklist visual dos dados necessários pra fechar pedido: nome completo, CPF, endereço, CEP, telefone, email, comprovante.",
    quando_usar: "Cliente APROVOU o orçamento e está pronto pra fechar — ANTES de começar a coletar dados, mande essa arte e em seguida peça o nome completo.",
    caption: "pra fechar seu pedido vou precisar destas informações",
  },
  pix_pagamento: {
    id: "pix_pagamento",
    arquivo: "pix-pagamento.jpg",
    descricao: "Arte com chave PIX (83 99992-1504), razão social (Marcenaria Arco Ltda), banco (Inter 077), agência (0001) e conta (22712404-9).",
    quando_usar: "Cliente confirmou pagamento à vista (PIX) e você precisa informar a chave. Manda essa arte ao invés de digitar a chave — fica mais profissional e o cliente bate o olho nos dados completos.",
    caption: "segue os dados pra pagamento via PIX",
  },
};

export interface MidiaResposta {
  ok: boolean;
  url: string;       // path público (ex: /artes/paleta-cores.jpg)
  caption?: string;
  descricao: string;
}

export function obterMidia(id: MidiaId): MidiaResposta {
  const m = MIDIAS[id];
  if (!m) {
    return { ok: false, url: "", descricao: `mídia '${id}' não cadastrada` };
  }
  return {
    ok: true,
    url: `/artes/${m.arquivo}`,
    caption: m.caption,
    descricao: m.descricao,
  };
}
