import { NextResponse } from "next/server";
import { supabase } from "@/lib/db/client";
import { listarUsuarios, clintHabilitado } from "@/lib/clint/client";

export const runtime = "nodejs";

/**
 * POST /api/admin/clint/sync-usuarios — puxa lista de vendedores/operadores
 * do Clint e cacheia em clint_usuarios.
 */
export async function POST() {
  if (!clintHabilitado()) {
    return NextResponse.json({ ok: false, erro: "CLINT_API_TOKEN não configurada" }, { status: 503 });
  }

  const r = await listarUsuarios();
  if (!r.ok) return NextResponse.json({ ok: false, erro: r.erro }, { status: 502 });

  const users = r.data.data ?? [];
  const linhas = users.map((u) => ({
    clint_id: u.id,
    nome: `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || u.email || u.id,
    email: u.email ?? null,
    ativo: true,
    sincronizado_em: new Date().toISOString(),
  }));

  if (linhas.length > 0) {
    const ins = await supabase.from("clint_usuarios").upsert(linhas, { onConflict: "clint_id" });
    if (ins.error) return NextResponse.json({ ok: false, erro: ins.error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, usuarios: linhas });
}
