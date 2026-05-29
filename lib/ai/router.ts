/**
 * Roteamento de modelo — chave pra minimizar custo.
 *
 * 80% das mensagens (saudação, pergunta simples, pedido de info) podem ser
 * respondidas por Haiku 4.5, ~10x mais barato que Sonnet.
 *
 * Apenas turnos com decisão comercial (orçamento, prazo, desconto, fechamento)
 * usam Sonnet 4.6.
 *
 * Classificação é feita pelo próprio Haiku numa chamada barata (~$0.0003).
 */

import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

export const HAIKU = "claude-haiku-4-5-20251001";
export const SONNET = "claude-sonnet-4-6";

export type Intent =
  | "saudacao"
  | "duvida_simples"
  | "pedido_orcamento"
  | "negociacao"
  | "agendamento"
  | "fechamento"
  | "off_topic"
  | "reclamacao"
  | "humano";

interface Routed {
  intent: Intent;
  model: string;
  rationale: string;
}

const CLASSIFIER_PROMPT = `Você classifica mensagens de cliente pra uma marcenaria sob medida no WhatsApp.

Devolva APENAS um JSON: {"intent":"...","reason":"..."}

Intents:
- saudacao: oi, boa tarde, primeira mensagem sem conteúdo
- duvida_simples: pergunta sobre material, prazo geral, processo, garantia
- pedido_orcamento: cliente quer preço, está dando dimensões/info de projeto
- negociacao: cliente pediu desconto, falou que tá caro, comparou com concorrente
- agendamento: cliente topou marcar visita ou reagendar
- fechamento: cliente confirmou fechamento, pediu dados de pagamento, NF
- off_topic: assunto fora de marcenaria
- reclamacao: cliente reclamando de algo já comprado
- humano: cliente pediu pra falar com pessoa`;

export async function classifyAndRoute(userMessage: string): Promise<Routed> {
  const r = await client.messages.create({
    model: HAIKU,
    max_tokens: 80,
    system: CLASSIFIER_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  const text = r.content[0].type === "text" ? r.content[0].text : "";
  let intent: Intent = "duvida_simples";
  let reason = "";

  try {
    const json = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? "{}");
    intent = json.intent ?? "duvida_simples";
    reason = json.reason ?? "";
  } catch {
    intent = "duvida_simples";
  }

  // Decisões comerciais → Sonnet. Resto → Haiku.
  const sonnetIntents: Intent[] = ["pedido_orcamento", "negociacao", "fechamento", "reclamacao"];
  const model = sonnetIntents.includes(intent) ? SONNET : HAIKU;

  return { intent, model, rationale: reason };
}
