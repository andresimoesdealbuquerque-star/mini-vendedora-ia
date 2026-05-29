/**
 * Versão stateless do agente — pra testar a Mila localmente sem precisar
 * de Supabase nem de WhatsApp configurado.
 *
 * Histórico de mensagens é gerenciado pelo cliente (browser sessionStorage).
 * Tools que persistem (atualizar_lead, agendar_visita, passar_para_humano)
 * viram no-op que devolvem "ok" sem efeito colateral.
 */

import Anthropic from "@anthropic-ai/sdk";
import { buildSystemPromptComConhecimento } from "./system-prompt";
import { TOOL_DEFINITIONS } from "./tools";
import { classifyAndRoute, SONNET } from "./router";
import { calcularOrcamento } from "@/lib/pricing/tabela";
import { consultarPrazoProducao } from "@/lib/pricing/timeline";
import { calcularFrete } from "@/lib/pricing/frete";
import { avaliarDesconto } from "@/lib/pricing/discount";
import { obterMidia } from "@/lib/midia/midias";

const client = new Anthropic();
const MAX_TOOL_HOPS = 6;

export interface PlaygroundMessage {
  role: "user" | "assistant";
  content: string;
}

export interface PlaygroundTrace {
  tool: string;
  input: unknown;
  output: unknown;
}

export interface PlaygroundResult {
  reply: string;
  fragments: string[];
  trace: PlaygroundTrace[];
  tokens: { input: number; output: number; cache_read: number; cache_creation: number };
  routing: { model: string; intent: string };
}

export async function runPlayground(
  history: PlaygroundMessage[],
  newUserMessage: string,
): Promise<PlaygroundResult> {
  const messages: Anthropic.MessageParam[] = [
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: newUserMessage },
  ];

  const trace: PlaygroundTrace[] = [];
  const tokens = { input: 0, output: 0, cache_read: 0, cache_creation: 0 };
  const assistantTexts: string[] = [];

  // Carrega o system prompt + regras/exemplos aprendidos (cache 1 min)
  const SYSTEM_PROMPT = await buildSystemPromptComConhecimento();

  // Roteia por intent — Haiku pra mensagens simples, Sonnet pra decisões comerciais.
  const { model, intent } = await classifyAndRoute(newUserMessage);
  // Se a mensagem disparar tool (orçamento, desconto), forçamos Sonnet pra robustez.
  let modeloEmUso = model;

  for (let hop = 0; hop < MAX_TOOL_HOPS; hop++) {
    const response = await client.messages.create({
      model: modeloEmUso,
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
    tokens.cache_creation += (response.usage as any).cache_creation_input_tokens ?? 0;

    const toolUses: Anthropic.ToolUseBlock[] = [];
    for (const block of response.content) {
      if (block.type === "text" && block.text.trim()) assistantTexts.push(block.text);
      else if (block.type === "tool_use") toolUses.push(block);
    }

    if (response.stop_reason !== "tool_use" || toolUses.length === 0) break;

    messages.push({ role: "assistant", content: response.content });

    // Quando há tool use, eleva pra Sonnet nos próximos hops — modelo precisa
    // raciocinar sobre o resultado da tool (preço, desconto, etc).
    modeloEmUso = SONNET;

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const tu of toolUses) {
      const out = await runToolStateless(tu.name, tu.input as Record<string, unknown>);
      trace.push({ tool: tu.name, input: tu.input, output: out });
      toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(out) });
    }
    messages.push({ role: "user", content: toolResults });
  }

  const fullReply = assistantTexts.join("\n\n").trim();
  const fragments = splitFragments(fullReply);

  return { reply: fullReply, fragments, trace, tokens, routing: { model: modeloEmUso, intent } };
}

async function runToolStateless(name: string, input: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case "calcular_orcamento":
      return calcularOrcamento(input as unknown as Parameters<typeof calcularOrcamento>[0]);
    case "consultar_prazo_producao":
      return consultarPrazoProducao();
    case "calcular_frete":
      return calcularFrete(input as unknown as Parameters<typeof calcularFrete>[0]);
    case "avaliar_desconto":
      return avaliarDesconto(input as unknown as Parameters<typeof avaliarDesconto>[0]);
    case "atualizar_lead":
      return { ok: true, _stub: "playground — não persiste" };
    case "agendar_visita":
      return { ok: true, id: "stub-" + Date.now(), _stub: "playground — não agenda de verdade" };
    case "registrar_pedido": {
      const i = input as Record<string, unknown>;
      const isPix = i.forma_pagamento === "pix_avista";
      const total = Number(i.valor_total ?? 0);
      const sinal = isPix ? Math.round(total / 2) : null;
      const saldo = isPix ? total - (sinal ?? 0) : null;
      return {
        ok: true,
        id: "stub-pedido-" + Date.now(),
        sinal: sinal ?? undefined,
        saldo: saldo ?? undefined,
        instrucao_pagamento: isPix
          ? `Pra fechar à vista (50% sinal + 50% entrega):\n\nSinal hoje: R$ ${sinal!.toLocaleString("pt-BR")}\nSaldo na entrega: R$ ${saldo!.toLocaleString("pt-BR")}\n\nChave PIX (Mini Marcenaria):\n83999921504\n\nMe manda o comprovante quando fizer.`
          : `Te passo o link de pagamento da Rede pra parcelar em 12x sem juros. A equipe vai gerar e enviar pra você em alguns minutos.`,
        _stub: "playground — não persiste e não notifica equipe",
      };
    }
    case "enviar_midia":
      return obterMidia((input as { midia_id: any }).midia_id);
    case "passar_para_humano":
      return { ok: true, aviso_para_cliente: "diga ao cliente que vai passar pra atendente humana", _stub: "playground" };
    default:
      return { erro: `Tool desconhecida: ${name}` };
  }
}

function splitFragments(text: string): string[] {
  const parts = text.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);
  return parts.length ? parts : [text];
}
