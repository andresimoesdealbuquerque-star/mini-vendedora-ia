import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db/client";
import { avaliarVendedor, type ConversaAval, type MensagemAval } from "@/lib/ai/avaliador-vendedor";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/admin/avaliar-vendedor
 * body: { vendedor_clint_id, max_conversas?: 15 }
 *
 * Busca as últimas N conversas onde a vendedora atuou (mensagens de saída
 * com autor = vendedor_clint_id), monta histórico e pede pra IA avaliar.
 * Salva resultado em mila_avaliacoes_vendedor e retorna.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const vendedorId = String(body.vendedor_clint_id || "");
    const maxConv = Number(body.max_conversas ?? 50);
    if (!vendedorId) {
      return NextResponse.json({ erro: "vendedor_clint_id obrigatório" }, { status: 400 });
    }

    // Busca o nome da vendedora
    const vQ = await supabase
      .from("clint_usuarios")
      .select("clint_id, nome")
      .eq("clint_id", vendedorId)
      .maybeSingle();
    if (!vQ.data) {
      return NextResponse.json({ erro: "vendedor não cadastrado — rode sync-usuarios primeiro" }, { status: 404 });
    }
    const vendedor = { clint_id: vQ.data.clint_id, nome: vQ.data.nome ?? vendedorId };

    // Acha chats onde ela mandou pelo menos 1 mensagem
    const chatsQ = await supabase
      .from("clint_mensagens")
      .select("chat_clint_id")
      .eq("autor", vendedorId)
      .eq("direcao", "saida")
      .limit(500);
    const chatIds = Array.from(new Set((chatsQ.data ?? []).map((m: any) => m.chat_clint_id))).slice(0, maxConv);
    if (chatIds.length === 0) {
      return NextResponse.json({ erro: "nenhuma conversa encontrada pra essa vendedora" }, { status: 404 });
    }

    // Pra cada chat, pega histórico completo + contato
    const conversas: ConversaAval[] = [];
    let primeiroAt: string | null = null;
    let ultimoAt: string | null = null;
    for (const chatId of chatIds) {
      const chQ = await supabase
        .from("clint_chats")
        .select("contato_clint_id")
        .eq("clint_id", chatId)
        .maybeSingle();
      const contatoId = chQ.data?.contato_clint_id;
      let nome: string | null = null, telefone: string | null = null;
      if (contatoId) {
        const ctQ = await supabase
          .from("clint_contatos").select("nome, telefone").eq("clint_id", contatoId).maybeSingle();
        nome = ctQ.data?.nome ?? null;
        telefone = ctQ.data?.telefone ?? null;
      }
      const msgsQ = await supabase
        .from("clint_mensagens")
        .select("direcao, autor, conteudo, enviada_em")
        .eq("chat_clint_id", chatId)
        .order("enviada_em", { ascending: true });
      const mensagens = (msgsQ.data ?? []) as MensagemAval[];
      if (mensagens.length === 0) continue;
      conversas.push({ contato_nome: nome, contato_telefone: telefone, mensagens });

      const last = mensagens[mensagens.length - 1]?.enviada_em;
      const first = mensagens[0]?.enviada_em;
      if (first && (!primeiroAt || first < primeiroAt)) primeiroAt = first;
      if (last && (!ultimoAt || last > ultimoAt)) ultimoAt = last;
    }

    // Chama Claude
    const resultado = await avaliarVendedor({ vendedor, conversas });
    if ("erro" in resultado) {
      return NextResponse.json({ erro: resultado.erro }, { status: 500 });
    }

    // Salva
    const ins = await supabase.from("mila_avaliacoes_vendedor").insert({
      vendedor_clint_id: vendedorId,
      conversas_analisadas: conversas.length,
      desde: primeiroAt,
      ate: ultimoAt,
      score_geral: resultado.score_geral,
      score_tempo_resposta: resultado.score_tempo_resposta,
      score_completude: resultado.score_completude,
      score_tom: resultado.score_tom,
      score_conversao: resultado.score_conversao,
      resumo_executivo: resultado.resumo_executivo,
      pontos_fortes: resultado.pontos_fortes,
      pontos_fracos: resultado.pontos_fracos,
      exemplos: resultado.exemplos,
      sugestoes_treinamento: resultado.sugestoes_treinamento,
    }).select().single();

    if (ins.error) return NextResponse.json({ erro: ins.error.message }, { status: 500 });

    return NextResponse.json({ ok: true, avaliacao: ins.data });
  } catch (e) {
    return NextResponse.json({ erro: e instanceof Error ? e.message : "erro" }, { status: 500 });
  }
}
