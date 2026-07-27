/**
 * Sincronização baseada em DEALS (fonte real de atividade do funil no Clint).
 *
 * Muito mais confiável que sincronizar por updated_at do contato — cada deal
 * tem status oficial (OPEN/WON/LOST), vendedora atribuída, etapa do funil,
 * e valor. Também traz o contato inline (sem query extra).
 *
 * Fluxo:
 *   1. Pagina /v1/deals e filtra por updated_at no período pedido
 *   2. Pra cada deal: salva contato + chats + mensagens
 *   3. Salva o deal também (com status/won/lost) pra uso no panorama
 */

import { supabase } from "@/lib/db/client";
import {
  clintHabilitado,
  listarDealsPorPeriodo,
  listarChatsDoContato,
  listarMensagensDoChat,
} from "./client";

export interface SyncDealsResultado {
  fonte: "clint";
  deals_no_periodo: number;
  contatos: number;
  chats: number;
  mensagens: number;
  paginas_lidas: number;
  erros: string[];
  periodo: { desde: string; ate: string };
}

export async function sincronizarPorDeals(opts: {
  dataInicio: string;
  dataFim: string;
  maxPaginas?: number;
  maxDeals?: number;
}): Promise<SyncDealsResultado | { erro: string }> {
  if (!clintHabilitado()) return { erro: "CLINT_API_TOKEN não configurada" };

  const res = await listarDealsPorPeriodo({
    dataInicio: opts.dataInicio,
    dataFim: opts.dataFim,
    maxPaginas: opts.maxPaginas ?? 200,
  });
  if (!res.ok) return { erro: res.erro };

  let deals = res.deals;
  if (opts.maxDeals && deals.length > opts.maxDeals) {
    // Ordena por updated_at desc e pega os mais recentes
    deals = deals.sort((a, b) => {
      const ta = new Date(a.updated_at || a.updated_stage_at || a.created_at || 0).getTime();
      const tb = new Date(b.updated_at || b.updated_stage_at || b.created_at || 0).getTime();
      return tb - ta;
    }).slice(0, opts.maxDeals);
  }

  const erros: string[] = [];
  let totalContatos = 0, totalChats = 0, totalMensagens = 0;

  // Salva/atualiza contatos (do inline dos deals)
  const contatosMap = new Map<string, any>();
  for (const d of deals) {
    if (!d.contact?.id) continue;
    contatosMap.set(d.contact.id, {
      clint_id: d.contact.id,
      nome: d.contact.name ?? null,
      telefone: d.contact.ddi && d.contact.phone ? `${d.contact.ddi}${d.contact.phone}` : (d.contact.phone ?? null),
      email: d.contact.email ?? null,
      etapa_funil: d.stage ?? null,
      ultima_mensagem_em: d.updated_stage_at ?? d.updated_at ?? null,
      metadados: {
        deal_id: d.id, deal_status: d.status,
        won_at: d.won_at, lost_at: d.lost_at, value: d.value,
        vendedor_id: d.user?.id ?? null, stage: d.stage,
      },
      sincronizado_em: new Date().toISOString(),
    });
  }
  if (contatosMap.size > 0) {
    const r = await supabase.from("clint_contatos").upsert(Array.from(contatosMap.values()), { onConflict: "clint_id" });
    if (r.error) erros.push(`contatos: ${r.error.message}`);
    else totalContatos = contatosMap.size;
  }

  // Pra cada contato único, puxa chats e mensagens
  for (const contatoId of contatosMap.keys()) {
    const respChats = await listarChatsDoContato(contatoId);
    if (!respChats.ok) { erros.push(`chats ${contatoId}: ${respChats.erro}`); continue; }
    const chats = (respChats.data.data ?? []);
    if (chats.length > 0) {
      const linhasChats = chats.map((ch) => ({
        clint_id: ch.id,
        contato_clint_id: contatoId,
        canal: (ch as any).channel ?? (ch.channel_account_id ? "whatsapp" : null),
        status: ch.status ?? null,
        ultima_mensagem_em: ch.last_message_at ?? null,
        metadados: ch,
        sincronizado_em: new Date().toISOString(),
      }));
      const r = await supabase.from("clint_chats").upsert(linhasChats, { onConflict: "clint_id" });
      if (r.error) erros.push(`upsert chats: ${r.error.message}`);
      else totalChats += linhasChats.length;
    }
    for (const ch of chats) {
      const respMsgs = await listarMensagensDoChat(ch.id, { limit: 200 });
      if (!respMsgs.ok) { erros.push(`msgs ${ch.id}: ${respMsgs.erro}`); continue; }
      const msgs = (respMsgs.data.data ?? []);
      if (msgs.length === 0) continue;
      const linhasMsgs = msgs.map((m: any) => ({
        clint_id: m.id,
        chat_clint_id: ch.id,
        // Clint usa `type=CUSTOMER` pra cliente e `type=USER` (com source=CHAT ou API) pra vendedor/Mila
        direcao: m.type === "CUSTOMER" ? "entrada" : "saida",
        autor: m.user_id ?? null,
        conteudo: m.content ?? null,
        tipo: m.content_type ?? m.type ?? "text",
        midia_url: m.content_url ?? null,
        enviada_em: m.created_at ?? null,
        metadados: m,
        sincronizado_em: new Date().toISOString(),
      }));
      const r = await supabase.from("clint_mensagens").upsert(linhasMsgs, { onConflict: "clint_id" });
      if (r.error) erros.push(`upsert msgs: ${r.error.message}`);
      else totalMensagens += linhasMsgs.length;
    }
  }

  return {
    fonte: "clint",
    deals_no_periodo: deals.length,
    contatos: totalContatos,
    chats: totalChats,
    mensagens: totalMensagens,
    paginas_lidas: res.paginas_lidas,
    periodo: { desde: opts.dataInicio, ate: opts.dataFim },
    erros,
  };
}
