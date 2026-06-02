import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db/client";

export const runtime = "nodejs";

/** GET /api/admin/recuperacao/[id]/conversa → linha do tempo das mensagens. */
export async function GET(_req: NextRequest, ctx: { params: { id: string } }) {
  const sugQ = await supabase
    .from("mila_recuperacao")
    .select("chat_clint_id")
    .eq("id", ctx.params.id)
    .maybeSingle();
  if (sugQ.error || !sugQ.data?.chat_clint_id) {
    return NextResponse.json({ mensagens: [] });
  }
  const msgsQ = await supabase
    .from("clint_mensagens")
    .select("direcao, autor, conteudo, enviada_em, tipo")
    .eq("chat_clint_id", sugQ.data.chat_clint_id)
    .order("enviada_em", { ascending: true });
  return NextResponse.json({ mensagens: msgsQ.data ?? [] });
}
