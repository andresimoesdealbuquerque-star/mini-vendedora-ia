import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db/client";

export const runtime = "nodejs";

/**
 * GET /api/admin/recuperacao?status=pendente,aprovada
 * Lista sugestões com dados do contato.
 */
export async function GET(req: NextRequest) {
  const statusParam = req.nextUrl.searchParams.get("status") ?? "pendente";
  const statuses = statusParam.split(",").map((s) => s.trim());

  const r = await supabase
    .from("mila_recuperacao")
    .select("*, clint_contatos!inner(clint_id, nome, telefone, etapa_funil, ultima_mensagem_em)")
    .in("status", statuses)
    .order("criada_em", { ascending: false });

  if (r.error) return NextResponse.json({ erro: r.error.message }, { status: 500 });
  return NextResponse.json({ sugestoes: r.data ?? [] });
}
