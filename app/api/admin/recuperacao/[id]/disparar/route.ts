import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db/client";
import { clintHabilitado } from "@/lib/clint/client";
import { enviarViaContato } from "@/lib/clint/send";

export const runtime = "nodejs";

/**
 * POST /api/admin/recuperacao/[id]/disparar
 * body: { texto?: string }  (se fornecido, sobrescreve texto_sugerido)
 *
 * Dispara a mensagem via API do Clint. Marca a sugestão como 'enviada' (ou
 * 'falhou' se der erro). Se CLINT_API_TOKEN não estiver configurada, retorna
 * 503 com instrução pra configurar.
 */
export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  if (!clintHabilitado()) {
    return NextResponse.json({
      ok: false,
      erro: "CLINT_API_TOKEN não configurada. Adicione no .env.local (e no Vercel) quando o plano Elite estiver ativo.",
    }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));

  const sugQ = await supabase.from("mila_recuperacao").select("*").eq("id", ctx.params.id).maybeSingle();
  if (sugQ.error || !sugQ.data) {
    return NextResponse.json({ erro: "sugestão não encontrada" }, { status: 404 });
  }
  const sug = sugQ.data;
  const textoFinal = (body.texto || sug.texto_sugerido || "").trim();
  if (!textoFinal) return NextResponse.json({ erro: "texto vazio" }, { status: 400 });

  const r = await enviarViaContato({
    contact_id: sug.contato_clint_id,
    message: textoFinal,
  });

  if (!r.ok) {
    await supabase
      .from("mila_recuperacao")
      .update({ status: "falhou", motivo_descarte: r.erro, atualizada_em: new Date().toISOString() })
      .eq("id", ctx.params.id);
    return NextResponse.json({ ok: false, erro: r.erro }, { status: 502 });
  }

  await supabase
    .from("mila_recuperacao")
    .update({
      status: "enviada",
      texto_sugerido: textoFinal,
      enviada_em: new Date().toISOString(),
      atualizada_em: new Date().toISOString(),
    })
    .eq("id", ctx.params.id);

  return NextResponse.json({ ok: true });
}
