/**
 * Sistema de autorização via WhatsApp.
 *
 * Fluxo:
 *   1. Mila detecta intenção de fechamento/desconto além padrão
 *   2. Cria registro em mila_autorizacoes (status=aguardando)
 *   3. Envia mensagem pro WhatsApp do dono (André) com contexto e pergunta
 *   4. Cron seguinte varre autorizações aguardando:
 *      - Busca msgs novas do dono no chat com a Mini
 *      - Se detectar "sim"/"não" → resolve
 *      - Se passou de 30 min → escala pra humano
 *   5. Se aprovada: Mila prossegue com envio da proposta
 *   6. Se negada: Mila avisa cliente que vai passar pra vendedora
 */

import { supabase } from "@/lib/db/client";
import { enviarViaContato } from "@/lib/clint/send";
import { listarChatsDoContato, listarMensagensDoChat } from "@/lib/clint/client";

// André Albuquerque (dono). Contato mais recente no Clint com telefone +5583999364904
const DONO_CONTACT_IDS = [
  "c9c0c4c1-f5d6-4dcc-95fd-c73efd619d6a",
  "de7d3ba4-81f5-4fa7-8c36-9d67fec6938c",
];
const CANAL_OFICIAL = "26eb4825-f226-4ec3-94bc-d91f468e9510";

export interface Autorizacao {
  id: string;
  tipo: "fechamento" | "desconto" | "outro";
  chat_clint_id: string;
  contato_clint_id: string;
  contato_nome: string | null;
  contexto: string;
  proposta_mila: string;
  valor?: number;
  status: "aguardando" | "aprovada" | "negada" | "timeout" | "erro_envio";
}

/**
 * Cria pedido de autorização E manda pro WhatsApp do dono.
 * Retorna a autorização criada.
 */
