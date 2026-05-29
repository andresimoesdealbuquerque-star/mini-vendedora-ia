import { supabase } from "./client";
import { sendText } from "@/lib/whatsapp/meta";

export interface Lead {
  id: string;
  phone: string;
  nome?: string | null;
  modelo_interesse?: string | null;
  cor_preferida?: string | null;
  faixa_orcamento?: string | null;
  prazo_desejado?: string | null;
  regiao?: string | null;
  origem?: string | null;
  etapa?: string | null;
  observacoes?: string | null;
  handed_off_at?: string | null;
  handed_back_at?: string | null;
  last_message_at?: string | null;
  created_at?: string;
}

export interface MessageRow {
  role: "user" | "assistant";
  content: string;
  message_id?: string;
}

export async function getLeadByPhone(phone: string): Promise<Lead | null> {
  const { data } = await supabase.from("leads").select("*").eq("phone", phone).maybeSingle();
  return data ?? null;
}

export async function upsertLead(patch: Partial<Lead> & { phone: string }): Promise<Lead> {
  const { data, error } = await supabase
    .from("leads")
    .upsert({ ...patch, last_message_at: new Date().toISOString() }, { onConflict: "phone" })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function appendMessage(leadId: string, msg: MessageRow): Promise<void> {
  // dedup por message_id (idempotência do webhook)
  if (msg.message_id) {
    const { data: existing } = await supabase
      .from("messages")
      .select("id")
      .eq("message_id", msg.message_id)
      .maybeSingle();
    if (existing) return;
  }
  await supabase.from("messages").insert({ lead_id: leadId, ...msg });
  await supabase
    .from("leads")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", leadId);
}

export async function getRecentMessages(leadId: string, limit = 30): Promise<MessageRow[]> {
  const { data } = await supabase
    .from("messages")
    .select("role,content")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []).reverse() as MessageRow[];
}

export async function atualizarLead(leadId: string, patch: Record<string, unknown>): Promise<{ ok: true }> {
  const allowed = [
    "nome", "modelo_interesse", "cor_preferida",
    "faixa_orcamento", "prazo_desejado", "regiao", "origem", "etapa", "observacoes",
  ];
  const clean: Record<string, unknown> = {};
  for (const k of allowed) if (patch[k] !== undefined) clean[k] = patch[k];
  if (Object.keys(clean).length === 0) return { ok: true };
  await supabase.from("leads").update(clean).eq("id", leadId);
  return { ok: true };
}

export async function agendarVisita(
  leadId: string,
  input: { nome_cliente: string; endereco: string; data_sugerida: string; periodo: string; observacoes?: string },
): Promise<{ ok: true; id: string }> {
  const { data } = await supabase
    .from("visitas")
    .insert({
      lead_id: leadId,
      endereco: input.endereco,
      data: input.data_sugerida,
      periodo: input.periodo,
      observacoes: input.observacoes,
    })
    .select()
    .single();

  await supabase.from("leads").update({ etapa: "agendamento" }).eq("id", leadId);

  // Notifica o dono da agenda nova
  if (process.env.OWNER_PHONE) {
    await sendText(
      process.env.OWNER_PHONE,
      `📅 Visita agendada\n${input.nome_cliente}\n${input.endereco}\n${input.data_sugerida} ${input.periodo}`,
    ).catch(() => {});
  }

  return { ok: true, id: data!.id };
}

export interface PedidoInput {
  nome_completo: string;
  telefone: string;
  email?: string;
  tipo_documento: "CPF" | "CNPJ";
  documento: string;
  endereco_rua: string;
  endereco_numero: string;
  endereco_complemento?: string;
  endereco_bairro: string;
  endereco_cidade: string;
  endereco_uf?: string;
  endereco_cep?: string;
  moveis: Array<{
    modelo: string; cor: string; medida?: string;
    puxador?: string; adicionais?: string[]; valor: number;
  }>;
  forma_pagamento: "pix_avista" | "cartao_12x";
  valor_total: number;
  observacoes?: string;
}

