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

export async function rodarOrquestrador(): Promise<OrquestradorResultado> {
  const timestamp = new Date().toISOString();
  const horario = descrevHorario();
  const cfg = await pegarConfig();

  // Kill switch OFF → sai
  if (!cfg.ativa) {
    return { timestamp, horario, ativa: false, modo_simulacao: cfg.modo_simulacao,
             eHorarioHumano: eHorarioHumano(), motivo_saida: "Mila desativada (kill switch)" };
  }

  // Horário humano → sai imediatamente
  if (eHorarioHumano()) {
    return { timestamp, horario, ativa: true, modo_simulacao: cfg.modo_simulacao,
             eHorarioHumano: true, motivo_saida: "Horário humano — silêncio" };
  }

  const erros: string[] = [];
  let respostas_enviadas = 0;
  let autorizacoes_pedidas = 0;
  let escaladas = 0;

  // 0. Sync leve — pega deals com atividade nas últimas 6h pra ter cache fresco
  //    Sem isso o detector só vê chats antigos.
  const agora = new Date();
  const seisHoras = new Date(agora.getTime() - 6 * 60 * 60_000);
  try {
    const syncRes = await sincronizarPorDeals({
      dataInicio: seisHoras.toISOString(),
      dataFim: agora.toISOString(),
      maxPaginas: 5,
      maxDeals: 40,
    });
    if ("erro" in syncRes) erros.push(`sync: ${syncRes.erro}`);
  } catch (e) {
    erros.push(`sync: ${e instanceof Error ? e.message : "erro"}`);
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
  const det = await detectarMensagensNovas({ maxChats: 30 });
  erros.push(...det.erros);

  for (const ctx of det.msgs_novas) {
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
