/**
 * Loop principal do agente. Recebe mensagem, classifica, chama Claude com tools,
 * executa as tools, devolve resposta(s) pro WhatsApp.
 *
 * Otimizado pra custo:
 * - System prompt grande cacheado (cache_control 1h ephemeral)
 * - Histórico recente cacheado também (até 20 turnos)
 * - Roteamento Haiku/Sonnet via classifier barato
 */

import Anthropic from "@anthropic-ai/sdk";
import { buildSystemPromptComConhecimento } from "./system-prompt";
import { TOOL_DEFINITIONS, executeTool } from "./tools";
import { classifyAndRoute, HAIKU } from "./router";
import { getLeadByPhone, appendMessage, getRecentMessages, upsertLead } from "@/lib/db/leads";
import { sendHumanizedReply } from "@/lib/whatsapp/humanize";

const client = new Anthropic();
const MAX_HISTORY = 30;
const MAX_TOOL_HOPS = 6;

export async function handleIncomingMessage(opts: {
  fromPhone: string;
  text: string;
  messageId: string;
}): Promise<void> {
  const { fromPhone, text, messageId } = opts;

  let lead = await getLeadByPhone(fromPhone);
  if (!lead) {
    lead = await upsertLead({ phone: fromPhone, etapa: "aquecimento" });
  }

  // Se já passou pra humano, IA fica em silêncio.
  if (lead.handed_off_at && !lead.handed_back_at) {
    return;
  }

  await appendMessage(lead.id, { role: "user", content: text, message_id: messageId });

  const history = await getRecentMessages(lead.id, MAX_HISTORY);
  const { model, intent } = await classifyAndRoute(text);
  const SYSTEM_PROMPT = await buildSystemPromptComConhecimento();

  // Monta mensagens pra Claude. System fica fora (em system param).
  const claudeMessages: Anthropic.MessageParam[] = history.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  // Loop de tool use.
  let hops = 0;
  let assistantTexts: string[] = [];

  while (hops < MAX_TOOL_HOPS) {
    hops++;

    const response = await client.messages.create({
      model,
      max_tokens: 800,
      // system com cache: a parte estática é cacheada por 1h
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral", ttl: "1h" },
        },
        {
          type: "text",
          text: `\n\n# Contexto do lead (atualize via tool atualizar_lead se mudar)\n${formatLeadContext(lead)}\n\n# Intent classificado deste turno: ${intent}`,
        },
      ] as unknown as string,
      tools: TOOL_DEFINITIONS,
      messages: claudeMessages,
    });

    // Coleta texto e tool calls.
    const toolUses: Anthropic.ToolUseBlock[] = [];
    for (const block of response.content) {
      if (block.type === "text" && block.text.trim()) {
        assistantTexts.push(block.text);
      } else if (block.type === "tool_use") {
        toolUses.push(block);
      }
    }

    if (response.stop_reason !== "tool_use" || toolUses.length === 0) {
      break;
    }

    // Adiciona o turno do assistant (com tool_use) na história.
    claudeMessages.push({ role: "assistant", content: response.content });

    // Executa as tools e adiciona resultados.
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const tu of toolUses) {
      const result = await executeTool(tu.name, tu.input as Record<string, unknown>, lead.id);
      toolResults.push({
        type: "tool_result",
        tool_use_id: tu.id,
        content: JSON.stringify(result),
      });
    }
    claudeMessages.push({ role: "user", content: toolResults });
  }

  const fullReply = assistantTexts.join("\n\n").trim();
  if (!fullReply) return;

  await appendMessage(lead.id, { role: "assistant", content: fullReply });
  await sendHumanizedReply(fromPhone, fullReply);
}

function formatLeadContext(lead: {
  nome?: string | null;
  modelo_interesse?: string | null;
  cor_preferida?: string | null;
  faixa_orcamento?: string | null;
  prazo_desejado?: string | null;
  regiao?: string | null;
  origem?: string | null;
  etapa?: string | null;
  observacoes?: string | null;
}): string {
  const lines = [
    lead.nome && `Nome: ${lead.nome}`,
    lead.modelo_interesse && `Modelo de interesse: ${lead.modelo_interesse}`,
    lead.cor_preferida && `Cor preferida: ${lead.cor_preferida}`,
    lead.faixa_orcamento && `Faixa: ${lead.faixa_orcamento}`,
    lead.prazo_desejado && `Prazo: ${lead.prazo_desejado}`,
    lead.regiao && `Região: ${lead.regiao}`,
    lead.origem && `Origem: ${lead.origem}`,
    lead.etapa && `Etapa: ${lead.etapa}`,
    lead.observacoes && `Notas: ${lead.observacoes}`,
  ].filter(Boolean);

  return lines.length ? lines.join("\n") : "(lead novo, sem info ainda)";
}
