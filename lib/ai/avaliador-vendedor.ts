/**
 * Avaliador de vendedoras humanas — Mila assume o papel de "gerente de vendas
 * sênior" e analisa N conversas atendidas por uma vendedora específica, gerando
 * scorecard, pontos fortes, oportunidades e plano de treinamento.
 */

import Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt } from "./system-prompt";

const client = new Anthropic();
const SONNET = "claude-sonnet-4-6";

export interface MensagemAval {
  direcao: "entrada" | "saida";
  autor: string | null;
  conteudo: string | null;
  enviada_em: string | null;
}

export interface ConversaAval {
  contato_nome: string | null;
  contato_telefone: string | null;
  mensagens: MensagemAval[];
}

export interface AvaliacaoResultado {
  score_geral: number;          // 0-10
  score_tempo_resposta: number;
  score_completude: number;     // qualidade da info passada
  score_tom: number;            // tom + cortesia + escuta
  score_conversao: number;      // capacidade de levar à venda
  resumo_executivo: string;     // 2-3 linhas
  pontos_fortes: string[];
  pontos_fracos: string[];
  exemplos: Array<{
    cliente: string | null;
    problema: string;
    sugestao_de_como_deveria_ter_sido: string;
  }>;
  sugestoes_treinamento: string[];
}

const SYSTEM_AVALIADOR = `Você é uma GERENTE DE VENDAS SÊNIOR da Mini Marcenaria. Sua função é AVALIAR o desempenho de uma vendedora analisando o histórico real de atendimento dela no WhatsApp.

Você recebe N conversas que a vendedora atendeu. Avalie usando o tom e regras do prompt principal da Mini como REFERÊNCIA do que seria um atendimento "10 de 10". Mas seja JUSTA — uma vendedora humana tem outras restrições, então não exija perfeição.

## Devolva APENAS este JSON (sem texto fora dele):

{
  "score_geral": <0-10>,
  "score_tempo_resposta": <0-10>,
  "score_completude": <0-10>,
  "score_tom": <0-10>,
  "score_conversao": <0-10>,
  "resumo_executivo": "2-3 frases descrevendo o estilo dessa vendedora",
  "pontos_fortes": ["bullet 1", "bullet 2"],
  "pontos_fracos": ["bullet 1", "bullet 2"],
  "exemplos": [
    {
      "cliente": "Nome do cliente da conversa",
      "problema": "o que rolou de problemático",
      "sugestao_de_como_deveria_ter_sido": "como a Mila/atendente ideal teria respondido nesse turno específico"
    }
  ],
  "sugestoes_treinamento": [
    "ação concreta de treinamento (não vago — específico)"
  ]
}

## Critérios de score

- **score_tempo_resposta**: 10 = responde em minutos; 5 = horas; 0 = dias / abandona
- **score_completude**: 10 = passa toda info que o cliente precisa pra decidir (preço, prazo, opções); 5 = passa parte; 0 = só perguntas vazias
- **score_tom**: 10 = no tom da Mini (claro, gentil, direto, sem gírias forçadas, sem ser robótico); 5 = ok; 0 = formal demais ou gíria forçada
- **score_conversao**: 10 = leva o cliente até o fechamento ou agendamento; 5 = mantém interesse mas não fecha; 0 = perde o lead
- **score_geral**: média ponderada das 4 (todos pesos iguais)

## Como gerar exemplos

Cite SEMPRE pelo menos 2-3 momentos ESPECÍFICOS das conversas onde ela poderia ter respondido melhor. Cita o nome do cliente quando possível.

## Como gerar sugestões_treinamento

Não diz "responder mais rápido" (vago). Diz: *"quando o cliente pedir desconto, não diga 'vou verificar com gerente' sem prazo — confirme em até 1h ou já entregue o desconto no limite (8%) na mesma mensagem"*. Específico, acionável.

Agora analise as conversas:`;

export async function avaliarVendedor(opts: {
  vendedor: { nome: string; clint_id: string };
  conversas: ConversaAval[];
}): Promise<AvaliacaoResultado | { erro: string }> {
  if (opts.conversas.length === 0) {
    return { erro: "nenhuma conversa pra avaliar" };
  }

  // Monta o texto das conversas (limita pra não estourar contexto)
  const conversasTxt = opts.conversas.slice(0, 50).map((conv, i) => {
    const linhas = conv.mensagens.filter((m) => m.conteudo).map((m) => {
      const data = m.enviada_em ? new Date(m.enviada_em).toLocaleString("pt-BR") : "?";
      const quem = m.direcao === "entrada"
        ? `CLIENTE${conv.contato_nome ? ` (${conv.contato_nome})` : ""}`
        : `VENDEDORA (${opts.vendedor.nome})`;
      return `[${data}] ${quem}: ${m.conteudo}`;
    }).join("\n");
    return `═══ CONVERSA ${i + 1} — Cliente: ${conv.contato_nome ?? "(sem nome)"} ═══\n${linhas}`;
  }).join("\n\n");

  const userMsg = `Vendedora avaliada: ${opts.vendedor.nome}
Conversas analisadas: ${opts.conversas.length}
Hoje: ${new Date().toLocaleDateString("pt-BR")}

${conversasTxt}

Devolva apenas o JSON.`;

  try {
    const r = await client.messages.create({
      model: SONNET,
      max_tokens: 4000,
      system: [
        { type: "text", text: buildSystemPrompt(), cache_control: { type: "ephemeral", ttl: "1h" } },
        { type: "text", text: SYSTEM_AVALIADOR },
      ] as unknown as string,
      messages: [{ role: "user", content: userMsg }],
    });

    const text = r.content[0].type === "text" ? r.content[0].text : "";
    const json = text.match(/\{[\s\S]*\}/)?.[0];
    if (!json) return { erro: "IA não retornou JSON válido" };
    return JSON.parse(json) as AvaliacaoResultado;
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "erro" };
  }
}
