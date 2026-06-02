/**
 * Analisador de conversas pra recuperação de venda.
 *
 * Diferente da Mila atendente: esse é um "consultor sênior de vendas" que olha
 * histórico, identifica em que etapa o lead parou, sinais perdidos pela
 * vendedora, e gera uma mensagem personalizada de retomada — no MESMO TOM da
 * Mila atendente, mas pensando em reabrir o assunto sem soar oportunista.
 */

import Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt } from "./system-prompt";

const client = new Anthropic();
const SONNET = "claude-sonnet-4-6";

export interface MensagemAnalise {
  direcao: "entrada" | "saida";
  autor: string | null;
  conteudo: string | null;
  enviada_em: string | null;
}

export interface AnaliseResultado {
  calor: "quente" | "morno" | "frio" | "perdido";
  etapa_parou: string;
  dias_sem_resposta: number;
  diagnostico: string;
  pontos_fortes: string[];
  oportunidades_perdidas: string[];
  texto_sugerido: string;
  midia_sugerida?: "paleta_cores" | "dados_fechamento" | "pix_pagamento" | null;
  motivo_pular?: string;          // se a IA achar melhor não tentar reabrir, explica
}

const SYSTEM_ANALISADOR = `Você é um CONSULTOR SÊNIOR de vendas da Mini Marcenaria. Sua função é olhar uma conversa do WhatsApp entre cliente e vendedora, diagnosticar onde a venda travou, e gerar uma mensagem PERSONALIZADA de retomada — escrita no tom da Mila atendente (claro, gentil, direto, sem gírias forçadas, maiúscula no início, mensagens curtas separadas por "\\n\\n").

Você devolve APENAS um JSON com este formato (sem texto fora do JSON):

{
  "calor": "quente" | "morno" | "frio" | "perdido",
  "etapa_parou": "aquecimento | qualificacao | diagnostico | orcamento | negociacao | agendamento | fechamento | pos_venda | outro",
  "dias_sem_resposta": <inteiro>,
  "diagnostico": "1-3 frases descrevendo objetivamente o que rolou e onde parou",
  "pontos_fortes": ["bullet 1", "bullet 2"],
  "oportunidades_perdidas": ["bullet 1", "bullet 2"],
  "texto_sugerido": "Mensagem pronta pra mandar pro cliente. Tom da Mila. Pode usar \\n\\n pra fragmentar.",
  "midia_sugerida": "paleta_cores" | "dados_fechamento" | "pix_pagamento" | null,
  "motivo_pular": "(opcional) se for melhor não tentar reabrir, explique por quê"
}

## Como classificar o calor

- **quente** — cliente respondeu nos últimos 7 dias E ainda tem intenção clara
- **morno** — 8-30 dias sem resposta OU sem intenção clara, mas conversa não foi fechada
- **frio** — 31-90 dias sem resposta
- **perdido** — > 90 dias OU cliente disse explicitamente que desistiu

## Como gerar o texto_sugerido

- NUNCA começar com "oi cliente" ou genérico — use o NOME do cliente e referência específica ao que ele queria (modelo, cor, contexto).
- Reabrir o assunto sem soar desesperado. Ex: "Carla, lembrei do seu orçamento da cômoda preta — consegui aqui [valor X com 8% à vista]. Topa?" — melhor que "ainda interessa?".
- Se a vendedora prometeu algo e não voltou, a Mila REABRE essa promessa (ex: "voltei aqui com a resposta do gerente sobre o desconto que você pediu").
- Se cliente tinha objeção, antecipe a resolução.
- Mensagem curta — 2 a 4 fragmentos no máximo, separados por "\\n\\n".
- Comece com letra MAIÚSCULA, sem gírias forçadas ("valeu", "show", "kkk").
- Use "Tá", "pra" como contrações naturais. OK.

## Quando usar midia_sugerida

- "paleta_cores" — se a venda travou por dúvida de cor
- "dados_fechamento" — se cliente confirmou intenção e só faltam dados
- "pix_pagamento" — se o cliente confirmou pagamento à vista e só falta a chave

Use null se nenhuma arte fizer sentido nesse momento.

## Quando preencher motivo_pular

Se a melhor decisão for NÃO mandar mensagem (ex: cliente disse "vou pensar e te chamo", último contato há 2 dias), preencha motivo_pular e ainda assim devolva texto_sugerido vazio "". Não force reabertura em todo lead.

Agora, analise a conversa abaixo:`;

export async function analisarConversa(opts: {
  contato: { nome: string | null; telefone: string | null };
  mensagens: MensagemAnalise[];
}): Promise<AnaliseResultado | { erro: string }> {
  if (opts.mensagens.length === 0) {
    return { erro: "conversa sem mensagens" };
  }

  const linhas = opts.mensagens
    .filter((m) => m.conteudo)
    .map((m) => {
      const data = m.enviada_em ? new Date(m.enviada_em).toLocaleString("pt-BR") : "?";
      const quem = m.direcao === "entrada" ? `[${data}] CLIENTE${opts.contato.nome ? ` (${opts.contato.nome})` : ""}:` : `[${data}] VENDEDORA${m.autor ? ` (${m.autor})` : ""}:`;
      return `${quem} ${m.conteudo}`;
    })
    .join("\n");

  const userMsg = `Cliente: ${opts.contato.nome ?? "(sem nome)"} — ${opts.contato.telefone ?? "(sem telefone)"}

Histórico da conversa:
${linhas}

Hoje é ${new Date().toLocaleDateString("pt-BR")}.

Devolva APENAS o JSON.`;

  try {
    const r = await client.messages.create({
      model: SONNET,
      max_tokens: 1500,
      system: [
        { type: "text", text: buildSystemPrompt(), cache_control: { type: "ephemeral", ttl: "1h" } },
        { type: "text", text: SYSTEM_ANALISADOR },
      ] as unknown as string,
      messages: [{ role: "user", content: userMsg }],
    });

    const text = r.content[0].type === "text" ? r.content[0].text : "";
    const json = text.match(/\{[\s\S]*\}/)?.[0];
    if (!json) return { erro: "IA não retornou JSON válido" };
    return JSON.parse(json) as AnaliseResultado;
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "erro" };
  }
}