export async function pedirAutorizacao(opts: {
  tipo: "fechamento" | "desconto";
  chat_clint_id: string;
  contato_clint_id: string;
  contato_nome: string | null;
  contexto: string;             // resumo pra dono decidir
  proposta_mila: string;         // texto que a Mila quer enviar pro cliente
  valor?: number;
}): Promise<{ ok: true; autorizacao: Autorizacao } | { ok: false; erro: string }> {
  const emoji = opts.tipo === "fechamento" ? "🛒" : "💰";
  const titulo = opts.tipo === "fechamento" ? "FECHAMENTO DE PEDIDO" : "AUTORIZAÇÃO DE DESCONTO";
  const nomeCliente = opts.contato_nome || "cliente";
  const valorTxt = opts.valor ? `\nValor: R$ ${opts.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "";

  const mensagemDono = `${emoji} MILA — ${titulo}

Cliente: ${nomeCliente}${valorTxt}

Contexto:
${opts.contexto}

Proposta da Mila:
${opts.proposta_mila.slice(0, 400)}${opts.proposta_mila.length > 400 ? "..." : ""}

Responda SIM pra autorizar ou NÃO pra passar pra humano. Timeout: 30 min.`;

  // 1. Cria autorização (status: aguardando)
  const ins = await supabase.from("mila_autorizacoes").insert({
    tipo: opts.tipo,
    chat_clint_id: opts.chat_clint_id,
    contato_clint_id: opts.contato_clint_id,
    contato_nome: opts.contato_nome,
    contexto: opts.contexto,
    proposta_mila: opts.proposta_mila,
    valor: opts.valor,
    status: "aguardando",
  }).select().single();
  if (ins.error) return { ok: false, erro: `insert autorização: ${ins.error.message}` };

  // 2. Manda mensagem pro dono (tenta os contact_ids duplicados)
  let enviado = false;
  let erroEnvio = "";
  for (const cid of DONO_CONTACT_IDS) {
    const r = await enviarViaContato({
      contact_id: cid,
      message: mensagemDono,
      channel_oficial_id: CANAL_OFICIAL,
    });
    if (r.ok) { enviado = true; break; }
    erroEnvio = r.erro || "";
  }

  if (!enviado) {
    await supabase.from("mila_autorizacoes")
      .update({ status: "erro_envio", resposta_dono: erroEnvio })
      .eq("id", ins.data.id);
    return { ok: false, erro: `Falha ao notificar dono: ${erroEnvio}` };
  }

  return { ok: true, autorizacao: ins.data as Autorizacao };
}

/**
 * Varre autorizações aguardando e resolve as que já foram respondidas.
 * Chamada pelo cron a cada 1 min.
 */
export async function processarAutorizacoesPendentes(): Promise<{
  aprovadas: number; negadas: number; timeouts: number; pendentes: number;
}> {
  const pendQ = await supabase.from("mila_autorizacoes")
    .select("*").eq("status", "aguardando")
    .order("perguntada_em", { ascending: true });
  const pendentes = pendQ.data ?? [];

  let aprovadas = 0, negadas = 0, timeouts = 0, aindaPendentes = 0;

  for (const a of pendentes) {
    // Timeout?
    if (new Date(a.timeout_em).getTime() < Date.now()) {
      await supabase.from("mila_autorizacoes")
        .update({ status: "timeout", respondida_em: new Date().toISOString() })
        .eq("id", a.id);
      // Libera o chat pra próxima rodada
      await supabase.from("mila_chat_estado")
        .update({ aguardando_autorizacao_id: null })
        .eq("chat_clint_id", a.chat_clint_id);
      timeouts++;
      continue;
    }

    // Busca resposta do dono nos chats dele
    const resposta = await buscarRespostaDono(a.perguntada_em);
    if (!resposta) { aindaPendentes++; continue; }

    const decisao = interpretarResposta(resposta.conteudo);
    if (decisao === "aprovada") {
      await supabase.from("mila_autorizacoes")
        .update({ status: "aprovada", respondida_em: new Date().toISOString(), resposta_dono: resposta.conteudo })
        .eq("id", a.id);
      aprovadas++;
    } else if (decisao === "negada") {
      await supabase.from("mila_autorizacoes")
        .update({ status: "negada", respondida_em: new Date().toISOString(), resposta_dono: resposta.conteudo })
        .eq("id", a.id);
      // Libera o chat pra Mila responder (mas ela vai escalar)
      await supabase.from("mila_chat_estado")
        .update({ aguardando_autorizacao_id: null })
        .eq("chat_clint_id", a.chat_clint_id);
      negadas++;
    } else {
      // Resposta ambígua — ainda espera ou vai por timeout
      aindaPendentes++;
    }
  }

  return { aprovadas, negadas, timeouts, pendentes: aindaPendentes };
}

/** Busca mensagem do dono no chat dele com a Mini após um timestamp. */
async function buscarRespostaDono(perguntadaEm: string): Promise<{ conteudo: string } | null> {
  for (const cid of DONO_CONTACT_IDS) {
    const chatsResp = await listarChatsDoContato(cid, { limit: 5 });
    if (!chatsResp.ok) continue;
    const chatOficial = (chatsResp.data.data ?? []).find(
      (c) => c.channel_account_id === CANAL_OFICIAL && c.status === "OPEN",
    );
    if (!chatOficial) continue;

    const msgsResp = await listarMensagensDoChat(chatOficial.id, { limit: 10 });
    if (!msgsResp.ok) continue;
    const msgs = (msgsResp.data.data ?? []).slice().sort((a, b) => {
      const ta = new Date(a.created_at || 0).getTime();
      const tb = new Date(b.created_at || 0).getTime();
      return tb - ta;
    });

    // Procura a msg mais recente do CLIENTE (dono) após perguntadaEm
    const respostaDono = msgs.find(
      (m) => !m.user_id && m.type !== "EVENT" && m.content && m.created_at &&
             new Date(m.created_at).getTime() > new Date(perguntadaEm).getTime(),
    );
    if (respostaDono?.content) return { conteudo: respostaDono.content };
  }
  return null;
}

function interpretarResposta(txt: string): "aprovada" | "negada" | "ambigua" {
  const t = txt.trim().toLowerCase();
  if (/^(sim|s|ok|pode|autorizo|autorizado|libera|liberado|manda|👍|✅|manda ver|beleza|blz)$/i.test(t)) return "aprovada";
  if (/^(sim|s|ok|autorizo|pode|libera|manda)\b/i.test(t)) return "aprovada";
  if (/^(não|nao|n|negativo|nega|nega ai|❌|🚫|nem|nao autorizo)\b/i.test(t)) return "negada";
  return "ambigua";
}
