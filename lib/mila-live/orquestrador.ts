/**
 * Orquestrador principal — chamado pelo cron a cada 1 min.
 *
 * Se estiver no horário humano, sai imediatamente.
 * Senão, processa mensagens novas + resolve autorizações pendentes.
 */

import { supabase } from "@/lib/db/client";
import { eHorarioHumano, descrevHorario } from "@/lib/horario";
import { detectarMensagensNovas, marcarProcessada, marcarAguardandoAutorizacao } from "./detector";
import { gerarRespostaMila } from "./responder";
import { pedirAutorizacao, processarAutorizacoesPendentes } from "./autorizacao";
import { enviarViaContato, enviarImagemViaContato } from "@/lib/clint/send";
import { sincronizarPorDeals } from "@/lib/clint/sync-deals";
import { listarChatsDoCanal } from "@/lib/clint/client";

const CANAL_OFICIAL = "26eb4825-f226-4ec3-94bc-d91f468e9510"; // ZAP MINI 26

interface Config { ativa: boolean; modo_simulacao: boolean; }

async function pegarConfig(): Promise<Config> {
  const r = await supabase.from("mila_config").select("ativa, modo_simulacao").eq("id", "singleton").maybeSingle();
  return {
    ativa: r.data?.ativa ?? true,
    modo_simulacao: r.data?.modo_simulacao ?? false,
  };
}

export interface OrquestradorResultado {
  timestamp: string;
  horario: string;
  ativa: boolean;
  modo_simulacao: boolean;
  eHorarioHumano: boolean;
  motivo_saida?: string;
  chats_verificados?: number;
  respostas_enviadas?: number;
  autorizacoes_pedidas?: number;
  escaladas?: number;
  autorizacoes_resolvidas?: { aprovadas: number; negadas: number; timeouts: number };
  erros?: string[];
}

