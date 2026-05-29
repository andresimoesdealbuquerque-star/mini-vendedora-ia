import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db/client";
import { invalidarCacheConhecimento } from "@/lib/ai/conhecimento";

export const runtime = "nodejs";

/**
 * GET /api/admin/conhecimento → { regras: [...], exemplos: [...] }
 * (inclui inativos pra UI mostrar todos)
 */
export async function GET() {
  try {
    const [regras, exemplos] = await Promise.all([
      supabase.from("mila_regras").select("*").order("ordem", { ascending: true }).order("criada_em", { ascending: true }),
      supabase.from("mila_exemplos").select("*").order("ordem", { ascending: true }).order("criada_em", { ascending: true }),
    ]);
    if (regras.error) throw regras.error;
    if (exemplos.error) throw exemplos.error;
    return NextResponse.json({ regras: regras.data ?? [], exemplos: exemplos.data ?? [] });
  } catch (e) {
    return NextResponse.json({ erro: e instanceof Error ? e.message : "erro" }, { status: 500 });
  }
}

/**
 * POST /api/admin/conhecimento
 * body: { tipo: 'regra', texto } | { tipo: 'exemplo', mensagem_cliente, resposta_correta, contexto? }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (body.tipo === "regra") {
      const texto = String(body.texto ?? "").trim();
      if (!texto) return NextResponse.json({ erro: "texto obrigatório" }, { status: 400 });
      const r = await supabase.from("mila_regras").insert({ texto }).select().single();
      if (r.error) throw r.error;
      invalidarCacheConhecimento();
      return NextResponse.json({ ok: true, regra: r.data });
    }
    if (body.tipo === "exemplo") {
      const mensagem_cliente = String(body.mensagem_cliente ?? "").trim();
      const resposta_correta = String(body.resposta_correta ?? "").trim();
      if (!mensagem_cliente || !resposta_correta) {
        return NextResponse.json({ erro: "mensagem_cliente e resposta_correta obrigatórios" }, { status: 400 });
      }
      const r = await supabase
        .from("mila_exemplos")
        .insert({
          mensagem_cliente,
          resposta_correta,
          contexto: body.contexto || null,
          origem: body.origem || "manual",
        })
        .select()
        .single();
      if (r.error) throw r.error;
      invalidarCacheConhecimento();
      return NextResponse.json({ ok: true, exemplo: r.data });
    }
    return NextResponse.json({ erro: "tipo inválido (use 'regra' ou 'exemplo')" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ erro: e instanceof Error ? e.message : "erro" }, { status: 500 });
  }
}
