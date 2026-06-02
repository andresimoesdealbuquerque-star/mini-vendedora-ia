import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db/client";

export const runtime = "nodejs";

/**
 * PATCH /api/admin/recuperacao/[id]
 * body: { texto_sugerido?, status?, motivo_descarte? }
 *
 * DELETE /api/admin/recuperacao/[id] — descarta
 */
export async function PATCH(req: NextRequest, ctx: { params: { id: string } }) {
  const body = await req.json();
  const patch: Record<string, unknown> = { atualizada_em: new Date().toISOString() };
  for (const k of ["texto_sugerido", "status", "motivo_descarte", "midia_sugerida"]) {
    if (body[k] !== undefined) patch[k] = body[k];
  }
  const r = await supabase.from("mila_recuperacao").update(patch).eq("id", ctx.params.id).select().single();
  if (r.error) return NextResponse.json({ erro: r.error.message }, { status: 500 });
  return NextResponse.json({ ok: true, sugestao: r.data });
}

export async function DELETE(_req: NextRequest, ctx: { params: { id: string } }) {
  const r = await supabase
    .from("mila_recuperacao")
    .update({ status: "descartada", atualizada_em: new Date().toISOString() })
    .eq("id", ctx.params.id);
  if (r.error) return NextResponse.json({ erro: r.error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
