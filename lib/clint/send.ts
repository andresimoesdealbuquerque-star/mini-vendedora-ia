/**
 * Helper de envio de mensagem via Clint que resolve automaticamente:
 *   1. O channel_account_id (busca do próprio chat)
 *   2. O contact_id mais recente (Clint às vezes duplica)
 *   3. O chat OPEN no canal WhatsApp Oficial
 *
 * Retorna erro estruturado se falhar (janela fechada, chat não existe, etc).
 */

import {
  listarChatsDoContato,
  buscarContatosPorTelefone,
  enviarMensagem,
  clintHabilitado,
} from "./client";

export interface EnvioResultado {
  ok: boolean;
  message_id?: string;
  chat_id?: string;
  erro?: string;
  status?: number;
}

/**
 * Envia mensagem no WhatsApp OFICIAL de um contato.
 * Resolve chat_id + channel_account_id automaticamente.
 */
export async function enviarViaContato(opts: {
  contact_id: string;
  message: string;
  channel_oficial_id?: string;  // se souber, passa; senão vai descobrir
}): Promise<EnvioResultado> {
  if (!clintHabilitado()) return { ok: false, erro: "CLINT_API_TOKEN não configurada" };

  const chatsResp = await listarChatsDoContato(opts.contact_id, { limit: 20 });
  if (!chatsResp.ok) return { ok: false, erro: chatsResp.erro };

  const chats = chatsResp.data.data ?? [];
  // Prefere chat no canal oficial (WHATSAPP_OFFICIAL), status OPEN, mais recente
  const oficial = opts.channel_oficial_id
    ? chats.find((c) => c.channel_account_id === opts.channel_oficial_id && c.status === "OPEN")
    : chats
        .filter((c) => c.status === "OPEN")
        .sort((a, b) => {
          const ta = new Date(a.last_message_at || 0).getTime();
          const tb = new Date(b.last_message_at || 0).getTime();
          return tb - ta;
        })[0];

  if (!oficial) return { ok: false, erro: "Nenhum chat aberto encontrado pra esse contato" };
  if (!oficial.channel_account_id) return { ok: false, erro: "Chat sem channel_account_id" };

  const r = await enviarMensagem({
    chat_id: oficial.id,
    channel_account_id: oficial.channel_account_id,
    contact_id: opts.contact_id,
    message: opts.message,
  });
  if (!r.ok) return { ok: false, erro: r.erro, status: r.status };
  return {
    ok: true,
    message_id: r.data.data.message_id,
    chat_id: r.data.data.chat_id,
  };
}

/**
 * Envia mensagem por telefone (E.164, ex: +5583999999999).
 * Se houver contatos duplicados, usa o mais recente (updated_at).
 */
export async function enviarViaTelefone(opts: {
  fullPhone: string;
  message: string;
  channel_oficial_id?: string;
}): Promise<EnvioResultado> {
  const cResp = await buscarContatosPorTelefone(opts.fullPhone);
  if (!cResp.ok) return { ok: false, erro: cResp.erro };
  const contatos = cResp.data.data ?? [];
  if (contatos.length === 0) return { ok: false, erro: `Contato com telefone ${opts.fullPhone} não existe no Clint` };

  const maisRecente = contatos.sort((a, b) => {
    const ta = new Date(a.updated_at || a.created_at || 0).getTime();
    const tb = new Date(b.updated_at || b.created_at || 0).getTime();
    return tb - ta;
  })[0];

  return enviarViaContato({
    contact_id: maisRecente.id,
    message: opts.message,
    channel_oficial_id: opts.channel_oficial_id,
  });
}
