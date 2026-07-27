import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db/client";
import { analisarDesfecho, type MensagemPerda } from "@/lib/ai/analisador-perda";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/admin/panorama/analisar
 * body: { limite?: 30, forcar?: false }
 *
 * Pra cada chat SEM análise (ou todos se `forcar`), busca mensagens, chama Haiku
 * pra classificar desfecho + motivo, e salva em mila_analise_perda.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const limite = Number(body.limite ?? 30);
    const forcar = !!body.forcar;

    const chatsQ = await supabase
      .from("clint_chats")
      .select("clint_id, contato_clint_id, ultima_mensagem_em")
      .order("ultima_mensagem_em", { ascending: false })
      .limit(limite * 3);
    if (chatsQ.error) throw chatsQ.error;
    const chats = chatsQ.data ?? [];

    let pular = new Set<string>();
    if (!forcar) {
      const existQ = await supabase.from("mila_analise_perda").select("chat_clint_id");
      pular = new Set((existQ.data ?? []).map((r) => r.chat_clint_id));
    }

    const analisados: any[] = [];
    const erros: string[] = [];

    for (const chat of chats) {
      if (analisados.length >= limite) break;
      if (pular.has(chat.clint_id)) continue;

      const msgsQ = await supabase
        .from("clint_mensagens")
        .select("direcao, autor, conteudo, enviada_em")
        .eq("chat_clint_id", chat.clint_id)
        .order("enviada_em", { ascending: true });
      const mensagens = (msgsQ.data ?? []) as MensagemPerda[];
      if (mensagens.length === 0) continue;

      const analise = await analisarDesfecho(mensagens);
      if ("erro" in analise) { erros.push(`${chat.clint_id}: ${analise.erro}`); continue; }

      const ins = await supabase.from("mila_analise_perda").upsert({
        chat_clint_id: chat.clint_id,
        contato_clint_id: chat.contato_clint_id,
        vendedor_clint_id: analise.vendedor_id,
        desfecho: analise.desfecho,
        motivo_principal: analise.motivo_principal,
        motivos_secundarios: analise.motivos_secundarios,
        resumo: analise.resumo,
        citacoes: analise.citacoes,
        primeira_msg_em: analise.primeira_msg_em,
        ultima_msg_em: analise.ultima_msg_em,
        minutos_ate_primeira_resposta: analise.minutos_ate_primeira_resposta,
      }, { onConflict: "chat_clint_id" }).select().single();
      if (ins.error) erros.push(`insert ${chat.clint_id}: ${ins.error.message}`);
      else analisados.push(ins.data);
    }

    return NextResponse.json({
      ok: true, analisados: analisados.length, total_chats: chats.length, ja_analisados_antes: pular.size, erros,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, erro: e instanceof Error ? e.message : "erro" }, { status: 500 });
  }
}
