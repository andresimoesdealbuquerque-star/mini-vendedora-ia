/**
 * Gerador de resposta da Mila pra atendimento ao vivo.
 *
 * Usa o mesmo system prompt do playground, mas com detecção de intenção
 * pra decidir se precisa autorização humana (fechamento, desconto).
 */

import Anthropic from "@anthropic-ai/sdk";
import { buildSystemPromptComConhecimento } from "@/lib/ai/system-prompt";
import { TOOL_DEFINITIONS, executeTool } from "@/lib/ai/tools";
import type { ChatComContexto, MilaAcao } from "./tipos";

const client = new Anthropic();
const SONNET = "claude-sonnet-4-6";
const MAX_TOOL_HOPS = 6;

// Palavras-chave que escalam pra humano imediatamente
const PALAVRAS_ESCALA = [
  "processo", "advogado", "reclamação", "reclamacao", "procon",
  "reembolso", "quero cancelar", "cancelar pedido", "não vou pagar", "nao vou pagar",
  "vou processar", "estou muito insatisfeito", "revoltado", "absurdo",
  "golpe", "enganad", "furad", "roubad", "pilantra",
];

// Detecta se cliente xingou/reclamou forte
function detectarReclamacaoForte(msg: string): string | null {
  const m = msg.toLowerCase();
  for (const p of PALAVRAS_ESCALA) {
    if (m.includes(p)) return `palavra-chave: "${p}"`;
  }
  // Detecta xingamento comum (superficial)
  const xingamentos = /\b(idiota|imbecil|merda|porra|caralho|bosta|puta que pariu)\b/i;
  if (xingamentos.test(msg)) return "xingamento detectado";
  return null;
}

// Detecta se Mila propôs fechamento (ela usou tool registrar_pedido ou tá coletando dados)
function detectarPropostaFechamento(trace: Array<{ tool: string; input: unknown }>, texto: string): boolean {
  if (trace.some((t) => t.tool === "registrar_pedido")) return true;
  // Frases fortes de fechamento na resposta
  const p = texto.toLowerCase();
  return /pedido fechado|vou registrar seu pedido|sinal.*pix|chave pix.*mini|fechei aqui/i.test(p);
}

// Detecta se Mila propôs desconto acima do padrão (>8%)
function detectarDescontoAlem(trace: Array<{ tool: string; input: unknown; output: unknown }>): { proposto: number; valor?: number } | null {
  const d = trace.find((t) => t.tool === "avaliar_desconto");
  if (!d) return null;
  const input = d.input as any;
  const output = d.output as any;
  const percentualPedido = input.valor_orcado
    ? (Number(input.desconto_pedido_reais || 0) / Number(input.valor_orcado)) * 100
    : 0;
  if (percentualPedido > 8) {
    return { proposto: Math.round(percentualPedido * 10) / 10, valor: input.valor_orcado };
  }
  return null;
}

export interface RespostaMila {
  texto: string;
  fragments: string[];
  trace: Array<{ tool: string; input: unknown; output: unknown }>;
  imagens_a_enviar: Array<{ url: string; caption?: string }>;
  intent_detectado: {
    fechamento: boolean;
    desconto_alem_padrao: null | { pct: number; valor?: number };
    reclamacao: string | null;
  };
  tokens: { input: number; output: number; cache_read: number };
}

/** Extrai as imagens do catálogo que a Mila pediu pra enviar (uso da tool mostrar_catalogo). */
function extrairImagensCatalogo(trace: Array<{ tool: string; input: unknown; output: unknown }>): Array<{ url: string; caption?: string }> {
  const imgs: Array<{ url: string; caption?: string }> = [];
  for (const t of trace) {
    if (t.tool !== "mostrar_catalogo") continue;
    const out = t.output as any;
    if (!out?.enviadas) continue;
    for (const p of out.enviadas as Array<{ url: string; rotulo: string }>) {
      if (p?.url) imgs.push({ url: p.url, caption: p.rotulo });
    }
  }
  return imgs;
}

export async function gerarRespostaMila(ctx: ChatComContexto): Promise<RespostaMila | { erro: string }> {
  // 1. Detecção rápida de escalonamento (antes de gastar tokens)
  const reclamacao = detectarReclamacaoForte(ctx.ultima_msg_cliente);

  // 2. Monta conversation history no formato Claude, com IMAGENS quando houver
  // Só cliente pode enviar imagens (assistant messages sempre text)
  const messages: Anthropic.MessageParam[] = ctx.historico.map((m) => {
    if (m.direcao === "entrada" && m.tipo === "IMAGE" && m.midia_url) {
      return {
        role: "user" as const,
        content: [
          {
            type: "image" as const,
            source: { type: "url" as const, url: m.midia_url },
          },
          { type: "text" as const, text: m.conteudo || "(imagem enviada pelo cliente)" },
        ] as any,
      };
    }
    return {
      role: m.direcao === "entrada" ? "user" as const : "assistant" as const,
      content: m.conteudo,
    };
  });

  const trace: Array<{ tool: string; input: unknown; output: unknown }> = [];
  const tokens = { input: 0, output: 0, cache_read: 0 };
  const assistantTexts: string[] = [];

  try {
    const SYSTEM_PROMPT = await buildSystemPromptComConhecimento();

    for (let hop = 0; hop < MAX_TOOL_HOPS; hop++) {
      const response = await client.messages.create({
        model: SONNET,
        max_tokens: 800,
        system: [
          { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral", ttl: "1h" } },
        ] as unknown as string,
        tools: TOOL_DEFINITIONS,
        messages,
      });
      tokens.input += response.usage.input_tokens;
      tokens.output += response.usage.output_tokens;
      tokens.cache_read += (response.usage as any).cache_read_input_tokens ?? 0;

      const toolUses: Anthropic.ToolUseBlock[] = [];
      const textsHop: string[] = [];
      for (const block of response.content) {
        if (block.type === "text" && block.text.trim()) textsHop.push(block.text);
        else if (block.type === "tool_use") toolUses.push(block);
      }

      // FIX: só o texto do ÚLTIMO hop (após todas as tools) vai pro cliente.
      // Antes acumulava e concatenava, gerando duplicação/desconexão.
      if (response.stop_reason !== "tool_use" || toolUses.length === 0) {
        assistantTexts.length = 0;
        assistantTexts.push(...textsHop);
        break;
      }

      messages.push({ role: "assistant", content: response.content });
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const tu of toolUses) {
        // NÃO EXECUTAR registrar_pedido em modo live — precisa autorização
        // Mas retornar mock pra Mila poder raciocinar
        let out: unknown;
        if (tu.name === "registrar_pedido") {
          out = { ok: true, id: "PENDENTE_AUTORIZACAO", instrucao_pagamento: "aguardando autorização do dono" };
        } else {
          out = await executeTool(tu.name, tu.input as Record<string, unknown>, ctx.contact_id);
        }
        trace.push({ tool: tu.name, input: tu.input, output: out });
        toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(out) });
      }
      messages.push({ role: "user", content: toolResults });
    }

    const texto = assistantTexts.join("\n\n").trim();
    const fragments = texto.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);

    return {
      texto,
      fragments: fragments.length ? fragments : [texto],
      trace,
      imagens_a_enviar: extrairImagensCatalogo(trace),
      intent_detectado: {
        fechamento: detectarPropostaFechamento(trace, texto),
        desconto_alem_padrao: (() => {
          const d = detectarDescontoAlem(trace);
          return d ? { pct: d.proposto, valor: d.valor } : null;
        })(),
        reclamacao,
      },
      tokens,
    };
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "erro" };
  }
}