export async function registrarPedido(
  leadId: string,
  input: PedidoInput,
): Promise<{ ok: true; id: string; sinal?: number; saldo?: number; instrucao_pagamento: string }> {
  const isPix = input.forma_pagamento === "pix_avista";
  const sinal = isPix ? Math.round(input.valor_total / 2) : null;
  const saldo = isPix ? input.valor_total - (sinal ?? 0) : null;

  const { data, error } = await supabase
    .from("pedidos_pendentes")
    .insert({
      lead_id: leadId,
      ...input,
      valor_sinal: sinal,
      valor_saldo: saldo,
    })
    .select()
    .single();
  if (error) throw error;

  await supabase.from("leads").update({ etapa: "fechado" }).eq("id", leadId);

  // Notifica equipe humana
  const numbers = (process.env.HUMAN_HANDOFF_NUMBERS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const moveisLista = input.moveis.map((m) =>
    `• ${m.modelo} ${m.cor}${m.medida ? ` (${m.medida})` : ""} — R$ ${m.valor.toLocaleString("pt-BR")}`,
  ).join("\n");

  const resumo = [
    `📋 PEDIDO PRA CADASTRAR NO MINIDECK`,
    ``,
    `👤 ${input.nome_completo}`,
    `📞 ${input.telefone}`,
    input.email && `📧 ${input.email}`,
    `${input.tipo_documento}: ${input.documento}`,
    ``,
    `📍 Endereço:`,
    `${input.endereco_rua}, ${input.endereco_numero}${input.endereco_complemento ? ` - ${input.endereco_complemento}` : ""}`,
    `${input.endereco_bairro}, ${input.endereco_cidade}${input.endereco_uf ? ` - ${input.endereco_uf}` : ""}`,
    input.endereco_cep && `CEP ${input.endereco_cep}`,
    ``,
    `🛋️ Móveis:`,
    moveisLista,
    ``,
    `💰 Total: R$ ${input.valor_total.toLocaleString("pt-BR")}`,
    `💳 ${isPix ? `PIX 50/50 — sinal R$ ${sinal!.toLocaleString("pt-BR")} + saldo R$ ${saldo!.toLocaleString("pt-BR")}` : "Cartão 12x sem juros (Rede)"}`,
    input.observacoes && `\n📝 ${input.observacoes}`,
  ].filter(Boolean).join("\n");

  for (const phone of numbers) {
    await sendText(phone, resumo).catch(() => {});
  }

  const instrucaoPagamento = isPix
    ? `PIX 50/50.\nSinal hoje: R$ ${sinal!.toLocaleString("pt-BR")}\nSaldo na entrega: R$ ${saldo!.toLocaleString("pt-BR")}\n\nMila: agora chame enviar_midia('pix_pagamento') pra mandar a arte com a chave PIX, depois confirme pedindo o comprovante.`
    : `Cartão 12x sem juros via Rede.\nMila: avise o cliente que a equipe vai gerar e enviar o link de pagamento em alguns minutos.`;

  return {
    ok: true,
    id: data!.id,
    sinal: sinal ?? undefined,
    saldo: saldo ?? undefined,
    instrucao_pagamento: instrucaoPagamento,
  };
}

export async function passarParaHumano(
  leadId: string,
  input: { motivo: string; urgencia: string; resumo: string },
): Promise<{ ok: true; aviso_para_cliente: string }> {
  await supabase.from("handoffs").insert({
    lead_id: leadId,
    motivo: input.motivo,
    urgencia: input.urgencia,
    resumo: input.resumo,
  });

  await supabase
    .from("leads")
    .update({ handed_off_at: new Date().toISOString(), handed_back_at: null })
    .eq("id", leadId);

  // Notifica humano(s)
  const numbers = (process.env.HUMAN_HANDOFF_NUMBERS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const lead = (await supabase.from("leads").select("nome,phone").eq("id", leadId).single()).data;

  for (const phone of numbers) {
    await sendText(
      phone,
      `🔔 Lead pra você\n${lead?.nome ?? "(sem nome)"} — ${lead?.phone}\nUrgência: ${input.urgencia}\nMotivo: ${input.motivo}\n\nResumo:\n${input.resumo}`,
    ).catch(() => {});
  }

  return {
    ok: true,
    aviso_para_cliente: "diga ao cliente que vai passar pra uma consultora humana e ela já entra em contato",
  };
}
