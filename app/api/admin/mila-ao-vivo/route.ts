import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db/client";

export const runtime = "nodejs";

/** GET /api/admin/mila-ao-vivo?limit=100 — timeline recente */
export async function GET(req: NextRequest) {
  const limite = Number(req.nextUrl.searchParams.get("limit") ?? 50);
  const [logs, autorizacoes] = await Promise.all([
    supabase.from("mila_ao_vivo").select("*").order("criada_em", { ascending: false }).limit(limite),
    supabase.from("mila_autorizacoes").select("*").in("status", ["aguardando", "aprovada", "negada", "timeout"])
      .order("perguntada_em", { ascending: false }).limit(20),
  ]);
  return NextResponse.json({
    logs: logs.data ?? [],
    autorizacoes: autorizacoes.data ?? [],
  });
}
