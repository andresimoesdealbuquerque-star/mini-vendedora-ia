/**
 * Detector de mensagens novas de clientes fora do horário humano.
 *
 * Estratégia (sem webhook do Clint):
 *   1. Lista chats OPEN dos usuários (não vou puxar 39k contatos)
 *      — usa cache local (clint_chats) ordenado por last_message_at
 *      — puxa msg mais recentes via API pra pegar o que chegou desde último check
 *   2. Compara last_message_at do chat com estado local (mila_chat_estado)
 *   3. Se mudou E última msg foi de cliente (não user_id) E não é EVENT → responde
 */

import { supabase } from "@/lib/db/client";
import { listarChatsDoContato, listarMensagensDoChat } from "@/lib/clint/client";
import type { ChatComContexto } from "./tipos";

const CANAL_OFICIAL = "26eb4825-f226-4ec3-94bc-d91f468e9510"; // ZAP MINI 26

export interface MsgNovaResultado {
  chats_verificados: number;
  msgs_novas: ChatComContexto[];
  erros: string[];
}

/**
 * Detecta chats com mensagem NOVA de cliente que ainda não foi processada
 * pela Mila. Retorna contexto pronto pra o gerador de resposta.
 */
export async function detectarMensagensNovas(opts: {
  maxChats?: number;    // limita quantos chats verificar por rodada
} = {}): Promise<MsgNovaResultado> {
  const maxChats = opts.maxChats ?? 50;
  const erros: string[] = [];

  // 1. Pega chats OPEN cacheados no canal oficial, ordenados por atividade recente
  const chatsQ = await supabase
    .from("clint_chats")
    .select("clint_id, contato_clint_id, ultima_mensagem_em, metadados")
    .eq("status", "OPEN")
    .order("ultima_mensagem_em", { ascending: false })
    .limit(maxChats);
  if (chatsQ.error) return { chats_verificados: 0, msgs_novas: [], erros: [chatsQ.error.message] };

  const chats = (chatsQ.data ?? []).filter(
    (c) => (c.metadados as any)?.channel_account_id === CANAL_OFICIAL,
  );

  // 2. Pega estado local de cada chat (última msg processada)
  const chatIds = chats.map((c) => c.clint_id);
  const estadosQ = chatIds.length
    ? await supabase.from("mila_chat_estado").select("*").in("chat_clint_id", chatIds)
    : { data: [] as any[] };
  const estadoMap = new Map<string, any>();
  for (const e of estadosQ.data ?? []) estadoMap.set(e.chat_clint_id, e);

  const msgsNovas: ChatComContexto[] = [];

  for (const chat of chats) {
    const estado = estadoMap.get(chat.clint_id);
    if (estado?.aguardando_autorizacao_id) continue; // já está aguardando você

    // Puxa mensagens frescas do chat via API (garantir dados atuais)
    const respMsgs = await listarMensagensDoChat(chat.clint_id, { limit: 30 });
    if (!respMsgs.ok) { erros.push(`msgs ${chat.clint_id}: ${respMsgs.erro}`); continue; }
    const msgs = (respMsgs.data.data ?? []).slice().sort((a, b) => {
      const ta = new Date(a.created_at || 0).getTime();
      const tb = new Date(b.created_at || 0).getTime();
      return ta - tb; // ordem cronológica
    });

    if (msgs.length === 0) continue;

    const ultima = msgs[msgs.length - 1] as any;
    // Só responde se a ÚLTIMA mensagem foi do CLIENTE.
    // Clint marca: type=CUSTOMER → cliente | type=USER → vendedor/Mila/API
    // source=API → foi enviado por integração (a própria Mila)
    if (ultima.type !== "CUSTOMER") continue;
    if (ultima.source === "API") continue;   // dupla proteção contra loop
    // Ignora eventos e mensagens sem texto
    if (ultima.type === "EVENT" || !ultima.content?.trim()) continue;
    // Ignora se já processamos essa mensagem
    if (estado?.ultima_msg_processada_id === ultima.id) continue;

    // Monta contexto pra gerador
    const contatoQ = await supabase
      .from("clint_contatos")
      .select("nome, telefone")
      .eq("clint_id", chat.contato_clint_id)
      .maybeSingle();

    msgsNovas.push({
      chat_id: chat.clint_id,
      contact_id: chat.contato_clint_id,
      channel_account_id: CANAL_OFICIAL,
      contato_nome: contatoQ.data?.nome ?? null,
      contato_telefone: contatoQ.data?.telefone ?? null,
      ultima_msg_cliente_id: ultima.id,
      ultima_msg_cliente: ultima.content,
      ultima_msg_cliente_em: ultima.created_at ?? new Date().toISOString(),
      historico: msgs.slice(-20).map((m: any) => ({
        // type=CUSTOMER = cliente (entrada); qualquer outro (USER, SYSTEM) = saída
        direcao: (m.type === "CUSTOMER") ? "entrada" as const : "saida" as const,
        conteudo: m.content ?? "",
        enviada_em: m.created_at ?? "",
      })),
    });
  }

  return { chats_verificados: chats.length, msgs_novas: msgsNovas, erros };
}

/** Marca uma mensagem como processada (impede reprocessamento). */
export async function marcarProcessada(chatId: string, msgId: string): Promise<void> {
  await supabase.from("mila_chat_estado").upsert({
    chat_clint_id: chatId,
    ultima_msg_processada_id: msgId,
    ultima_msg_processada_em: new Date().toISOString(),
    aguardando_autorizacao_id: null,
    atualizada_em: new Date().toISOString(),
  }, { onConflict: "chat_clint_id" });
}

/** Marca chat como aguardando autorização (pausa o processamento). */
export async function marcarAguardandoAutorizacao(chatId: string, autorizacaoId: string): Promise<void> {
  await supabase.from("mila_chat_estado").upsert({
    chat_clint_id: chatId,
    aguardando_autorizacao_id: autorizacaoId,
    atualizada_em: new Date().toISOString(),
  }, { onConflict: "chat_clint_id" });
}