export async function rodarOrquestrador(opts: { ignorarHorario?: boolean } = {}): Promise<OrquestradorResultado> {
  const timestamp = new Date().toISOString();
  const horario = descrevHorario();
  const cfg = await pegarConfig();

  // Kill switch OFF → sai
  if (!cfg.ativa) {
    return { timestamp, horario, ativa: false, modo_simulacao: cfg.modo_simulacao,
             eHorarioHumano: eHorarioHumano(), motivo_saida: "Mila desativada (kill switch)" };
  }

  // Horário humano → sai (a menos que esteja em modo simulação — aí roda em SHADOW
  // pra comparar com o atendimento humano; nada é enviado ao cliente)
  // opts.ignorarHorario pula essa trava (feriado local, teste manual, etc)
  if (eHorarioHumano() && !cfg.modo_simulacao && !opts.ignorarHorario) {
    return { timestamp, horario, ativa: true, modo_simulacao: cfg.modo_simulacao,
             eHorarioHumano: true, motivo_saida: "Horário humano — silêncio" };
  }

  const erros: string[] = [];
  let respostas_enviadas = 0;
  let autorizacoes_pedidas = 0;
  let escaladas = 0;

  // 0. Sync leve — pega deals com atividade recente pra ter cache fresco.
  //    Janela maior (24h) quando estamos rodando fora de horário / force pra
  //    cobrir feriado ou pausa: pega o dia inteiro.
  const agora = new Date();
  const janelaHoras = opts.ignorarHorario ? 24 : 6;
  const janelaInicio = new Date(agora.getTime() - janelaHoras * 60 * 60_000);
  try {
    const syncRes = await sincronizarPorDeals({
      dataInicio: janelaInicio.toISOString(),
      dataFim: agora.toISOString(),
      maxPaginas: opts.ignorarHorario ? 10 : 5,
      maxDeals: opts.ignorarHorario ? 100 : 40,
    });
    if ("erro" in syncRes) erros.push(`sync: ${syncRes.erro}`);
  } catch (e) {
    erros.push(`sync: ${e instanceof Error ? e.message : "erro"}`);
  }

  // 0b. Sync direto do canal — pega chats novos que ainda não têm deal
  //     (contatos frescos que escreveram hoje). Só roda em ignorarHorario
  //     pra evitar carga extra no cron regular.
  if (opts.ignorarHorario) {
    try {
      const r = await listarChatsDoCanal(CANAL_OFICIAL, { limit: 100 });
      if (r.ok) {
        const linhasChats = (r.data.data ?? []).map((ch: any) => ({
          clint_id: ch.id,
          contato_clint_id: ch.contact?.id ?? ch.contact_id,
          canal: "whatsapp",
          status: ch.status ?? null,
          ultima_mensagem_em: ch.last_message_at ?? null,
          metadados: ch,
          sincronizado_em: new Date().toISOString(),
        })).filter((c: any) => c.contato_clint_id);

        // upsert contatos (mínimo: id + nome) e chats
        const contatosSet = new Map();
        for (const ch of (r.data.data ?? [])) {
          const c = ch.contact;
          if (c?.id) contatosSet.set(c.id, {
            clint_id: c.id, nome: c.name ?? null,
            telefone: c.ddi && c.phone ? `${c.ddi}${c.phone}` : (c.phone ?? null),
            sincronizado_em: new Date().toISOString(),
          });
        }
        if (contatosSet.size) await supabase.from("clint_contatos").upsert([...contatosSet.values()], { onConflict: "clint_id" });
        if (linhasChats.length) await supabase.from("clint_chats").upsert(linhasChats, { onConflict: "clint_id" });
      } else {
        erros.push(`sync canal: ${r.erro}`);
      }
    } catch (e) {
      erros.push(`sync canal: ${e instanceof Error ? e.message : "erro"}`);
    }
  }

  // 1. Resolve autorizações pendentes primeiro (pode liberar chats pra ação)
  const autorizacoes_resolvidas = await processarAutorizacoesPendentes();

  // 2. Aprovadas → dispara resposta que estava aguardando
  const aprovadas = await supabase.from("mila_autorizacoes")
    .select("*").eq("status", "aprovada").is("respondida_em", null);
  // (Nada a fazer aqui — o dispatch é feito no momento da autorização OU no próximo ciclo lê a proposta)

  // Reprocessa aprovadas — dispara a proposta e libera o chat
  const aprovadasRecentes = await supabase.from("mila_autorizacoes")
    .select("*")
    .eq("status", "aprovada")
    .gte("respondida_em", new Date(Date.now() - 5 * 60_000).toISOString());
  for (const a of aprovadasRecentes.data ?? []) {
    // Envia a proposta original ao cliente
    const send = cfg.modo_simulacao ? { ok: true, message_id: "SIM" } : await enviarViaContato({
      contact_id: a.contato_clint_id,
      message: a.proposta_mila,
    });
    await supabase.from("mila_ao_vivo").insert({
      chat_clint_id: a.chat_clint_id,
      contato_clint_id: a.contato_clint_id,
      contato_nome: a.contato_nome,
      mensagem_cliente: "(via autorização aprovada)",
      resposta_mila: a.proposta_mila,
      resposta_enviada_em: new Date().toISOString(),
      status: cfg.modo_simulacao ? "simulada" : (send.ok ? "enviada" : "falhou"),
      motivo_escalacao: send.ok ? null : (send as any).erro,
      clint_message_id: (send as any).message_id ?? null,
    });
    await marcarProcessada(a.chat_clint_id, `autoriza-${a.id}`);
    // Move autorização pra estado "resolvida completa" (uso outro campo pra não reprocessar)
    await supabase.from("mila_autorizacoes")
      .update({ resposta_dono: (a.resposta_dono || "sim") + " [enviado]" })
      .eq("id", a.id);
  }

  // Negadas → escala humano
  const negadasRecentes = await supabase.from("mila_autorizacoes")
    .select("*")
    .eq("status", "negada")
    .gte("respondida_em", new Date(Date.now() - 5 * 60_000).toISOString());
  for (const a of negadasRecentes.data ?? []) {
    const mensagem = "Vou passar seu atendimento pra minha colega Marina, ela retorna aqui em instantes.";
    if (!cfg.modo_simulacao) {
      await enviarViaContato({ contact_id: a.contato_clint_id, message: mensagem });
    }
    await supabase.from("mila_ao_vivo").insert({
      chat_clint_id: a.chat_clint_id,
      contato_clint_id: a.contato_clint_id,
      contato_nome: a.contato_nome,
      mensagem_cliente: "(via autorização negada)",
      resposta_mila: mensagem,
      resposta_enviada_em: new Date().toISOString(),
      status: "escalada",
      motivo_escalacao: "dono negou autorização",
    });
    await marcarProcessada(a.chat_clint_id, `nega-${a.id}`);
    await supabase.from("mila_autorizacoes")
      .update({ resposta_dono: (a.resposta_dono || "não") + " [escalado]" })
      .eq("id", a.id);
    escaladas++;
  }

  // 3. Detecta mensagens novas de cliente
  const det = await detectarMensagensNovas({ maxChats: opts.ignorarHorario ? 100 : 30 });
  erros.push(...det.erros);

  const umaHoraAtras = new Date(Date.now() - 60 * 60_000).toISOString();

  for (const ctx of det.msgs_novas) {
    // Rate limit: no máximo 8 respostas/hora no mesmo chat.
    // Barreira contra loop bizarro (cliente respondendo/bot re-respondendo).
    const contagemQ = await supabase.from("mila_ao_vivo")
      .select("id", { count: "exact", head: true })
      .eq("chat_clint_id", ctx.chat_id)
      .gte("resposta_enviada_em", umaHoraAtras);
    if ((contagemQ.count ?? 0) >= 8) {
      erros.push(`rate limit chat ${ctx.chat_id}: 8+ respostas na última hora, pulando`);
      await marcarProcessada(ctx.chat_id, ctx.ultima_msg_cliente_id);
      continue;
    }

    // Gera resposta
    const rMila = await gerarRespostaMila(ctx);
    if ("erro" in rMila) { erros.push(`IA ${ctx.chat_id}: ${rMila.erro}`); continue; }

    const intent = rMila.intent_detectado;

    // Escala imediata: reclamação
    if (intent.reclamacao) {
      const mensagem = "Vou passar seu atendimento pra minha colega Marina, ela retorna aqui em instantes.";
      const send = cfg.modo_simulacao ? { ok: true, message_id: "SIM" } : await enviarViaContato({
        contact_id: ctx.contact_id, message: mensagem,
      });
      await supabase.from("mila_ao_vivo").insert({
        chat_clint_id: ctx.chat_id,
        contato_clint_id: ctx.contact_id,
        contato_nome: ctx.contato_nome,
        mensagem_cliente: ctx.ultima_msg_cliente,
        mensagem_cliente_em: ctx.ultima_msg_cliente_em,
        resposta_mila: mensagem,
        resposta_enviada_em: new Date().toISOString(),
        status: "escalada",
        motivo_escalacao: intent.reclamacao,
        clint_message_id: (send as any).message_id ?? null,
      });
      await marcarProcessada(ctx.chat_id, ctx.ultima_msg_cliente_id);
      escaladas++;
      continue;
    }

    // Precisa autorização (fechamento ou desconto além padrão)
    if (intent.fechamento || intent.desconto_alem_padrao) {
      const tipo = intent.fechamento ? "fechamento" : "desconto";
      const contexto = intent.fechamento
        ? `Cliente confirmou intenção de fechar. Última msg: "${ctx.ultima_msg_cliente.slice(0, 200)}"`
        : `Cliente pediu ${intent.desconto_alem_padrao?.pct}% de desconto (padrão é 8%). Última msg: "${ctx.ultima_msg_cliente.slice(0, 200)}"`;
      const valor = intent.desconto_alem_padrao?.valor;

      const auth = await pedirAutorizacao({
        tipo,
        chat_clint_id: ctx.chat_id,
        contato_clint_id: ctx.contact_id,
        contato_nome: ctx.contato_nome,
        contexto,
        proposta_mila: rMila.texto,
        valor,
      });
      if (auth.ok) {
        await marcarAguardandoAutorizacao(ctx.chat_id, auth.autorizacao.id);
        await supabase.from("mila_ao_vivo").insert({
          chat_clint_id: ctx.chat_id,
          contato_clint_id: ctx.contact_id,
          contato_nome: ctx.contato_nome,
          mensagem_cliente: ctx.ultima_msg_cliente,
          mensagem_cliente_em: ctx.ultima_msg_cliente_em,
          resposta_mila: rMila.texto,
          resposta_enviada_em: null,
          status: "aguardando_autorizacao",
          motivo_escalacao: `autorização ${tipo}`,
        });
        autorizacoes_pedidas++;
      } else {
        erros.push(`autorização ${ctx.chat_id}: ${auth.erro}`);
        // Escala pra humano ao invés de deixar cliente esperando
        await supabase.from("mila_ao_vivo").insert({
          chat_clint_id: ctx.chat_id,
          contato_clint_id: ctx.contact_id,
          contato_nome: ctx.contato_nome,
          mensagem_cliente: ctx.ultima_msg_cliente,
          resposta_mila: null,
          status: "escalada",
          motivo_escalacao: `falha ao pedir autorização: ${auth.erro}`,
        });
        await marcarProcessada(ctx.chat_id, ctx.ultima_msg_cliente_id);
        escaladas++;
      }
      continue;
    }

    // Envia imagens do catálogo ANTES do texto (WhatsApp mostra em ordem)
    const imgsEnviadas: string[] = [];
    const imgsErros: string[] = [];
    if (rMila.imagens_a_enviar.length > 0 && !cfg.modo_simulacao) {
      for (const img of rMila.imagens_a_enviar) {
        const r = await enviarImagemViaContato({
          contact_id: ctx.contact_id,
          url: img.url,
          // caption vazio propositalmente — Mila comenta no texto que vem depois
        });
        if (r.ok) imgsEnviadas.push(img.url);
        else imgsErros.push(`${img.url}: ${r.erro}`);
      }
    }

    // Resposta normal → envia direto
    const send = cfg.modo_simulacao ? { ok: true, message_id: "SIMULADO" } : await enviarViaContato({
      contact_id: ctx.contact_id, message: rMila.texto,
    });

    await supabase.from("mila_ao_vivo").insert({
      chat_clint_id: ctx.chat_id,
      contato_clint_id: ctx.contact_id,
      contato_nome: ctx.contato_nome,
      mensagem_cliente: ctx.ultima_msg_cliente,
      mensagem_cliente_em: ctx.ultima_msg_cliente_em,
      resposta_mila: rMila.imagens_a_enviar.length
        ? `📎 ${rMila.imagens_a_enviar.length} img(s) do catálogo + ${rMila.texto}`
        : rMila.texto,
      resposta_enviada_em: send.ok ? new Date().toISOString() : null,
      status: cfg.modo_simulacao ? "simulada" : (send.ok ? "enviada" : "falhou"),
      motivo_escalacao: send.ok ? null : (send as any).erro,
      clint_message_id: (send as any).message_id ?? null,
    });
    if (imgsErros.length) erros.push(...imgsErros.map((e) => `img catalogo: ${e}`));
    await marcarProcessada(ctx.chat_id, ctx.ultima_msg_cliente_id);
    if (send.ok) respostas_enviadas++;
  }

  return {
    timestamp, horario, ativa: cfg.ativa, modo_simulacao: cfg.modo_simulacao, eHorarioHumano: false,
    chats_verificados: det.chats_verificados,
    respostas_enviadas, autorizacoes_pedidas, escaladas,
    autorizacoes_resolvidas, erros,
  };
}
