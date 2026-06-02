import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db/client";
import { analisarConversa } from "@/lib/ai/analisador-recuperacao";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/admin/recuperacao/analisar
 * body: { limite?: number, forcar?: boolean }
 *
 * Pra cada contato cacheado SEM sugestão pendente (ou todos se `forcar`),
 * busca as mensagens do chat mais recente, analisa via IA e cria registro
 * em mila_recuperacao com status='pendente'.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const limite = Number(body.limite ?? 10);
    const forcar = !!body.forcar;

    // Pega contatos com chat
    const contQ = await supabase
      .from("clint_contatos")
      .select("clint_id, nome, telefone, ultima_mensagem_em")
      .order("ultima_mensagem_em", { ascending: false })
      .limit(limite * 3);
    if (contQ.error) throw contQ.error;
    const contatos = contQ.data ?? [];

    // Pega quem JÁ tem sugestão pendente/aprovada/enviada (não reanalisa se forcar=false)
    let pulaIds = new Set<string>();
    if (!forcar) {
      const sugQ = await supabase
        .from("mila_recuperacao")
        .select("contato_clint_id, status")
        .in("status", ["pendente", "aprovada", "enviada"]);
      pulaIds = new Set((sugQ.data ?? []).map((s) => s.contato_clint_id));
    }

    const analisados: any[] = [];
    const erros: string[] = [];

    for (const c of contatos) {
      if (analisados.length >= limite) break;
      if (pulaIds.has(c.clint_id)) continue;

      // Chat mais recente desse contato
      const chatQ = await supabase
        .from("clint_chats")
        .select("clint_id")
        .eq("contato_clint_id", c.clint_id)
        .order("ultima_mensagem_em", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (chatQ.error || !chatQ.data) continue;

      const msgsQ = await supabase
        .from("clint_mensagens")
        .select("direcao, autor, conteudo, enviada_em")
        .eq("chat_clint_id", chatQ.data.clint_id)
        .order("enviada_em", { ascending: true });
      if (msgsQ.error) { erros.push(`msgs ${c.clint_id}: ${msgsQ.error.message}`); continue; }

      const mensagens = (msgsQ.data ?? []) as any[];
      if (mensagens.length === 0) continue;

      const resultado = await analisarConversa({
        contato: { nome: c.nome, telefone: c.telefone },
        mensagens,
      });
      if ("erro" in resultado) { erros.push(`IA ${c.clint_id}: ${resultado.erro}`); continue; }

      const ins = await supabase.from("mila_recuperacao").insert({
        contato_clint_id: c.clint_id,
        chat_clint_id: chatQ.data.clint_id,
        calor: resultado.calor,
        etapa_parou: resultado.etapa_parou,
        dias_sem_resposta: resultado.dias_sem_resposta,
        diagnostico: resultado.diagnostico,
        pontos_fortes: resultado.pontos_fortes ?? [],
        oportunidades_perdidas: resultado.oportunidades_perdidas ?? [],
        texto_sugerido: resultado.texto_sugerido,
        midia_sugerida: resultado.midia_sugerida ?? null,
        motivo_descarte: resultado.motivo_pular || null,
        status: resultado.motivo_pular ? "descartada" : "pendente",
      }).select().single();
      if (ins.error) erros.push(`insert: ${ins.error.message}`);
      else analisados.push({ ...ins.data, _contato: c });
    }

    return NextResponse.json({ ok: true, analisados: analisados.length, total_contatos: contatos.length, erros });
  } catch (e) {
    return NextResponse.json({ ok: false, erro: e instanceof Error ? e.message : "erro" }, { status: 500 });
  }
}
