import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db/client";
import { descrevHorario, eHorarioHumano } from "@/lib/horario";

export const runtime = "nodejs";

/** GET /api/admin/mila-config — estado + horário */
export async function GET() {
  const r = await supabase.from("mila_config").select("*").eq("id", "singleton").maybeSingle();
  return NextResponse.json({
    ativa: r.data?.ativa ?? true,
    modo_simulacao: r.data?.modo_simulacao ?? false,
    atualizada_em: r.data?.atualizada_em,
    horario: descrevHorario(),
    e_horario_humano: eHorarioHumano(),
  });
}

/**
 * PATCH /api/admin/mila-config
 * body: { ativa?: bool, modo_simulacao?: bool }
 */
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const patch: Record<string, unknown> = { atualizada_em: new Date().toISOString() };
  if (body.ativa !== undefined) patch.ativa = !!body.ativa;
  if (body.modo_simulacao !== undefined) patch.modo_simulacao = !!body.modo_simulacao;
  const r = await supabase.from("mila_config").update(patch).eq("id", "singleton").select().single();
  if (r.error) return NextResponse.json({ erro: r.error.message }, { status: 500 });
  return NextResponse.json({ ok: true, config: r.data });
}
