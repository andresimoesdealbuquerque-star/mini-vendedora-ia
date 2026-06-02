/**
 * Sincronização Clint → Supabase. Puxa contatos com atividade nos últimos N dias,
 * pra cada contato puxa chats, pra cada chat puxa mensagens, e salva tudo no
 * cache local. Idempotente (upsert por id).
 *
 * Quando o token Clint não estiver configurado, popula com dados de exemplo
 * (modo `mock`) pra você testar a UI/análise antes do plano Elite estar ativo.
 */

import { supabase } from "@/lib/db/client";
import {
  clintHabilitado,
  listarContatos,
  listarChatsDoContato,
  listarMensagensDoChat,
} from "./client";

const DEFAULT_DIAS = 90;

export interface SyncResultado {
  fonte: "clint" | "mock";
  contatos: number;
  chats: number;
  mensagens: number;
  erros: string[];
}

export async function sincronizarUltimos90Dias(opts: { dias?: number } = {}): Promise<SyncResultado> {
  const dias = opts.dias ?? DEFAULT_DIAS;

  if (!clintHabilitado()) {
    return popularMockData();
  }

  const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);
  const erros: string[] = [];
  let totalContatos = 0;
  let totalChats = 0;
  let totalMensagens = 0;

  // 1. Contatos
  const respC = await listarContatos({ desde, limite: 200 });
  if (!respC.ok) {
    return { fonte: "clint", contatos: 0, chats: 0, mensagens: 0, erros: [respC.erro] };
  }
  const contatos = respC.data.data ?? [];
  if (contatos.length > 0) {
    const linhas = contatos.map((c) => ({
      clint_id: c.id,
      nome: c.name ?? null,
      telefone: c.phone ?? null,
      email: c.email ?? null,
      etapa_funil: c.funnel_stage ?? null,
      ultima_mensagem_em: c.last_message_at ?? null,
      metadados: c,
      sincronizado_em: new Date().toISOString(),
    }));
    const r = await supabase.from("clint_contatos").upsert(linhas, { onConflict: "clint_id" });
    if (r.error) erros.push(`contatos: ${r.error.message}`);
    else totalContatos = linhas.length;
  }

  // 2. Pra cada contato, chats e mensagens
  for (const c of contatos) {
    const respChats = await listarChatsDoContato(c.id);
    if (!respChats.ok) { erros.push(`chats ${c.id}: ${respChats.erro}`); continue; }
    const chats = respChats.data.data ?? [];

    if (chats.length > 0) {
      const linhasChats = chats.map((ch) => ({
        clint_id: ch.id,
        contato_clint_id: c.id,
        canal: ch.channel ?? null,
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
      const respMsgs = await listarMensagensDoChat(ch.id, { limite: 200 });
      if (!respMsgs.ok) { erros.push(`msgs ${ch.id}: ${respMsgs.erro}`); continue; }
      const msgs = respMsgs.data.data ?? [];
      if (msgs.length === 0) continue;
      const linhasMsgs = msgs.map((m) => ({
        clint_id: m.id,
        chat_clint_id: ch.id,
        direcao: m.direction === "inbound" ? "entrada" : "saida",
        autor: m.author?.name ?? null,
        conteudo: m.content ?? null,
        tipo: m.type ?? "text",
        midia_url: m.media_url ?? null,
        enviada_em: m.sent_at ?? null,
        metadados: m,
        sincronizado_em: new Date().toISOString(),
      }));
      const r = await supabase.from("clint_mensagens").upsert(linhasMsgs, { onConflict: "clint_id" });
      if (r.error) erros.push(`upsert msgs: ${r.error.message}`);
      else totalMensagens += linhasMsgs.length;
    }
  }

  return { fonte: "clint", contatos: totalContatos, chats: totalChats, mensagens: totalMensagens, erros };
}

// ── Mock data — usado quando CLINT_API_TOKEN não está configurada ────────

async function popularMockData(): Promise<SyncResultado> {
  const agora = Date.now();
  const dias = (n: number) => new Date(agora - n * 86_400_000).toISOString();

  const contatos = [
    {
      clint_id: "mock-c1", nome: "Carla Mendes", telefone: "5583999991111",
      email: "carla@email.com", etapa_funil: "orçamento",
      ultima_mensagem_em: dias(28), metadados: {}, sincronizado_em: new Date().toISOString(),
    },
    {
      clint_id: "mock-c2", nome: "Roberto Lima", telefone: "5583999992222",
      email: null, etapa_funil: "qualificação",
      ultima_mensagem_em: dias(45), metadados: {}, sincronizado_em: new Date().toISOString(),
    },
    {
      clint_id: "mock-c3", nome: "Ana Beatriz", telefone: "5583999993333",
      email: "ana@email.com", etapa_funil: "negociação",
      ultima_mensagem_em: dias(12), metadados: {}, sincronizado_em: new Date().toISOString(),
    },
  ];

  const chats = [
    { clint_id: "mock-chat-1", contato_clint_id: "mock-c1", canal: "whatsapp", status: "ativo", ultima_mensagem_em: dias(28), metadados: {}, sincronizado_em: new Date().toISOString() },
    { clint_id: "mock-chat-2", contato_clint_id: "mock-c2", canal: "whatsapp", status: "ativo", ultima_mensagem_em: dias(45), metadados: {}, sincronizado_em: new Date().toISOString() },
    { clint_id: "mock-chat-3", contato_clint_id: "mock-c3", canal: "whatsapp", status: "ativo", ultima_mensagem_em: dias(12), metadados: {}, sincronizado_em: new Date().toISOString() },
  ];

  const mensagens = [
    // Carla — orçamento que travou em desconto
    { clint_id: "mock-m-c1-1", chat_clint_id: "mock-chat-1", direcao: "entrada", autor: "Carla", conteudo: "oi, vi vocês no insta. Queria um orçamento de cômoda 4 gavetas", tipo: "text", midia_url: null, enviada_em: dias(30), metadados: {}, sincronizado_em: new Date().toISOString() },
    { clint_id: "mock-m-c1-2", chat_clint_id: "mock-chat-1", direcao: "saida", autor: "Marina", conteudo: "Oi Carla! Que bom. Vou te passar o orçamento. Pra que cor você tá pensando?", tipo: "text", midia_url: null, enviada_em: dias(30), metadados: {}, sincronizado_em: new Date().toISOString() },
    { clint_id: "mock-m-c1-3", chat_clint_id: "mock-chat-1", direcao: "entrada", autor: "Carla", conteudo: "preto. Medidas 80x40x90", tipo: "text", midia_url: null, enviada_em: dias(30), metadados: {}, sincronizado_em: new Date().toISOString() },
    { clint_id: "mock-m-c1-4", chat_clint_id: "mock-chat-1", direcao: "saida", autor: "Marina", conteudo: "Fica R$ 2.339,90 na cor preto", tipo: "text", midia_url: null, enviada_em: dias(29), metadados: {}, sincronizado_em: new Date().toISOString() },
    { clint_id: "mock-m-c1-5", chat_clint_id: "mock-chat-1", direcao: "entrada", autor: "Carla", conteudo: "ufa caro. Não dá desconto?", tipo: "text", midia_url: null, enviada_em: dias(29), metadados: {}, sincronizado_em: new Date().toISOString() },
    { clint_id: "mock-m-c1-6", chat_clint_id: "mock-chat-1", direcao: "saida", autor: "Marina", conteudo: "deixa eu verificar com o gerente e te volto", tipo: "text", midia_url: null, enviada_em: dias(28), metadados: {}, sincronizado_em: new Date().toISOString() },

    // Roberto — qualificação que esfriou
    { clint_id: "mock-m-c2-1", chat_clint_id: "mock-chat-2", direcao: "entrada", autor: "Roberto", conteudo: "boa tarde, vcs tem rack pra TV?", tipo: "text", midia_url: null, enviada_em: dias(47), metadados: {}, sincronizado_em: new Date().toISOString() },
    { clint_id: "mock-m-c2-2", chat_clint_id: "mock-chat-2", direcao: "saida", autor: "Marina", conteudo: "Boa tarde. Sim, temos rack 2, 3 e 4 portas. Qual o tamanho da TV?", tipo: "text", midia_url: null, enviada_em: dias(46), metadados: {}, sincronizado_em: new Date().toISOString() },
    { clint_id: "mock-m-c2-3", chat_clint_id: "mock-chat-2", direcao: "entrada", autor: "Roberto", conteudo: "55 polegadas", tipo: "text", midia_url: null, enviada_em: dias(45), metadados: {}, sincronizado_em: new Date().toISOString() },

    // Ana — negociação ativa, recente
    { clint_id: "mock-m-c3-1", chat_clint_id: "mock-chat-3", direcao: "entrada", autor: "Ana", conteudo: "oi, fechar a estante 7 espaços 150x40x180 madeirado", tipo: "text", midia_url: null, enviada_em: dias(15), metadados: {}, sincronizado_em: new Date().toISOString() },
    { clint_id: "mock-m-c3-2", chat_clint_id: "mock-chat-3", direcao: "saida", autor: "Marina", conteudo: "Show Ana! Fica R$ 1.539,90.", tipo: "text", midia_url: null, enviada_em: dias(14), metadados: {}, sincronizado_em: new Date().toISOString() },
    { clint_id: "mock-m-c3-3", chat_clint_id: "mock-chat-3", direcao: "entrada", autor: "Ana", conteudo: "no cartão dá em quantas vezes?", tipo: "text", midia_url: null, enviada_em: dias(13), metadados: {}, sincronizado_em: new Date().toISOString() },
    { clint_id: "mock-m-c3-4", chat_clint_id: "mock-chat-3", direcao: "saida", autor: "Marina", conteudo: "12x sem juros no cartão", tipo: "text", midia_url: null, enviada_em: dias(12), metadados: {}, sincronizado_em: new Date().toISOString() },
  ];

  const erros: string[] = [];
  const r1 = await supabase.from("clint_contatos").upsert(contatos, { onConflict: "clint_id" });
  if (r1.error) erros.push(`clint_contatos: ${r1.error.message}`);
  const r2 = await supabase.from("clint_chats").upsert(chats, { onConflict: "clint_id" });
  if (r2.error) erros.push(`clint_chats: ${r2.error.message}`);
  const r3 = await supabase.from("clint_mensagens").upsert(mensagens, { onConflict: "clint_id" });
  if (r3.error) erros.push(`clint_mensagens: ${r3.error.message}`);

  return { fonte: "mock", contatos: contatos.length, chats: chats.length, mensagens: mensagens.length, erros };
}
