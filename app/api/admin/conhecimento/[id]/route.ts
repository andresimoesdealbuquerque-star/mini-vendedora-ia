import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db/client";
import { invalidarCacheConhecimento } from "@/lib/ai/conhecimento";

export const runtime = "nodejs";

function tabelaPorTipo(tipo: string): string | null {
  if (tipo === "regra") return "mila_regras";
  if (tipo === "exemplo") return "mila_exemplos";
  return null;
}

/**
 * PATCH /api/admin/conhecimento/[id]?tipo=regra|exemplo
 * body: { ativa?, texto?, mensagem_cliente?, resposta_correta?, contexto?, ordem? }
 */
export async function PATCH(req: NextRequest, ctx: { params: { id: string } }) {
  try {
    const tipo = req.nextUrl.searchParams.get("tipo");
    const tabela = tabelaPorTipo(tipo || "");
    if (!tabela) return NextResponse.json({ erro: "tipo inválido" }, { status: 400 });

    const body = await req.json();
    const patch: Record<string, unknown> = { atualizada_em: new Date().toISOString() };
    const camposPermitidos = tipo === "regra"
      ? ["texto", "ativa", "ordem"]
      : ["mensagem_cliente", "resposta_correta", "contexto", "ativa", "ordem"];
    for (const k of camposPermitidos) {
      if (body[k] !== undefined) patch[k] = body[k];
    }
    const r = await supabase.from(tabela).update(patch).eq("id", ctx.params.id).select().single();
    if (r.error) throw r.error;
    invalidarCacheConhecimento();
    return NextResponse.json({ ok: true, [tipo!]: r.data });
  } catch (e) {
    return NextResponse.json({ erro: e instanceof Error ? e.message : "erro" }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/conhecimento/[id]?tipo=regra|exemplo
 */
export async function DELETE(req: NextRequest, ctx: { params: { id: string } }) {
  try {
    const tipo = req.nextUrl.searchParams.get("tipo");
    const tabela = tabelaPorTipo(tipo || "");
    if (!tabela) return NextResponse.json({ erro: "tipo inválido" }, { status: 400 });
    const r = await supabase.from(tabela).delete().eq("id", ctx.params.id);
    if (r.error) throw r.error;
    invalidarCacheConhecimento();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ erro: e instanceof Error ? e.message : "erro" }, { status: 500 });
  }
}
