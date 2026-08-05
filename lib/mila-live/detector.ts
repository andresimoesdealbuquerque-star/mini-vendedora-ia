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
import { transcreverAudio } from "./audio";
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

    // Filtra reactions / events (não são mensagens de texto acionáveis)
    const msgsAcionaveis = msgs.filter((m: any) =>
      m.content_type !== "REACTION" && m.content_type !== "EVENT"
    );
    if (msgsAcionaveis.length === 0) continue;
    const ultima = msgsAcionaveis[msgsAcionaveis.length - 1] as any;
    // Só responde se a ÚLTIMA mensagem foi do CLIENTE.
    // Clint marca: type=CUSTOMER → cliente | type=USER → vendedor/Mila/API
    if (ultima.type !== "CUSTOMER") continue;
    if (ultima.source === "API") continue;                // dupla proteção contra loop
    if (ultima.content_type === "EVENT") continue;        // evento, não é mensagem
    if (ultima.content_type === "REACTION") continue;     // reação (emoji), não é msg
    // Ignora só se NEM texto NEM mídia
    const temTexto = !!ultima.content?.trim();
    const temMidia = !!ultima.content_url;
    if (!temTexto && !temMidia) continue;
    // Ignora se já processamos essa mensagem
    if (estado?.ultima_msg_processada_id === ultima.id) continue;

    // Debounce: se cliente acabou de digitar (< 25s), espera próximo tick.
    // Evita responder no meio de uma sequência de msgs e passa a "cadência" mais humana.
    // Áudio não debouncia — já vem completo.
    const idadeMs = ultima.created_at ? Date.now() - new Date(ultima.created_at).getTime() : Infinity;
    if (idadeMs < 25_000 && ultima.content_type !== "AUDIO") continue;

    // Monta contexto pra gerador
    const contatoQ = await supabase
      .from("clint_contatos")
      .select("nome, telefone")
      .eq("clint_id", chat.contato_clint_id)
      .maybeSingle();

    const eImagem = (ultima.content_type === "IMAGE" || (ultima as any).content_type === "IMAGE") && !!ultima.content_url;
    const eAudio = ultima.content_type === "AUDIO" && !!ultima.content_url;

    // Se for áudio, transcreve via Groq Whisper e usa como conteúdo
    let transcricaoUltima: string | null = null;
    if (eAudio) {
      const r = await transcreverAudio(ultima.content_url);
      if (r.ok && r.texto) {
        transcricaoUltima = r.texto;
      } else {
        erros.push(`transcrever ${ultima.id}: ${r.erro}`);
      }
    }

    const conteudoUltima = ultima.content?.trim()
      ? ultima.content
      : transcricaoUltima
        ? `[áudio transcrito]: ${transcricaoUltima}`
        : eImagem
          ? "[imagem enviada]"
          : eAudio
            ? "[áudio enviado — não consegui transcrever, pergunte por escrito]"
            : "[mídia enviada]";

    msgsNovas.push({
      chat_id: chat.clint_id,
      contact_id: chat.contato_clint_id,
      channel_account_id: CANAL_OFICIAL,
      contato_nome: contatoQ.data?.nome ?? null,
      contato_telefone: contatoQ.data?.telefone ?? null,
      ultima_msg_cliente_id: ultima.id,
      ultima_msg_cliente: conteudoUltima,
      ultima_msg_cliente_em: ultima.created_at ?? new Date().toISOString(),
      ultima_msg_e_imagem: eImagem,
      historico: msgsAcionaveis.slice(-20).map((m: any) => {
        const tipoMsg = m.content_type || m.type || "TEXT";
        let conteudo = m.content ?? "";

        // Última msg de áudio já foi transcrita acima; reaproveita.
        // Áudios anteriores viram marcador (evita transcrever tudo toda rodada).
        if (tipoMsg === "AUDIO" && m.type === "CUSTOMER") {
          if (m.id === ultima.id && transcricaoUltima) {
            conteudo = `[áudio transcrito]: ${transcricaoUltima}`;
          } else {
            conteudo = "[áudio anterior — se cliente citar, peça pra repetir por escrito]";
          }
        }

        // Limpa prefixo *NomeVendedora :* que o painel do Clint injeta em toda
        // msg humana. Sem isso, Mila copia o formato e responde tipo
        // "*Daíze :* boa tarde". Ex de match: "*Daíze :* \n texto"
        if (m.type === "USER" && conteudo) {
          conteudo = conteudo.replace(/^\s*\*[^*\n]{1,40}\s*:\*\s*\n?\s*/i, "").trim();
        }

        if (!conteudo.trim()) {
          if (tipoMsg === "IMAGE") conteudo = "[imagem]";
          else if (tipoMsg === "AUDIO") conteudo = "[áudio]";
          else if (tipoMsg === "VIDEO") conteudo = "[vídeo]";
          else if (tipoMsg === "DOCUMENT") conteudo = "[documento]";
        }
        return {
          direcao: (m.type === "CUSTOMER") ? "entrada" as const : "saida" as const,
          conteudo,
          tipo: tipoMsg,
          midia_url: m.content_url ?? null,
          enviada_em: m.created_at ?? "",
        };
      }).filter((m: any) => m.conteudo && m.conteudo.trim()),  // garante zero msg vazia pro Claude
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
