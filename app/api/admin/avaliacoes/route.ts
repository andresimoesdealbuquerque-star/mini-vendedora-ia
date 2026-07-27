import { NextResponse } from "next/server";
import { supabase } from "@/lib/db/client";

export const runtime = "nodejs";

/** GET /api/admin/avaliacoes → lista vendedoras + última avaliação de cada uma */
export async function GET() {
  const usersQ = await supabase.from("clint_usuarios").select("*").eq("ativo", true);
  if (usersQ.error) return NextResponse.json({ erro: usersQ.error.message }, { status: 500 });

  const users = usersQ.data ?? [];
  const resultado = await Promise.all(users.map(async (u) => {
    const avQ = await supabase
      .from("mila_avaliacoes_vendedor")
      .select("*")
      .eq("vendedor_clint_id", u.clint_id)
      .order("criada_em", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Conta quantas mensagens essa vendedora tem no cache (peso da amostra)
    const cQ = await supabase
      .from("clint_mensagens")
      .select("clint_id", { count: "exact", head: true })
      .eq("autor", u.clint_id)
      .eq("direcao", "saida");

    return {
      vendedor: u,
      mensagens_no_cache: cQ.count ?? 0,
      avaliacao: avQ.data,
    };
  }));

  return NextResponse.json({ vendedores: resultado });
}
